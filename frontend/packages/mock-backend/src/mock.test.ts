import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NetworkError, ServerError, TimeoutError, NotImplementedError, newClientEventId, type FieldEvent, type ApiClient,
} from '@setu/contract';
import {
  MockStore, configureMock, createMockApiClient, createApiClientWithMock, createMemoryStorage, resetMockConfig,
  parseMockQuery, getMockConfig, type MockRelay, type MockSyncState,
} from './index.js';
import { scenarioRules } from './seed/index.js';

const base = () => ({
  clientEventId: newClientEventId(),
  occurredAt: '2026-10-30T10:00:00Z',
  reporterId: 'r1',
  deviceId: 'd1',
  location: { lat: 26.14, lng: 91.73 },
});
const blockage = (roadId: string): FieldEvent => ({ ...base(), type: 'road_blockage', roadId, blockage: 'full' });
const cleared = (roadId: string): FieldEvent => ({ ...base(), type: 'road_cleared', roadId });
const flood = (): FieldEvent => ({ ...base(), type: 'flood_report', severity: 3 });

let stores: MockStore[] = [];
function setup(opts: { relay?: MockRelay; channel?: string | false; storage?: ReturnType<typeof createMemoryStorage> } = {}) {
  const store = new MockStore({ rules: scenarioRules, storage: opts.storage ?? createMemoryStorage(), channel: opts.channel ?? false, relay: opts.relay });
  stores.push(store);
  return { store, api: createMockApiClient({ store }) };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetMockConfig(createMemoryStorage());
});
afterEach(() => {
  stores.forEach((s) => s.close());
  stores = [];
  vi.useRealTimers();
});

describe('idempotency', () => {
  it('second submit of the same clientEventId returns duplicate with the same eventId', async () => {
    const { api } = setup();
    const e = flood();
    const [a] = await api.submitEvents([e]);
    const [b] = await api.submitEvents([e]);
    expect(a?.result).toBe('accepted');
    expect(b).toEqual({ clientEventId: e.clientEventId, result: 'duplicate', eventId: (a as { eventId: string }).eventId });
  });
});

describe('two-step sync', () => {
  it('accepts immediately, applies only after the delay (default 1500ms)', async () => {
    const { api, store } = setup();
    const v0 = (await api.getProjections()).version;
    const e = flood();
    const [ack] = await api.submitEvents([e]);
    expect(ack).toMatchObject({ result: 'accepted', acceptedAtVersion: v0 + 1 });
    expect((await api.getEventStatus([e.clientEventId]))[0]).toMatchObject({ state: 'accepted' });
    expect(await api.listEvents()).toHaveLength(0);
    expect((await api.getProjections()).version).toBe(v0);

    await vi.advanceTimersByTimeAsync(1499);
    expect(store.version).toBe(v0);
    await vi.advanceTimersByTimeAsync(1);
    expect((await api.getEventStatus([e.clientEventId]))[0]).toMatchObject({ state: 'applied', projectionVersion: v0 + 1 });
    expect((await api.getProjections()).version).toBe(v0 + 1);
    const feed = await api.listEvents();
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ serverState: 'applied', appliedAtVersion: v0 + 1 });
  });

  it('honours configurable applyDelayMs and unknown ids', async () => {
    configureMock({ applyDelayMs: 100 }, createMemoryStorage());
    const { api } = setup();
    const e = flood();
    await api.submitEvents([e]);
    await vi.advanceTimersByTimeAsync(100);
    expect((await api.getEventStatus([e.clientEventId, 'nope']))[0]?.state).toBe('applied');
    expect((await api.getEventStatus(['nope']))[0]?.state).toBe('unknown');
  });

  it('applies the scripted rule: blockage -> road blocked (visible only after apply)', async () => {
    const { api } = setup();
    const roadId = 'R7';
    const before = await api.getProjections();
    const roadBefore = before.roads.features.find((f) => f.properties.roadId === roadId);
    const [ack] = await api.submitEvents([blockage(roadId)]);
    expect(ack?.result).toBe('accepted');
    await vi.advanceTimersByTimeAsync(1500);
    const after = await api.getProjections();
    const roadAfter = after.roads.features.find((f) => f.properties.roadId === roadId);
    expect(after.version).toBe(before.version + 1);
    expect(after.roads.version).toBe(after.version);
    expect(roadAfter?.properties.status).toBe('blocked');
    expect(roadBefore?.properties.status).not.toBe('blocked');
    expect(roadAfter?.properties.sourceEventIds.length).toBeGreaterThan(0);
  });

  it('versions advance one per applied event, FIFO', async () => {
    const { api, store } = setup();
    const v0 = store.version;
    const [a, b] = await api.submitEvents([flood(), flood()]);
    expect((a as { acceptedAtVersion: number }).acceptedAtVersion).toBe(v0 + 1);
    expect((b as { acceptedAtVersion: number }).acceptedAtVersion).toBe(v0 + 2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.version).toBe(v0 + 2);
  });

  it('persists to storage and resumes pending applies on reload', async () => {
    const storage = createMemoryStorage();
    const first = setup({ storage });
    const e = flood();
    await first.api.submitEvents([e]);
    first.store.close();
    const second = setup({ storage });
    expect(second.store.find(e.clientEventId)?.serverState).toBe('accepted');
    await vi.advanceTimersByTimeAsync(1500);
    expect(second.store.find(e.clientEventId)?.serverState).toBe('applied');
  });
});

