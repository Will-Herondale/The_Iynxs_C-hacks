import Dexie, { type Table } from 'dexie';
import type { ClientSyncStatus, FieldEvent } from '@setu/contract';

export type QueueItem = {
  clientEventId: string; // = idempotency key, from newClientEventId()
  type: FieldEvent['type'];
  event: FieldEvent;
  status: ClientSyncStatus;
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string;
  eventId?: string;
  acceptedAtVersion?: number;
  conflict?: { reason: string; serverState?: unknown };
  validationErrors?: { path: string; message: string }[];
  /** Provenance: the clientEventId this item replaced (keep-mine resubmission or rejected→edit). */
  supersedes?: string;
  /** Provenance tag; absent = created on this device. 'imported' = merged from a JSONL exchange file. */
  origin?: 'local' | 'imported';
  createdAt: number;
  updatedAt: number;
};

/** Original item kept for provenance after being superseded; never synced. */
export type ArchivedItem = QueueItem & { supersededBy: string; archivedAt: number };

export type MetaRow = { key: string; value: unknown };

export class SyncDb extends Dexie {
  queue!: Table<QueueItem, string>;
  meta!: Table<MetaRow, string>;
  archive!: Table<ArchivedItem, string>;

  constructor(name = 'setu-field') {
    super(name);
    this.version(1).stores({
      queue: 'clientEventId, status, createdAt, nextAttemptAt',
      meta: 'key',
    });
    this.version(2).stores({
      queue: 'clientEventId, status, createdAt, nextAttemptAt',
      meta: 'key',
      archive: 'clientEventId, supersededBy',
    });
  }
}

export const db = new SyncDb();

export const LAST_SYNCED_KEY = 'lastSyncedAt';
