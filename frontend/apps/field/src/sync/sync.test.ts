import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NetworkError,
  NotImplementedError,
  ServerError,
  newClientEventId,
  type ApiClient,
  type EventStatus,
  type FieldEvent,
  type SubmitAck,
} from '@setu/contract';
import { db } from './db';
import { backoffMs } from './backoff';
import { confirmAccepted, recoverSending, runPass } from './engine';
import { discard, enqueue, replace, resolveConflict, retry } from './queue';

const ev = (over: Partial<FieldEvent> = {}): FieldEvent =>
  ({
    clientEventId: newClientEventId(),
    type: 'road_blockage',
    occurredAt: new Date().toISOString(),
    reporterId: 'r1',
    deviceId: 'd1',
    location: { lat: 1, lng: 2 },
    roadId: 'R7',
    blockage: 'full',
    ...over,
  }) as FieldEvent;

function fakeApi(o: Partial<ApiClient> = {}): ApiClient & { submitEvents: ReturnType<typeof vi.fn>; getEventStatus: ReturnType<typeof vi.fn> } {
  return {
    submitEvents: vi.fn(async (events: FieldEvent[]): Promise<SubmitAck[]> =>
      events.map((e, i) => ({ clientEventId: e.clientEventId, result: 'accepted', eventId: `E${i}`, acceptedAtVersion: 5 })),
    ),
    getEventStatus: vi.fn(async (ids: string[]): Promise<EventStatus[]> => ids.map((id) => ({ clientEventId: id, state: 'accepted' }))),
    getProjections: vi.fn(),
    listEvents: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    ...o,
  } as never;
}

const get = (id: string) => db.queue.get(id);
const fixed = { rand: () => 0.5 };

beforeEach(async () => {
  await db.queue.clear();
  await db.meta.clear();
});

describe('enqueue', () => {
  it('is idempotent on clientEventId', async () => {
    const e = ev();
    const [a, b] = await Promise.all([enqueue(e), enqueue(e)]);
    expect(a.clientEventId).toBe(b.clientEventId);
    expect(await db.queue.count()).toBe(1);
    expect((await get(e.clientEventId))?.status).toBe('queued');
  });
  it('rejects invalid payloads', async () => {
    await expect(enqueue({ ...ev(), blockage: 'bogus' } as never)).rejects.toThrow();
    expect(await db.queue.count()).toBe(0);
  });
});

