import { useEffect, useState } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';
import { useApi } from '../app/api.js';
import { useSyncState } from '../sync/index.js';
import { readCachedSnapshot, writeCachedSnapshot } from './cacheDb.js';

export interface CachedProjections {
  snapshot?: ProjectionSnapshot;
  /** epoch ms when `snapshot` was last fetched from the server */
  cachedAt?: number;
  /** true when the snapshot is being served from the cache rather than fresh from the server */
  stale: boolean;
}

/**
 * Projection snapshot for forms and camp mode. Fetches via the ApiClient when online
 * (and again whenever the shared version changes), persists the last snapshot to
 * IndexedDB, and serves that cache when offline or when a fetch fails.
 */
export function useCachedProjections(): CachedProjections {
  const api = useApi();
  const { online } = useSyncState();
  const [state, setState] = useState<{ snapshot?: ProjectionSnapshot; cachedAt?: number; fresh: boolean }>({ fresh: false });

  useEffect(() => {
    let cancelled = false;
    const loadCache = async () => {
      const row = await readCachedSnapshot();
      if (!cancelled && row) setState((s) => (s.snapshot ? s : { snapshot: row.snapshot, cachedAt: row.cachedAt, fresh: false }));
    };
    const fetchFresh = async () => {
      try {
        const snapshot = await api.getProjections();
        const cachedAt = Date.now();
        await writeCachedSnapshot(snapshot, cachedAt);
        if (!cancelled) setState({ snapshot, cachedAt, fresh: true });
      } catch {
        if (!cancelled) {
          await loadCache();
          setState((s) => ({ ...s, fresh: false }));
        }
      }
    };
    void loadCache();
    if (!online) {
      setState((s) => ({ ...s, fresh: false }));
      return () => {
        cancelled = true;
      };
    }
    void fetchFresh();
    const unsubscribe = api.subscribe(() => void fetchFresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [api, online]);

  return { snapshot: state.snapshot, cachedAt: state.cachedAt, stale: !state.fresh };
}
