import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSelection, type Selection } from './selection';

export type ViewName = 'overview' | 'map' | 'settlements' | 'routes' | 'events' | 'audit';
export const VIEW_NAMES: ViewName[] = ['overview', 'map', 'settlements', 'routes', 'events', 'audit'];
export interface ViewApi {
  view: ViewName;
  setView(v: ViewName): void;
}

const Ctx = createContext<ViewApi>({ view: 'overview', setView: () => {} });

export function ViewProvider({ children, initial = 'overview' }: { children: ReactNode; initial?: ViewName }) {
  const [view, set] = useState<ViewName>(initial);
  const setView = useCallback((v: ViewName) => set(v), []);
  const value = useMemo(() => ({ view, setView }), [view, setView]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useView(): ViewApi {
  return useContext(Ctx);
}

/** Select a feature and optionally switch section in one step ("show on map" = goTo('map', sel)). */
export function useGoTo(): (view: ViewName, sel?: Selection) => void {
  const { setView } = useView();
  const { select } = useSelection();
  return useCallback(
    (view, sel) => {
      if (sel) select(sel);
      setView(view);
    },
    [select, setView],
  );
}