describe('validation', () => {
  it('schema failures are rejected per item, others still accepted', async () => {
    const { api } = setup();
    const bad = { ...flood(), severity: 9 } as unknown as FieldEvent;
    const good = flood();
    const acks = await api.submitEvents([bad, good]);
    expect(acks[0]?.result).toBe('rejected');
    expect((acks[0] as { errors: { path: string }[] }).errors[0]?.path).toBe('severity');
    expect(acks[1]?.result).toBe('accepted');
    expect((await api.getEventStatus([bad.clientEventId]))[0]?.state).toBe('unknown');
  });
});

describe('failure injection', () => {
  it('offline -> NetworkError on every call and muted subscribe', async () => {
    const { api, store } = setup();
    configureMock({ offline: true }, createMemoryStorage());
    await expect(api.submitEvents([flood()])).rejects.toBeInstanceOf(NetworkError);
    await expect(api.getProjections()).rejects.toBeInstanceOf(NetworkError);
    await expect(api.listEvents()).rejects.toBeInstanceOf(NetworkError);
    await expect(api.getEventStatus([])).rejects.toBeInstanceOf(NetworkError);
    const cb = vi.fn();
    api.subscribe(cb);
    configureMock({ offline: false }, createMemoryStorage());
    const ok = createMockApiClient({ store });
    await ok.submitEvents([flood()]);
    configureMock({ offline: true }, createMemoryStorage());
    await vi.advanceTimersByTimeAsync(1500);
    expect(cb).not.toHaveBeenCalled();
  });

  it('failRate5xx=1 -> ServerError 503 (and nothing stored)', async () => {
    const { api, store } = setup();
    configureMock({ failRate5xx: 1 }, createMemoryStorage());
    const err = await api.submitEvents([flood()]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).status).toBe(503);
    expect(store.events).toHaveLength(0);
  });

  it('timeoutRate=1 -> TimeoutError', async () => {
    const { api } = setup();
    configureMock({ timeoutRate: 1 }, createMemoryStorage());
    await expect(api.getProjections()).rejects.toBeInstanceOf(TimeoutError);
  });

  it('seeded random controls probabilistic failures', async () => {
    const { api } = setup();
    const seq = [0.9, 0.1, 0.9, 0.9];
    configureMock({ failRate5xx: 0.5, random: () => seq.shift() ?? 0.9 }, createMemoryStorage());
    await expect(api.getProjections()).rejects.toBeInstanceOf(ServerError); // timeout draw .9, 5xx draw .1
    await expect(api.getProjections()).resolves.toBeTruthy();
  });

  it('latencyMs delays the response', async () => {
    const { api } = setup();
    configureMock({ latencyMs: 300 }, createMemoryStorage());
    let done = false;
    void api.getProjections().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('conflictRule: default rule flags a blockage on a road already cleared', async () => {
    const { api } = setup();
    configureMock({ conflictRule: true }, createMemoryStorage());
    await api.submitEvents([cleared('R3')]);
    const e = blockage('R3');
    const [ack] = await api.submitEvents([e]);
    expect(ack).toMatchObject({ result: 'conflict', clientEventId: e.clientEventId });
    expect((ack as { reason: string }).reason).toContain('R3');
    expect((await api.getEventStatus([e.clientEventId]))[0]?.state).toBe('conflict');
    await vi.advanceTimersByTimeAsync(1500);
    const feed = await api.listEvents();
    expect(feed.find((r) => r.event.clientEventId === e.clientEventId)?.serverState).toBe('conflict');
  });

  it('custom conflictRule and rejectRule give per-item acks', async () => {
    const { api } = setup();
    configureMock({
      conflictRule: (e) => (e.type === 'water_level' ? { reason: 'stale gauge', serverState: { levelCm: 5 } } : null),
      rejectRule: (e) => (e.type === 'flood_report' ? 'nope' : null),
    }, createMemoryStorage());
    const wl: FieldEvent = { ...base(), type: 'water_level', levelCm: 10, trend: 'rising' };
    const acks = await api.submitEvents([flood(), wl, blockage('R1')]);
    expect(acks.map((a) => a.result)).toEqual(['rejected', 'conflict', 'accepted']);
    expect(acks[1]).toMatchObject({ serverState: { levelCm: 5 } });
  });

  it('rejectRule: true rejects everything with validation errors', async () => {
    const { api } = setup();
    configureMock({ rejectRule: true }, createMemoryStorage());
    const [ack] = await api.submitEvents([flood()]);
    expect(ack?.result).toBe('rejected');
    expect((ack as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
  });

  it('?mock= query parsing and persisted toggle', () => {
    expect(parseMockQuery('off')).toBe('reset');
    expect(parseMockQuery('offline,latency:800,5xx:0.3,timeout:0.2,conflict,reject,delay:3000')).toEqual({
      offline: true, latencyMs: 800, failRate5xx: 0.3, timeoutRate: 0.2, conflictRule: true, rejectRule: true, applyDelayMs: 3000,
    });
    const storage = createMemoryStorage();
    configureMock({ offline: true, latencyMs: 5 }, storage);
    expect(getMockConfig().offline).toBe(true);
    expect(JSON.parse(storage.getItem('setu:mock-backend:config:v1') ?? '{}')).toMatchObject({ offline: true, latencyMs: 5 });
  });
});

describe('subscribe', () => {
  it('notifies on applied version bump, not on accept; unsubscribe works', async () => {
    const { api } = setup();
    const cb = vi.fn();
    const off = api.subscribe(cb);
    const v0 = (await api.getProjections()).version;
    await api.submitEvents([flood()]);
    expect(cb).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(cb).toHaveBeenCalledWith(v0 + 1);
    off();
    await api.submitEvents([flood()]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('BroadcastChannel carries state between stores (two tabs)', async () => {
    vi.useRealTimers();
    configureMock({ applyDelayMs: 0 }, createMemoryStorage());
    const a = setup({ channel: 'setu-mock-test' });
    const b = setup({ channel: 'setu-mock-test' });
    const got = new Promise<number>((res) => b.api.subscribe(res));
    const e = blockage('R7');
    await a.api.submitEvents([e]);
    const v = await got;
    expect(v).toBe(a.store.version);
    expect((await b.api.getProjections()).roads.features.find((f) => f.properties.roadId === 'R7')?.properties.status).toBe('blocked');
    expect((await b.api.getEventStatus([e.clientEventId]))[0]?.state).toBe('applied');
  });

  it('relay hook: publishes state on change and adopts remote state', async () => {
    let remoteCb: ((s: MockSyncState) => void) | undefined;
    const published: MockSyncState[] = [];
    const relay: MockRelay = { publish: (s) => void published.push(structuredClone(s)), subscribe: (cb) => ((remoteCb = cb), () => undefined) };
    const a = setup({ relay });
    const cb = vi.fn();
    a.api.subscribe(cb);
    await a.api.submitEvents([flood()]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(published.length).toBeGreaterThanOrEqual(2);
    const last = published[published.length - 1]!;
    expect(last.version).toBe(a.store.version);

    // another origin's tab (separate storage) adopts what the relay delivers
    const r2: MockRelay = { publish: () => undefined, subscribe: (c) => { remoteCb = c; return () => undefined; } };
    const b = setup({ relay: r2 });
    const cb2 = vi.fn();
    b.api.subscribe(cb2);
    remoteCb!(last);
    expect(cb2).toHaveBeenCalledWith(last.version);
    expect((await b.api.listEvents()).length).toBe(1);
  });
});

describe('factory', () => {
  it('createApiClientWithMock returns a working ApiClient; http mode still stubbed', async () => {
    const { store } = setup();
    const c: ApiClient = createApiClientWithMock({ store });
    expect((await c.getProjections()).version).toBe(store.version);
    expect(NotImplementedError).toBeDefined();
  });

  it('B1 submerged demo through the ApiClient: accepted first, then full projection change after the apply delay', async () => {
    const { store } = setup();
    const c: ApiClient = createApiClientWithMock({ store });
    const ev: FieldEvent = { ...blockage('B1'), cause: 'submerged' } as FieldEvent;
    const [ack] = await c.submitEvents([ev]);
    expect(ack?.result).toBe('accepted');
    const before = await c.getProjections();
    expect(before.roads.features.find((f) => f.properties.roadId === 'B1')?.properties.status).toBe('open');
    await vi.advanceTimersByTimeAsync(2000);
    const [st] = await c.getEventStatus([ev.clientEventId]);
    expect(st?.state).toBe('applied');
    const after = await c.getProjections();
    const b1 = after.roads.features.find((f) => f.properties.roadId === 'B1')!.properties;
    expect(b1).toMatchObject({ status: 'blocked', passability: 'impassable', kind: 'bridge' });
    const s4 = after.settlements.features.find((f) => f.properties.settlementId === 'S4')!.properties;
    expect(s4).toMatchObject({ accessibility: 'cut_off', evacuationPriority: 'critical' });
    expect(s4.cutOffReason?.blockingFeatureIds).toEqual(['B1']);
    expect(s4.evacuationDeadline).toBe('2026-10-30T13:00:00.000Z');
    const evac3 = after.routes.features.find((f) => f.properties.routeId === 'EVAC-3')!.properties;
    expect(evac3).toMatchObject({ status: 'unavailable' });
    expect(evac3.refusal?.blockingFeatureIds).toEqual(['B1']);
    expect(after.version).toBeGreaterThan(before.version);
  });
});
