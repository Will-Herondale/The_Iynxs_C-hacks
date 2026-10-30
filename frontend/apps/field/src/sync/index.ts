// STUB written by the lead so the app compiles. Helper 1 (sync-engine) OVERWRITES this file.
import type { ApiClient, ClientSyncStatus, FieldEvent } from '@setu/contract';

export type QueueItem = {
  clientEventId: string;
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
const nope = (): never => { throw new Error('sync stub'); };
export const enqueue = async (_e: FieldEvent): Promise<QueueItem> => nope();
export const retry = async (_id: string): Promise<void> => nope();
export const discard = async (_id: string): Promise<void> => nope();
export const resolveConflict = async (_id: string, _c: 'keep-mine' | 'accept-server'): Promise<void> => nope();
export const replace = async (_id: string, _e: FieldEvent): Promise<QueueItem> => nope();
export const useQueue = (_f?: ClientSyncStatus[]): QueueItem[] => [];
export const useSyncState = (): { online: boolean; syncing: boolean; lastSyncedAt?: number; pendingCount: number } => ({ online: true, syncing: false, pendingCount: 0 });
export const startSyncEngine = (_api: ApiClient): (() => void) => () => {};
export const syncNow = async (): Promise<void> => {};
