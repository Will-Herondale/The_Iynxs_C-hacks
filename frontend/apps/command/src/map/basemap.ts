// The only file in the map that imports @setu/geo: offline basemap (bundled data, no network).
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { addBaseLayers, BASE_LAYER_IDS, createOfflineStyle, MAJULI_BOUNDS, MAJULI_CENTER, TERRAIN_LAYER_ID } from '@setu/geo';
import type { ToggleId } from './layers';

export const BASE_BOUNDS = MAJULI_BOUNDS;
export const BASE_CENTER = MAJULI_CENTER;

/** Offline style with the hillshade image source; every URL is bundled/same-origin. */
export function offlineStyle(): StyleSpecification {
  return createOfflineStyle({ terrain: true }) as unknown as StyleSpecification;
}

/** Fill the basemap sources from the bundled GeoJSON (idempotent). */
export function loadBasemap(map: MlMap): Promise<void> {
  return addBaseLayers(map as never);
}

/** Basemap layer ids a user toggle controls (island, land and outline always stay). */
export function baseLayerIds(toggle: ToggleId): string[] {
  switch (toggle) {
    case 'terrain': return [TERRAIN_LAYER_ID];
    case 'rivers': return BASE_LAYER_IDS.filter((id) => /^setu-(waterbodies|waterways)/.test(id));
    case 'roads': return BASE_LAYER_IDS.filter((id) => id.startsWith('setu-road-'));
    default: return [];
  }
}
