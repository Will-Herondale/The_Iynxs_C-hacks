import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerError, TimeoutError, newClientEventId, type ApiClient, type FieldEvent } from '@setu/contract';
import { db } from './db';
import { runPass } from './engine';
import { enqueue } from './queue';
import { StorageWriteError, classifyStorageError, getStorageStatus } from '../offline/storage';

const ev = (): FieldEvent =>
  ({
    clientEventId: newClientEventId(),
    type: 'road_blockage',
    occurredAt: new Date().toISOString(),
    reporterId: 'r1',
    deviceId: 'd1',
    location: { lat: 1, lng: 2 },
    roadId: 'R7',
    blockage: 'full',
  }) as FieldEvent;

const apiFailing = (err: unknown) =>
  ({ submitEvents: vi.fn(async () => { throw err; }), getEventStatus: vi.fn(async () => []) }) as unknown as ApiClient & {
    submitEvents: ReturnType<typeof vi.fn>;
  };

beforeEach(async () => {
  await db.queue.clear();
  await db.meta.clear();
});

describe('pending is never discarded and the id is stable', () => {
  const cases: [string, unknown][] = [
    ['5xx', new ServerError(503)],
    ['timeout', new TimeoutError()],
    ['4xx (plain error, not a rejection ack)', Object.assign(new Error('HTTP 400'), { status: 400 })],
  ];
  for (const [name, err] of cases) {
    it(`survives ${name} and retries with the same clientEventId`, async () => {
      const e = ev();
      await enqueue(e);
      const api = apiFailing(err);
      await runPass(api, { rand: () => 0.5 });
      const it1 = await db.queue.get(e.clientEventId);
      expect(it1).toBeTruthy();
      expect(['queued', 'failed']).toContain(it1!.status);
      expect(it1!.lastError).toBeTruthy();
      // manual Sync now ignores backoff and non-retryable state
      await runPass(api, { force: true });
      expect(api.submitEvents).toHaveBeenCalledTimes(2);
      for (const call of api.submitEvents.mock.calls) {
        expect((call[0] as FieldEvent[]).map((x) => x.clientEventId)).toEqual([e.clientEventId]);
      }
      expect(await db.queue.count()).toBe(1);
    });
  }

  it('items survive a "reload" (fresh connection to the same IndexedDB)', async () => {
    const e = ev();
    await enqueue(e);
    await runPass(apiFailing(new ServerError(500)));
    db.close();
    await db.open();
    const it1 = await db.queue.get(e.clientEventId);
    expect(it1?.event.clientEventId).toBe(e.clientEventId);
    expect(['queued', 'failed']).toContain(it1!.status);
  });
});

describe('failed IndexedDB write is surfaced', () => {
  it('throws StorageWriteError, records it, and stores nothing', async () => {
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const spy = vi.spyOn(db.queue, 'add').mockRejectedValueOnce(quota);
    await expect(enqueue(ev())).rejects.toBeInstanceOf(StorageWriteError);
    spy.mockRestore();
    expect(getStorageStatus().lastWriteError?.kind).toBe('quota');
    expect(await db.queue.count()).toBe(0);
    // next successful write clears the banner state
    await enqueue(ev());
    expect(getStorageStatus().lastWriteError).toBeUndefined();
  });
  it('classifies errors', () => {
    expect(classifyStorageError({ name: 'QuotaExceededError' })).toBe('quota');
    expect(classifyStorageError({ name: 'DatabaseClosedError' })).toBe('unavailable');
    expect(classifyStorageError(new Error('x'))).toBe('unknown');
  });
});
