import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type LayerName = 'flood' | 'roads' | 'settlements' | 'routes' | 'shelters';
export const LAYER_NAMES: LayerName[] = ['flood', 'roads', 'settlements', 'routes', 'shelters'];
export interface LayerVisibilityApi {
  visible: Record<LayerName, boolean>;
  toggle(layer: LayerName): void;
}

const allOn: Record<LayerName, boolean> = { flood: true, roads: true, settlements: true, routes: true, shelters: true };
const Ctx = createContext<LayerVisibilityApi>({ visible: allOn, toggle: () => {} });

export function LayerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(allOn);
  const toggle = useCallback((layer: LayerName) => setVisible((v) => ({ ...v, [layer]: !v[layer] })), []);
  const value = useMemo(() => ({ visible, toggle }), [visible, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLayerVisibility(): LayerVisibilityApi {
  return useContext(Ctx);
}
