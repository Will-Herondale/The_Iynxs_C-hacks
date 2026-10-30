import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DataClassTag } from '@setu/ui';
import { TOGGLE_IDS, TOGGLE_LABELS, toggleDataClass, type ToggleId } from './layers';

export type ToggleState = Record<ToggleId, boolean>;
export interface MapLayersApi {
  visible: ToggleState;
  toggle(id: ToggleId): void;
}

export const DEFAULT_TOGGLES: ToggleState = {
  terrain: true, rivers: true, roads: true, settlements: true, shelters: true,
  flood: true, blocked: true, cutoff: true, observations: true, routes: true,
};

const Ctx = createContext<MapLayersApi>({ visible: DEFAULT_TOGGLES, toggle: () => {} });

export function MapLayersProvider({ children, initial }: { children: ReactNode; initial?: Partial<ToggleState> }) {
  const [visible, setVisible] = useState<ToggleState>({ ...DEFAULT_TOGGLES, ...initial });
  const toggle = useCallback((id: ToggleId) => setVisible((v) => ({ ...v, [id]: !v[id] })), []);
  const value = useMemo(() => ({ visible, toggle }), [visible, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMapLayers(): MapLayersApi {
  return useContext(Ctx);
}

/** Independent checkbox per map layer: `layer-toggle-<id>`. */
export function MapLayerControls() {
  const { visible, toggle } = useMapLayers();
  return (
    <fieldset aria-label="Map layers" data-testid="map-layer-controls" style={{ border: 0, margin: 0, padding: 0 }}>
      {TOGGLE_IDS.map((id) => (
        <label key={id} data-class={toggleDataClass(id)} style={{ display: 'block', padding: '2px 0' }}>
          <input
            type="checkbox"
            data-testid={`layer-toggle-${id}`}
            checked={visible[id]}
            aria-checked={visible[id]}
            onChange={() => toggle(id)}
          />{' '}
          {TOGGLE_LABELS[id]}{' '}
          <DataClassTag dataClass={toggleDataClass(id)} {...(id === 'flood' ? { label: 'Modelled · EXPERIMENTAL' } : {})} />
        </label>
      ))}
    </fieldset>
  );
}