describe('ack mapping and confirmation', () => {
  it('accepted is not synced until getEventStatus confirms version >= acceptedAtVersion', async () => {
    const e = ev();
    await enqueue(e);
    const api = fakeApi();
    await runPass(api, fixed);
    let it = await get(e.clientEventId);
    expect(it).toMatchObject({ status: 'accepted', eventId: 'E0', acceptedAtVersion: 5 });

    // applied but below the accepted version: still not synced
    api.getEventStatus.mockResolvedValueOnce([{ clientEventId: e.clientEventId, state: 'applied', projectionVersion: 4 }]);
    await confirmAccepted(api);
    expect((await get(e.clientEventId))?.status).toBe('accepted');

    api.getEventStatus.mockResolvedValueOnce([{ clientEventId: e.clientEventId, state: 'applied', projectionVersion: 5 }]);
    await confirmAccepted(api);
    it = await get(e.clientEventId);
    expect(it?.status).toBe('synced');
    expect((await db.meta.get('lastSyncedAt'))?.value).toBeTypeOf('number');
  });

  it('unknown status keeps accepted; confirmation error keeps accepted', async () => {
    const e = ev();
    await enqueue(e);
    const api = fakeApi();
    await runPass(api, fixed);
    api.getEventStatus.mockResolvedValueOnce([{ clientEventId: e.clientEventId, state: 'unknown' }]);
    await confirmAccepted(api);
    api.getEventStatus.mockRejectedValueOnce(new NetworkError());
    await confirmAccepted(api);
    expect((await get(e.clientEventId))?.status).toBe('accepted');
  });

  it('status conflict/rejected after acceptance moves the item', async () => {
    const a = ev();
    const b = ev();
    await enqueue(a);
    await enqueue(b);
    const api = fakeApi();
    await runPass(api, fixed);
    api.getEventStatus.mockResolvedValueOnce([
      { clientEventId: a.clientEventId, state: 'conflict' },
      { clientEventId: b.clientEventId, state: 'rejected' },
    ]);
    await confirmAccepted(api);
    expect((await get(a.clientEventId))?.status).toBe('conflict');
    expect((await get(b.clientEventId))?.status).toBe('rejected');
  });

  it('duplicate ack becomes accepted with eventId, then confirmed via status', async () => {
    const e = ev();
    await enqueue(e);
    const api = fakeApi({
      submitEvents: vi.fn(async (evs: FieldEvent[]) => evs.map((x) => ({ clientEventId: x.clientEventId, result: 'duplicate', eventId: 'ORIG' }))) as never,
    });
    await runPass(api, fixed);
    expect(await get(e.clientEventId)).toMatchObject({ status: 'accepted', eventId: 'ORIG' });
    api.getEventStatus.mockResolvedValueOnce([{ clientEventId: e.clientEventId, state: 'applied', projectionVersion: 9, eventId: 'ORIG' }]);
    await confirmAccepted(api);
    expect((await get(e.clientEventId))?.status).toBe('synced');
  });

  it('maps conflict and rejected acks', async () => {
    const c = ev();
    const r = ev();
    await enqueue(c);
    await enqueue(r);
    const api = fakeApi({
      submitEvents: vi.fn(async (): Promise<SubmitAck[]> => [
        { clientEventId: c.clientEventId, result: 'conflict', reason: 'already cleared', serverState: { x: 1 } },
        { clientEventId: r.clientEventId, result: 'rejected', errors: [{ path: 'note', message: 'bad' }] },
      ]) as never,
    });
    await runPass(api, fixed);
    expect(await get(c.clientEventId)).toMatchObject({ status: 'conflict', conflict: { reason: 'already cleared', serverState: { x: 1 } } });
    expect(await get(r.clientEventId)).toMatchObject({ status: 'rejected', validationErrors: [{ path: 'note', message: 'bad' }] });
    // neither is re-sent
    await runPass(api, fixed);
    expect(api.submitEvents).toHaveBeenCalledTimes(1);
  });
});

