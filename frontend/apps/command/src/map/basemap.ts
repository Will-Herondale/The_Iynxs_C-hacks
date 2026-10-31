// The only file in the map that imports @setu/geo: offline basemap (bundled data, no network).
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { addBaseLayers, BASE_LAYER_IDS, createHtmlLabels, createOfflineStyle, loadGeoLayer, MAJULI_BOUNDS, MAJULI_CENTER, TERRAIN_LAYER_ID } from '@setu/geo';
import type { HtmlLabelHandle, LabelFeature } from '@setu/geo';
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

/** Zoom at which each kind of place gets its name: towns first, then villages, then ghats and other localities. */
const PLACE_LABEL: Record<string, { minZoom: number; priority: number }> = {
  town: { minZoom: 0, priority: 3 },
  village: { minZoom: 9.5, priority: 2 },
  locality: { minZoom: 11, priority: 1 },
};

/** Place names from the bundled OpenStreetMap data (REAL). HTML labels, so they work offline with no glyph server. */
export async function loadPlaceLabels(map: MlMap, extra: LabelFeature[] = []): Promise<HtmlLabelHandle> {
  const places = await loadGeoLayer('places');
  const features: LabelFeature[] = [];
  for (const f of places.features) {
    const p = (f.properties ?? {}) as { name?: string; place?: string; osm_id?: number };
    if (!p.name || f.geometry?.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const rule = PLACE_LABEL[p.place ?? ''] ?? PLACE_LABEL.locality!;
    features.push({ id: `place-${p.osm_id ?? p.name}`, lngLat: [lng, lat], text: p.name, kind: 'place', ...rule });
  }
  return createHtmlLabels(map as never, [...features, ...extra], { className: 'cmd-place-labels', boxWidth: 84, boxHeight: 16 });
}
