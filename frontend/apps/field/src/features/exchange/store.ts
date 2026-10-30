import { useLiveQuery } from 'dexie-react-hooks';
import type { FieldEvent } from '@setu/contract';
import { db, type QueueItem } from '../../sync/db';
import { enqueue } from '../../sync/queue';

const EXPORTED_KEY = 'exchange.exportedCount';
const DUPLICATES_KEY = 'exchange.duplicateCount';

/** Per-line outcome in the SubmitAck spirit (local save, not a server ack). */
export type ImportResult = {
  clientEventId: string;
  result: 'accepted' | 'duplicate' | 'rejected';
  errors?: { path: string; message: string }[];
};

export type ExchangeSummary = { exported: number; imported: number; duplicates: number };

/** Every queue item (local + previously imported, any status). Nothing is filtered out. */
export async function collectExportable(): Promise<QueueItem[]> {
  return db.queue.orderBy('createdAt').toArray();
}

export async function existingClientEventIds(): Promise<Set<string>> {
  return new Set((await db.queue.toCollection().primaryKeys()) as string[]);
}

async function bump(key: string, by: number): Promise<void> {
  if (by <= 0) return;
  await db.transaction('rw', db.meta, async () => {
    const cur = ((await db.meta.get(key))?.value as number | undefined) ?? 0;
    await db.meta.put({ key, value: cur + by });
  });
}

/** Record that `count` events were handed out in an export file. */
export async function recordExport(count: number): Promise<void> {
  await bump(EXPORTED_KEY, count);
}

/**
 * Saves accepted wire events through the idempotent enqueue path, tagged `origin: 'imported'`.
 * Already-known ids are reported `duplicate` and left untouched; failures are `rejected`
 * and never abort the rest of the batch. clientEventId is never changed.
 */
export async function importEvents(accepted: FieldEvent[]): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  let duplicates = 0;
  for (const event of accepted) {
    const id = event.clientEventId;
    try {
      if (await db.queue.get(id)) {
        duplicates++;
        results.push({ clientEventId: id, result: 'duplicate' });
        continue;
      }
      await enqueue(event);
      await db.queue.update(id, { origin: 'imported' });
      results.push({ clientEventId: id, result: 'accepted' });
    } catch (err) {
      results.push({
        clientEventId: id,
        result: 'rejected',
        errors: [{ path: '', message: err instanceof Error ? err.message : 'Could not save to this device' }],
      });
    }
  }
  await bump(DUPLICATES_KEY, duplicates);
  return results;
}

export async function readExchangeSummary(): Promise<ExchangeSummary> {
  const [exported, duplicates, imported] = await Promise.all([
    db.meta.get(EXPORTED_KEY),
    db.meta.get(DUPLICATES_KEY),
    db.queue.filter((i) => i.origin === 'imported').count(),
  ]);
  return { exported: (exported?.value as number) ?? 0, duplicates: (duplicates?.value as number) ?? 0, imported };
}

export function useExchangeSummary(): ExchangeSummary {
  return useLiveQuery(readExchangeSummary, [], { exported: 0, imported: 0, duplicates: 0 });
}
