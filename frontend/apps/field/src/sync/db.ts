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
  createdAt: number;
  updatedAt: number;
};

export type MetaRow = { key: string; value: unknown };

export class SyncDb extends Dexie {
  queue!: Table<QueueItem, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'setu-field') {
    super(name);
    this.version(1).stores({
      queue: 'clientEventId, status, createdAt, nextAttemptAt',
      meta: 'key',
    });
  }
}

export const db = new SyncDb();

export const LAST_SYNCED_KEY = 'lastSyncedAt';
