import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectionSnapshot } from '@setu/contract';
import { useApi } from './ApiProvider';

export type ConnectionState = 'live' | 'polling' | 'offline';

export const POLL_MS = 5000;
/** Safety refetch while live (e.g. the mock suppresses notifications while offline). */
export const LIVE_SAFETY_POLL_MS = 15000;
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

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = api.subscribe(() => {
        void qc.invalidateQueries({ queryKey: PROJECTIONS_KEY });
        void qc.invalidateQueries({ queryKey: EVENTS_KEY });
        void qc.invalidateQueries({ queryKey: ['eventStatuses'] });
      });
      setSubscribed(true);
    } catch {
      setSubscribed(false);
    }
    return () => unsub?.();
  }, [api, qc]);

  const q = useQuery({
    queryKey: PROJECTIONS_KEY,
    queryFn: () => api.getProjections(),
    refetchInterval: (query) => (!subscribed || query.state.status === 'error' ? POLL_MS : LIVE_SAFETY_POLL_MS),
  });

  const connection: ConnectionState = q.isError ? 'offline' : subscribed ? 'live' : 'polling';
  return {
    snapshot: q.data,
    version: q.data?.version,
    connection,
    isLoading: q.isLoading,
    error: q.error,
  };
}