describe('failures and backoff', () => {
  it('schedule is 2s*2^n with jitter, capped at 5min', () => {
    expect(backoffMs(1, 0.5)).toBe(2000);
    expect(backoffMs(2, 0.5)).toBe(4000);
    expect(backoffMs(3, 0.5)).toBe(8000);
    expect(backoffMs(1, 0)).toBe(1600);
    expect(backoffMs(1, 1)).toBe(2400);
    expect(backoffMs(20, 0.99)).toBe(300000);
    expect(backoffMs(8, 0.5)).toBe(256000);
    expect(backoffMs(9, 0.5)).toBe(300000);
  });

  it('retryable error: whole batch failed, attempts+1, nextAttemptAt set, retried only once due', async () => {
    const a = ev();
    const b = ev();
    await enqueue(a);
    await enqueue(b);
    const api = fakeApi({ submitEvents: vi.fn().mockRejectedValue(new ServerError(503)) as never });
    await runPass(api, { now: () => 1000, rand: () => 0.5 });
    for (const x of [a, b]) {
      expect(await get(x.clientEventId)).toMatchObject({ status: 'failed', attempts: 1, nextAttemptAt: 3000, lastError: 'Server error 503' });
    }
    await runPass(api, { now: () => 2000, rand: () => 0.5 }); // not due
    expect(api.submitEvents).toHaveBeenCalledTimes(1);
    await runPass(api, { now: () => 3000, rand: () => 0.5 });
    expect(api.submitEvents).toHaveBeenCalledTimes(2);
    expect((await get(a.clientEventId))?.nextAttemptAt).toBe(3000 + 4000);
  });

  it('non-retryable error: failed with lastError, no auto retry', async () => {
    const a = ev();
    await enqueue(a);
    const api = fakeApi({ submitEvents: vi.fn().mockRejectedValue(new NotImplementedError('nope')) as never });
    await runPass(api, fixed);
    const it = await get(a.clientEventId);
    expect(it).toMatchObject({ status: 'failed', lastError: 'nope', attempts: 1 });
    expect(it?.nextAttemptAt).toBeUndefined();
    await runPass(api, { now: () => Date.now() + 10 * 60_000 });
    expect(api.submitEvents).toHaveBeenCalledTimes(1);
    await retry(a.clientEventId);
    expect((await get(a.clientEventId))?.status).toBe('queued');
  });

  it('batches at most 20 per call', async () => {
    for (let i = 0; i < 45; i++) await enqueue(ev());
    const api = fakeApi();
    await runPass(api, fixed);
    expect(api.submitEvents.mock.calls.map((c) => c[0].length)).toEqual([20, 20, 5]);
  });

  it('stops the pass after a transport failure', async () => {
    for (let i = 0; i < 25; i++) await enqueue(ev());
    const api = fakeApi({ submitEvents: vi.fn().mockRejectedValue(new NetworkError()) as never });
    await runPass(api, fixed);
    expect(api.submitEvents).toHaveBeenCalledTimes(1);
  });
});

describe('startup recovery', () => {
  it("reverts 'sending' to queued", async () => {
    const e = ev();
    await enqueue(e);
    await db.queue.update(e.clientEventId, { status: 'sending' });
    await recoverSending();
    expect((await get(e.clientEventId))?.status).toBe('queued');
  });
});

describe('queue actions', () => {
  it('discard removes the item', async () => {
    const e = ev();
    await enqueue(e);
    await discard(e.clientEventId);
    expect(await get(e.clientEventId)).toBeUndefined();
  });

  it('keep-mine resubmits as a new event referencing the original; accept-server drops it', async () => {
    const e = ev({ note: 'hi' });
    await enqueue(e);
    await db.queue.update(e.clientEventId, { status: 'conflict' });
    await resolveConflict(e.clientEventId, 'keep-mine');
    const all = await db.queue.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.clientEventId).not.toBe(e.clientEventId);
    expect(all[0]!.status).toBe('queued');
    expect(all[0]!.event.note).toContain(e.clientEventId);
    expect(all[0]!.event.note).toContain('hi');

    await db.queue.update(all[0]!.clientEventId, { status: 'conflict' });
    await resolveConflict(all[0]!.clientEventId, 'accept-server');
    expect(await db.queue.count()).toBe(0);
  });

  it('replace gives the edited event a new clientEventId', async () => {
    const e = ev();
    await enqueue(e);
    await db.queue.update(e.clientEventId, { status: 'rejected' });
    const n = await replace(e.clientEventId, { ...e, note: 'fixed' } as FieldEvent);
    expect(n.clientEventId).not.toBe(e.clientEventId);
    expect(n.event.note).toBe('fixed');
    expect(await db.queue.count()).toBe(1);
  });
});

describe('with the mock backend', () => {
  it('road_blockage goes queued → accepted → synced', async () => {
    const { createApiClientWithMock, configureMock, resetMock } = await import('@setu/mock-backend');
    resetMock();
    configureMock({ applyDelayMs: 0, latencyMs: 0 });
    const api = createApiClientWithMock();
    const e = ev();
    await enqueue(e);
    await runPass(api);
    await new Promise((r) => setTimeout(r, 20));
    await confirmAccepted(api);
    expect((await get(e.clientEventId))?.status).toBe('synced');
  });
});
