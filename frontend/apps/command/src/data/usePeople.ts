import { useQuery } from '@tanstack/react-query';
import type { PeopleSnapshot } from '@setu/contract';
import { useApi } from './ApiProvider';
import { POLL_MS } from './useProjections';

export const PEOPLE_KEY = ['people'] as const;

export interface PeopleResult {
  snapshot?: PeopleSnapshot;
  isLoading: boolean;
  error: Error | null;
  /** False when the configured client predates the people endpoint. */
  supported: boolean;
}

/**
 * Per-camp check-in counts and duplicate suggestions. Polled like the
 * projections; the payload is deliberately outside ProjectionSnapshot.
 */
export function usePeople(): PeopleResult {
  const api = useApi();
  const supported = typeof api.getPeople === 'function';
  const q = useQuery({
    queryKey: PEOPLE_KEY,
    queryFn: async (): Promise<PeopleSnapshot | undefined> =>
      api.getPeople ? api.getPeople() : undefined,
    refetchInterval: POLL_MS,
    enabled: supported,
  });
  return {
    snapshot: q.data,
    isLoading: q.isLoading,
    error: q.error,
    supported,
  };
}
