import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NetworkError, ServerError, TimeoutError, newClientEventId, isConfirmedSynced, type ApiClient, type FieldEvent } from '@setu/contract';
import { createApiClient, createHttpApiClient, resolveApiMode } from './index.js';
import { createNodeEventSource, startFakeServer, type FakeServer } from './testing/index.js';

const flood = (over: Partial<FieldEvent> = {}): FieldEvent =>
  ({
    clientEventId: newClientEventId(), type: 'flood_report', occurredAt: '2026-10-30T10:00:00Z', reporterId: 'v1', deviceId: 'd1',
    location: { lat: 26.95, lng: 94.2, accuracyM: 10 }, severity: 3, depthCm: 110, ...over,
  }) as FieldEvent;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(10); } };

describe('createApiClient', () => {
  it('mock mode needs an adapter; defaults', () => {
    const adapter = {} as ApiClient;
    expect(createApiClient({ mode: 'mock', mockAdapter: adapter })).toBe(adapter);
    expect(() => createApiClient({ mode: 'mock' })).toThrow();
    expect(resolveApiMode('http')).toBe('http');
  });
});

describe('http adapter vs fake server', () => {
  let srv: FakeServer;
  let api: ApiClient;
  beforeEach(async () => {
    srv = await startFakeServer();
    api = createHttpApiClient({ baseUrl: srv.url, timeoutMs: 500, pollIntervalMs: 50, reconnectMinMs: 20, reconnectMaxMs: 40 });
  });
  afterEach(() => srv.close());

  it('starts empty', async () => {
    const s = await api.getProjections();
    expect(s.version).toBe(0);
    expect(s.flood.features).toEqual([]);
    expect(await api.listEvents()).toEqual([]);
  });

  it('submit → accepted at version, then applied; duplicate is idempotent', async () => {
    const e = flood();
    const [a] = await api.submitEvents([e]);
    expect(a).toMatchObject({ result: 'accepted', acceptedAtVersion: 1 });
    const [d] = await api.submitEvents([e]);
    expect(d).toMatchObject({ result: 'duplicate', eventId: (a as { eventId: string }).eventId });
    expect(srv.records).toHaveLength(1);
    const [st] = await api.getEventStatus([e.clientEventId, 'nope']);
    expect(st).toMatchObject({ state: 'applied', projectionVersion: 1 });
    expect((await api.getEventStatus(['nope']))[0]?.state).toBe('unknown');
    const recs = await api.listEvents({ type: 'flood_report', limit: 5 });
    expect(recs).toHaveLength(1);
    expect(isConfirmedSynced(1, (await api.getProjections()).version)).toBe(true);
  });

  it('two-step: accepted until apply delay elapses', async () => {
    srv.options.applyDelayMs = 80;
    const e = flood();
    const [a] = await api.submitEvents([e]);
    expect(a?.result).toBe('accepted');
    expect((await api.getEventStatus([e.clientEventId]))[0]?.state).toBe('accepted');
    expect((await api.getProjections()).version).toBe(0);
    await until(() => srv.version === 1);
    expect((await api.getEventStatus([e.clientEventId]))[0]?.state).toBe('applied');
  });

  it('invalid events and reject/conflict injection map to acks', async () => {
    srv.options.conflict = (e) => e.type === 'flood_report' && e.severity === 5;
    srv.options.reject = (e) => e.type === 'flood_report' && e.severity === 1;
    const bad = { ...flood(), severity: 99 } as FieldEvent;
    const acks = await api.submitEvents([bad, flood({ severity: 5 } as never), flood({ severity: 1 } as never), flood()]);
    expect(acks.map((a) => a.result)).toEqual(['rejected', 'conflict', 'rejected', 'accepted']);
    expect(srv.records).toHaveLength(3); // the invalid one never reached the server
  });

  it('4xx on the batch → rejected acks', async () => {
    const c = createHttpApiClient({ baseUrl: srv.url, fetch: async () => new Response('{}', { status: 400 }) });
    const e = flood();
    expect(await c.submitEvents([e])).toMatchObject([{ clientEventId: e.clientEventId, result: 'rejected' }]);
  });

  it('304 returns the cached snapshot', async () => {
    const s1 = await api.getProjections();
    const s2 = await api.getProjections(s1.version);
    expect(s2).toBe(s1);
    const fresh = createHttpApiClient({ baseUrl: srv.url });
    expect((await fresh.getProjections(0)).version).toBe(0); // 304 w/o cache → refetches full
  });

  it('maps failures to retryable errors', async () => {
    srv.options.fail5xx = 1;
    await expect(api.getProjections()).rejects.toBeInstanceOf(ServerError);
    await expect(api.getProjections()).resolves.toBeDefined();
    const down = createHttpApiClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 });
    await expect(down.getProjections()).rejects.toBeInstanceOf(NetworkError);
    srv.options.latencyMs = 300;
    const slow = createHttpApiClient({ baseUrl: srv.url, timeoutMs: 50 });
    await expect(slow.getProjections()).rejects.toBeInstanceOf(TimeoutError);
    const garbage = createHttpApiClient({ fetch: async () => new Response('{"x":1}') });
    await expect(garbage.getProjections()).rejects.toMatchObject({ status: 502 });
  });

  it('subscribe: SSE delivers version bumps', async () => {
    const seen: number[] = [];
    const c = createHttpApiClient({ baseUrl: srv.url, eventSource: createNodeEventSource });
    const off = c.subscribe((v) => seen.push(v));
    await until(() => seen.includes(0));
    await api.submitEvents([flood()]);
    await until(() => seen.includes(1));
    off();
  });

  it('subscribe: falls back to polling without EventSource, and when SSE fails', async () => {
    const seen: number[] = [];
    const off = api.subscribe((v) => seen.push(v)); // no global EventSource in node
    await until(() => seen.includes(0));
    await api.submitEvents([flood()]);
    await until(() => seen.includes(1));
    off();

    const seen2: number[] = [];
    const broken = createHttpApiClient({
      baseUrl: srv.url, pollIntervalMs: 30, reconnectMinMs: 20,
      eventSource: () => { const es = { onopen: null, onmessage: null, onerror: null, close() {} } as never as ReturnType<typeof createNodeEventSource>; setTimeout(() => es.onerror?.({}), 0); return es; },
    });
    const off2 = broken.subscribe((v) => seen2.push(v));
    await until(() => seen2.includes(1));
    off2();
  });
});
