import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApi } from '../app/api.js';
import { useSyncState } from '../sync/index.js';
import { cacheDb, writeRemoteEvents, type RemoteEventRow } from './cacheDb.js';

/**
 * Events received from the server (origin 'remote'), cached in their own Dexie table so they
 * stay readable offline. Refetched when online and whenever the shared version changes.
 */
export function useRemoteEvents(): RemoteEventRow[] {
  const api = useApi();
  const { online } = useSyncState();
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const load = async () => {
      try {
        const records = await api.listEvents({ limit: 200 });
        if (!cancelled) await writeRemoteEvents(records);
      } catch {
        /* keep serving the cached copy */
      }
    };
    void load();
    const unsub = api.subscribe(() => void load());
    return () => {
      cancelled = true;
      unsub();
    };
  }, [api, online]);
  return useLiveQuery(() => cacheDb.remoteEvents.orderBy('cachedAt').reverse().toArray(), [], []) ?? [];
}
