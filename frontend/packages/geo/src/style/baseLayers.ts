import { HILLSHADE_COORDINATES } from './hillshadeExtent.js';
import { BASE_COLORS as C } from './colors.js';
import type { GeoLayerName } from '../types.js';
import type { GeoLoader, MapLike, OfflineStyleOptions, OfflineStyleSpec, StyleLayerSpec, StyleSourceSpec } from './types.js';

/** Source id per bundled geo layer used by the base style. Ids are prefixed to avoid app clashes. */
export const BASE_SOURCE_IDS = {
  island: 'setu-island',
  waterbodies: 'setu-waterbodies',
  waterways: 'setu-waterways',
  roads: 'setu-roads',
  ferries: 'setu-ferries',
} as const;

export const TERRAIN_SOURCE_ID = 'setu-hillshade';

const BASE_SOURCE_LAYERS = Object.keys(BASE_SOURCE_IDS) as (keyof typeof BASE_SOURCE_IDS)[];

const HIGHWAY = ['get', 'highway'];
const inClasses = (...c: string[]) => ['in', HIGHWAY, ['literal', c]];

/** Line width by road class, interpolated over zoom. */
const widthByClass = (base: number) => [
  'interpolate', ['linear'], ['zoom'],
  9, base * 0.5,
  14, base * 1.6,
  17, base * 3,
];

const ROAD_CLASSES: { id: string; classes: string[]; width: number; color: string; minzoom?: number }[] = [
  { id: 'trunk', classes: ['trunk', 'trunk_link', 'motorway', 'motorway_link'], width: 2.6, color: C.road.trunk },
  { id: 'primary', classes: ['primary', 'primary_link'], width: 2.2, color: C.road.primary },
  { id: 'secondary', classes: ['secondary', 'secondary_link'], width: 1.8, color: C.road.secondary },
  { id: 'tertiary', classes: ['tertiary', 'tertiary_link'], width: 1.4, color: C.road.tertiary, minzoom: 10 },
  { id: 'minor', classes: ['unclassified', 'residential', 'living_street', 'road'], width: 1, color: C.road.minor, minzoom: 12 },
];

/** Ordered base layers (bottom → top). Terrain layer is inserted right above the background when enabled. */
function baseLayerSpecs(): StyleLayerSpec[] {
  const layers: StyleLayerSpec[] = [
    { id: 'setu-background', type: 'background', paint: { 'background-color': C.background } },
    { id: 'setu-land', type: 'fill', source: BASE_SOURCE_IDS.island, paint: { 'fill-color': C.land } },
    { id: 'setu-waterbodies-fill', type: 'fill', source: BASE_SOURCE_IDS.waterbodies, paint: { 'fill-color': C.water, 'fill-outline-color': C.waterOutline } },
    {
      id: 'setu-waterways', type: 'line', source: BASE_SOURCE_IDS.waterways,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.waterway, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 2, 17, 4] },
    },
  ];
  for (const r of ROAD_CLASSES) {
    layers.push({
      id: `setu-road-${r.id}-casing`, type: 'line', source: BASE_SOURCE_IDS.roads,
      filter: inClasses(...r.classes), minzoom: r.minzoom,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.roadCasing, 'line-width': widthByClass(r.width + 1.2) },
    });
  }
  for (const r of ROAD_CLASSES) {
    layers.push({
      id: `setu-road-${r.id}`, type: 'line', source: BASE_SOURCE_IDS.roads,
      filter: inClasses(...r.classes), minzoom: r.minzoom,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': r.color, 'line-width': widthByClass(r.width) },
    });
  }
  layers.push(
    {
      id: 'setu-ferries', type: 'line', source: BASE_SOURCE_IDS.ferries,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': C.ferry, 'line-width': 1.6, 'line-dasharray': [3, 2] },
    },
    { id: 'setu-island-outline', type: 'line', source: BASE_SOURCE_IDS.island, paint: { 'line-color': C.landOutline, 'line-width': 1 } },
  );
  return layers;
}

export const BASE_LAYER_IDS: readonly string[] = baseLayerSpecs().map((l) => l.id);
export const TERRAIN_LAYER_ID = 'setu-hillshade-layer';

function hillshadeUrl(opts: OfflineStyleOptions): string {
  return opts.hillshadeUrl ?? new URL('../../data/hillshade.png', import.meta.url).href;
}

function hillshadeSource(opts: OfflineStyleOptions): StyleSourceSpec {
  // The image covers the whole AOI, NOT the island bounding box: placing it on MAJULI_BOUNDS squeezed the terrain into a
  // smaller rectangle (misregistered with the vector layers, blank outside it). Use the image's own corners.
  return { type: 'image', url: hillshadeUrl(opts), coordinates: HILLSHADE_COORDINATES };
}

const hillshadeLayer: StyleLayerSpec = {
  id: TERRAIN_LAYER_ID, type: 'raster', source: TERRAIN_SOURCE_ID,
  paint: { 'raster-opacity': 0.55, 'raster-fade-duration': 0 },
};

const emptyFc = () => ({ type: 'FeatureCollection', features: [] as unknown[] });

/**
 * Self-contained style: NO glyphs, NO sprite, NO tile/http URLs. GeoJSON sources start empty
 * (style creation is synchronous); call {@link addBaseLayers} / the returned data loader to fill them.
 * Text labels are drawn as HTML overlays — see createHtmlLabels.
 */
export function createOfflineStyle(opts: OfflineStyleOptions = {}): OfflineStyleSpec {
  const sources: Record<string, StyleSourceSpec> = {};
  for (const k of BASE_SOURCE_LAYERS) sources[BASE_SOURCE_IDS[k]] = { type: 'geojson', data: emptyFc() };
  const layers = baseLayerSpecs();
  if (opts.terrain) {
    sources[TERRAIN_SOURCE_ID] = hillshadeSource(opts);
    layers.splice(1, 0, hillshadeLayer);
  }
  return { version: 8, name: 'setu-offline-majuli', sources, layers };
}

/**
 * Ensure base sources/layers exist on `map` (works on a map created with or without createOfflineStyle)
 * and load the bundled data into the sources. Returns when all data is set.
 */
export async function addBaseLayers(
  map: MapLike,
  opts: OfflineStyleOptions & { load?: GeoLoader } = {},
): Promise<void> {
  const style = createOfflineStyle(opts);
  for (const [id, src] of Object.entries(style.sources)) if (!map.getSource(id)) map.addSource(id, src);
  for (const layer of style.layers) if (!map.getLayer(layer.id)) map.addLayer(layer);
  const load: GeoLoader = opts.load ?? (async (n: GeoLayerName) => (await import('../layers.js')).loadGeoLayer(n) as never);
  await Promise.all(
    BASE_SOURCE_LAYERS.map(async (k) => {
      const data = await load(k);
      (map.getSource(BASE_SOURCE_IDS[k]) as { setData?(d: unknown): void } | undefined)?.setData?.(data);
    }),
  );
}
