import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** 'report' = an event record; id is the server eventId. Bridges are 'road' (RoadProps.kind === 'bridge'). */
export type FeatureKind = 'road' | 'settlement' | 'route' | 'shelter' | 'flood' | 'report';
export interface Selection {
  kind: FeatureKind;
  id: string;
}
export interface SelectionApi {
  selected?: Selection;
  select(sel?: Selection): void;
}

const Ctx = createContext<SelectionApi>({ select: () => {} });

/** Selection shared by every section and by the map. */
export function SelectionProvider({ children, initial }: { children: ReactNode; initial?: Selection }) {
  const [selected, setSelected] = useState<Selection | undefined>(initial);
  const select = useCallback((sel?: Selection) => setSelected(sel), []);
  const value = useMemo(() => ({ selected, select }), [selected, select]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelection(): SelectionApi {
  return useContext(Ctx);
}
