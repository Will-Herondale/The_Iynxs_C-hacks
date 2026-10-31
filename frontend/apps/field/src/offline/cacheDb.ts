import Dexie, { type Table } from 'dexie';
import type { EventRecord, ProjectionSnapshot } from '@setu/contract';

export type CachedSnapshotRow = { key: 'latest'; snapshot: ProjectionSnapshot; cachedAt: number };

/** Events received from the server via listEvents. Never mixed into the local sync queue. */
export type RemoteEventRow = EventRecord & { origin: 'remote'; cachedAt: number };

/** Separate database from the sync queue so the cache can never disturb queued reports. */
class CacheDb extends Dexie {
  projections!: Table<CachedSnapshotRow, string>;
  remoteEvents!: Table<RemoteEventRow, string>;
  constructor(name = 'setu-field-cache') {
    super(name);
    this.version(1).stores({ projections: 'key' });
    this.version(2).stores({ projections: 'key', remoteEvents: 'eventId, cachedAt' });
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

export async function writeRemoteEvents(records: EventRecord[], cachedAt = Date.now()): Promise<void> {
  try {
    await cacheDb.transaction('rw', cacheDb.remoteEvents, async () => {
      await cacheDb.remoteEvents.bulkPut(records.map((r) => ({ ...r, origin: 'remote' as const, cachedAt })));
    });
  } catch {
    /* cache is best-effort */
  }
}
