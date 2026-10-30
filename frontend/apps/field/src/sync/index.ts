import { useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ApiClient, ClientSyncStatus } from '@setu/contract';
import { confirmAccepted, recoverSending, runPass } from './engine';
import { db, LAST_SYNCED_KEY, type ArchivedItem, type QueueItem } from './db';
import { setKick } from './queue';

export type { QueueItem, ArchivedItem } from './db';
export { enqueue, retry, discard, resolveConflict, replace } from './queue';
export { backoffMs } from './backoff';

const POLL_MS = 15_000;

type Snapshot = { online: boolean; syncing: boolean };
let snap: Snapshot = { online: typeof navigator === 'undefined' ? true : navigator.onLine, syncing: false };
const listeners = new Set<() => void>();
const setSnap = (p: Partial<Snapshot>) => {
  snap = { ...snap, ...p };
  listeners.forEach((l) => l());
};

let activeApi: ApiClient | null = null;
let running = false;

async function withLock(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks?.request) {
    // ifAvailable: another tab is already syncing; skip rather than queue up.
    await locks.request('setu-field-sync', { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
  } else {
    await fn();
  }
}

export async function syncNow(): Promise<void> {
  const api = activeApi;
  if (!api || running || !snap.online) return;
  running = true;
  setSnap({ syncing: true });
  try {
    await withLock(() => runPass(api));
  } catch {
    // runPass handles API errors; a Dexie failure must not kill the loop.
  } finally {
    running = false;
    setSnap({ syncing: false });
  }
}

export function startSyncEngine(api: ApiClient): () => void {
  activeApi = api;
  setKick(() => void syncNow());
  setSnap({ online: navigator.onLine });

  const onOnline = () => {
    setSnap({ online: true });
    // Backoff exists to spare a flaky link; connectivity just returned, so retry now.
    void db.queue
      .where('status')
      .anyOf('queued', 'failed')
      .modify((it) => {
        if (it.nextAttemptAt !== undefined) it.nextAttemptAt = Date.now();
      })
      .then(syncNow);
  };
  const onOffline = () => setSnap({ online: false });
  const onSwMessage = (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === 'sync') void syncNow();
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  navigator.serviceWorker?.addEventListener('message', onSwMessage);

  const timer = setInterval(() => void syncNow(), POLL_MS);
  const unsub = api.subscribe(() => {
    if (snap.online) void confirmAccepted(api);
  });
  void recoverSending().then(syncNow);

  return () => {
    clearInterval(timer);
    unsub();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    setKick(() => {});
    if (activeApi === api) activeApi = null;
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnap = () => snap;

export function useQueue(filter?: ClientSyncStatus[]): QueueItem[] {
  const key = filter ? [...filter].sort().join(',') : '';
  return (
    useLiveQuery(async () => {
      const all = await db.queue.orderBy('createdAt').reverse().toArray();
      return filter && filter.length ? all.filter((i) => filter.includes(i.status)) : all;
    }, [key]) ?? []
  );
}

/** One queue item by clientEventId (live), or its archived/superseded original. */
export function useQueueItem(id: string | undefined): { item?: QueueItem; archived?: ArchivedItem; loading: boolean } {
  const res = useLiveQuery(
    async () => (id ? { item: await db.queue.get(id), archived: await db.archive.get(id) } : {}),
    [id],
  );
  return { item: res?.item, archived: res?.archived, loading: res === undefined };
}

/** All archived (superseded) originals. */
export function useArchive(): ArchivedItem[] {
  return useLiveQuery(() => db.archive.toArray(), []) ?? [];
}

export function useSyncState(): { online: boolean; syncing: boolean; lastSyncedAt?: number; pendingCount: number } {
  const s = useSyncExternalStore(subscribe, getSnap, getSnap);
  const pendingCount = useLiveQuery(() => db.queue.where('status').notEqual('synced').count(), [], 0);
  const lastSyncedAt = useLiveQuery(async () => (await db.meta.get(LAST_SYNCED_KEY))?.value as number | undefined, []);
  return { online: s.online, syncing: s.syncing, lastSyncedAt, pendingCount };
}
