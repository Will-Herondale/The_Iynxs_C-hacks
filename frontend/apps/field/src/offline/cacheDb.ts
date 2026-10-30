import Dexie, { type Table } from 'dexie';
import type { ProjectionSnapshot } from '@setu/contract';

export type CachedSnapshotRow = { key: 'latest'; snapshot: ProjectionSnapshot; cachedAt: number };

/** Separate database from the sync queue so the cache can never disturb queued reports. */
class CacheDb extends Dexie {
  projections!: Table<CachedSnapshotRow, string>;
  constructor(name = 'setu-field-cache') {
    super(name);
    this.version(1).stores({ projections: 'key' });
  }
}

export const cacheDb = new CacheDb();

export async function readCachedSnapshot(): Promise<CachedSnapshotRow | undefined> {
  try {
    return await cacheDb.projections.get('latest');
  } catch {
    return undefined;
  }
}

export async function writeCachedSnapshot(snapshot: ProjectionSnapshot, cachedAt = Date.now()): Promise<void> {
  try {
    await cacheDb.projections.put({ key: 'latest', snapshot, cachedAt });
  } catch {
    /* cache is best-effort */
  }
}
