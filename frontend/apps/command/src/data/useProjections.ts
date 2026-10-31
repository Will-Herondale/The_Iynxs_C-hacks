import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectionSnapshot } from '@setu/contract';
import { useApi } from './ApiProvider';

export type ConnectionState = 'live' | 'polling' | 'offline' | 'unavailable';

export const POLL_MS = 5000;
/** Safety refetch while live (e.g. the mock suppresses notifications while offline). */
export const LIVE_SAFETY_POLL_MS = 15000;
/** Tolerate transient SSE/poll failures before flipping to 'unavailable'. */
export const CONNECTION_FAILURES_TO_DECLARE = 2;
export const PROJECTIONS_KEY = ['projections'] as const;
export const EVENTS_KEY = ['events'] as const;

export interface ProjectionsResult {
  snapshot?: ProjectionSnapshot;
  version?: number;
  connection: ConnectionState;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Server snapshot. subscribe() version bumps invalidate the query (and the event feed).
 * If subscribe() throws we fall back to polling every 5s. Fetch failures => 'offline'
 * (previous snapshot stays visible).
 */
export function useProjections(): ProjectionsResult {
  const api = useApi();
  const qc = useQueryClient();
  const [subscribed, setSubscribed] = useState(true);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void qc.invalidateQueries({ queryKey: PROJECTIONS_KEY });
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [qc]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = api.subscribe((streamVersion) => {
        // The initial stream frame can arrive while the first query is still
        // loading. Ignore it until a snapshot exists; refetch real bumps only.
        const current = qc.getQueryData<ProjectionSnapshot>(PROJECTIONS_KEY);
        if (!current || streamVersion <= current.version) return;
        const keep = { cancelRefetch: false } as const;
        void qc.invalidateQueries({ queryKey: PROJECTIONS_KEY }, keep);
        void qc.invalidateQueries({ queryKey: EVENTS_KEY }, keep);
        void qc.invalidateQueries({ queryKey: ['eventStatuses'] }, keep);
      });
      setSubscribed(true);
    } catch {
      setSubscribed(false);
    }
    return () => unsub?.();
  }, [api, qc]);

  // Consecutive projection fetch failures. A single SSE drop or poll failure
  // must not flip the whole app to 'unavailable'.
  const consecutiveFailures = useRef(0);

  const q = useQuery({
    queryKey: PROJECTIONS_KEY,
    queryFn: async () => {
      try {
        consecutiveFailures.current = 0;
        return await api.getProjections();
      } catch (err) {
        consecutiveFailures.current += 1;
        throw err;
      }
    },
    refetchInterval: (query) => (!subscribed || query.state.status === 'error' ? POLL_MS : LIVE_SAFETY_POLL_MS),
  });

  const connection: ConnectionState =
    !online ? 'offline' : q.isError ? 'unavailable' : subscribed ? 'live' : 'polling';
  return {
    snapshot: q.data,
    version: q.data?.version,
    connection,
    isLoading: q.isLoading,
    error: q.error,
  };
}
