import { useQuery } from '@tanstack/react-query';
import type { EventStatus } from '@setu/contract';
import { useApi } from './ApiProvider';

/** getEventStatus for the given clientEventIds, keyed by clientEventId. */
export function useEventStatuses(ids: string[]): { statuses: Record<string, EventStatus>; isLoading: boolean; error: Error | null } {
  const api = useApi();
  const key = [...ids].sort();
  const q = useQuery({
    queryKey: ['eventStatuses', key],
    queryFn: () => api.getEventStatus(key),
    enabled: key.length > 0,
  });
  const statuses: Record<string, EventStatus> = {};
  for (const s of q.data ?? []) statuses[s.clientEventId] = s;
  return { statuses, isLoading: q.isLoading, error: q.error };
}
