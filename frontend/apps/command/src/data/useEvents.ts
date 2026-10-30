import { useQuery } from '@tanstack/react-query';
import type { EventRecord } from '@setu/contract';
import { useApi } from './ApiProvider';
import { EVENTS_KEY, POLL_MS } from './useProjections';

export interface EventsResult {
  events: EventRecord[];
  isLoading: boolean;
  error: Error | null;
}

/** Event feed from listEvents (refetched on subscribe bumps, see useProjections). */
export function useEvents(): EventsResult {
  const api = useApi();
  const q = useQuery({
    queryKey: EVENTS_KEY,
    queryFn: () => api.listEvents(),
    refetchInterval: (query) => (query.state.status === 'error' ? POLL_MS : 15000),
  });
  return { events: q.data ?? [], isLoading: q.isLoading, error: q.error };
}
