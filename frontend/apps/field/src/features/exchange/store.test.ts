import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { newClientEventId, type FieldEvent } from '@setu/contract';
import { db } from '../../sync/db';
import { enqueue } from '../../sync/queue';
import { collectExportable, importEvents, readExchangeSummary, recordExport } from './store';

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

beforeEach(async () => {
  await db.queue.clear();
  await db.meta.clear();
});

describe('exchange store', () => {
  it('collects local and imported items without dropping any', async () => {
    await enqueue(ev());
    await importEvents([ev()]);
    const all = await collectExportable();
    expect(all).toHaveLength(2);
    expect(all.map((i) => i.origin)).toEqual([undefined, 'imported']);
  });

  it('imports with origin tag, keeps clientEventId, queues for sync', async () => {
    const e = ev();
    const [r] = await importEvents([e]);
    expect(r).toEqual({ clientEventId: e.clientEventId, result: 'accepted' });
    const row = await db.queue.get(e.clientEventId);
    expect(row).toMatchObject({ origin: 'imported', status: 'queued', event: e });
  });

  it('reports duplicates and never overwrites an existing local item', async () => {
    const e = ev();
    await enqueue(e);
    const [r] = await importEvents([e, e]).then((x) => x);
    expect(r.result).toBe('duplicate');
    expect((await db.queue.get(e.clientEventId))?.origin).toBeUndefined();
    expect(await db.queue.count()).toBe(1);
  });

  it('a failing event does not abort the rest', async () => {
    const good = ev();
    const bad = { ...ev(), type: 'nope' } as unknown as FieldEvent;
    const res = await importEvents([bad, good]);
    expect(res.map((r) => r.result)).toEqual(['rejected', 'accepted']);
    expect(res[0].errors?.length).toBeGreaterThan(0);
    expect(await db.queue.get(good.clientEventId)).toBeTruthy();
  });

  it('summary counts exported, imported, duplicates', async () => {
    const e = ev();
    await importEvents([e, ev()]);
    await importEvents([e]);
    await recordExport(3);
    expect(await readExchangeSummary()).toEqual({ exported: 3, imported: 2, duplicates: 1 });
  });
});
