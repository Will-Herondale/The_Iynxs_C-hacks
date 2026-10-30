import { useCallback, useEffect, useState } from 'react';

export type Route = 'report' | 'household' | 'camp' | 'queue';
const ROUTES: Route[] = ['report', 'household', 'camp', 'queue'];

function read(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'report';
}

/** Hash routing; preserves the ?mock= query string. */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route) => {
    window.location.hash = `#/${r}`;
  }, []);
  return [route, go];
}
