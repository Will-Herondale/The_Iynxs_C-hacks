import { useCallback, useEffect, useState } from 'react';

export type RouteName = 'home' | 'report' | 'map' | 'households' | 'sync' | 'camp';
export interface Route {
  name: RouteName;
  /** `#/report/<clientEventId>` → detail; `#/households/new` → open the registration form. */
  param?: string;
}

const NAMES: RouteName[] = ['home', 'report', 'map', 'households', 'sync', 'camp'];
/** Pre-v3 hashes keep working. */
const ALIASES: Record<string, RouteName> = { household: 'households', queue: 'sync' };

export function parseHash(hash: string): Route {
  const [head = '', ...rest] = hash.replace(/^#\/?/, '').split('/');
  const aliased = ALIASES[head];
  const name: RouteName = aliased ?? ((NAMES as string[]).includes(head) ? (head as RouteName) : 'home');
  const param = rest.join('/') || undefined;
  return param ? { name, param } : { name };
}

const read = (): Route => parseHash(window.location.hash);

/** Hash routing; preserves the ?mock= query string. */
export function useRoute(): [Route, (path: string) => void] {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((path: string) => {
    window.location.hash = `#/${path}`;
  }, []);
  return [route, go];
}
