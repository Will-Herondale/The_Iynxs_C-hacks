import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ViewName = 'map' | 'audit';
export interface ViewApi {
  view: ViewName;
  setView(v: ViewName): void;
}

const Ctx = createContext<ViewApi>({ view: 'map', setView: () => {} });

export function ViewProvider({ children, initial = 'map' }: { children: ReactNode; initial?: ViewName }) {
  const [view, set] = useState<ViewName>(initial);
  const setView = useCallback((v: ViewName) => set(v), []);
  const value = useMemo(() => ({ view, setView }), [view, setView]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Top-level Map | Audit view. Audit "show on map" = setView('map') + select(feature). */
export function useView(): ViewApi {
  return useContext(Ctx);
}
