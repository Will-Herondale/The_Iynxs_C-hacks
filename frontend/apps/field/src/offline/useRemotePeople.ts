import { useEffect, useState } from 'react';
import type { PeopleSnapshot } from '@setu/contract';
import { useApi } from '../app/api.js';
import { useSyncState } from '../sync/index.js';

export interface RemotePeople {
  snapshot?: PeopleSnapshot;
  loading: boolean;
  unavailable: boolean;
}

/**
 * Server-backed people data for Camp mode. Local queue rows are still shown
 * immediately; this supplies records accepted from every device once online.
 */
export function useRemotePeople(): RemotePeople {
  const api = useApi();
  const { online } = useSyncState();
  const [state, setState] = useState<RemotePeople>({ loading: false, unavailable: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!api.getPeople || !online) return;
      setState((s) => ({ ...s, loading: !s.snapshot, unavailable: false }));
      try {
        const snapshot = await api.getPeople();
        if (!cancelled) setState({ snapshot, loading: false, unavailable: false });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false, unavailable: true }));
      }
    };
    void load();
    const unsubscribe = api.subscribe(() => void load());
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [api, online]);

  return state;
}
