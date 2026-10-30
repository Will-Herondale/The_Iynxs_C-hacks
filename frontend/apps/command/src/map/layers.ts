import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import type { ProjectionSnapshot } from '@setu/contract';
import { LAYER_DATA_CLASS, type DataClass, type LayerKey } from '@setu/geo';
import { SETU_MAP_COLORS } from '@setu/ui';
import type { FeatureKind } from '../app';

/** Prefix of the registered observation icon images (one per server state). */
export const OBS_ICON_PREFIX = 'setu-obs-';

/** Feature kinds the map can select ('report' = an observation; id is the server eventId). */
export type MapFeatureKind = FeatureKind;
/** Source groups fed by server data. */
export type GroupName = 'flood' | 'roads' | 'settlements' | 'routes' | 'shelters' | 'observations';
export const GROUP_NAMES: GroupName[] = ['flood', 'roads', 'settlements', 'routes', 'shelters', 'observations'];

export const SOURCE_IDS: Record<GroupName, string> = {
  flood: 'src-flood',
  roads: 'src-roads',
  settlements: 'src-settlements',
  routes: 'src-routes',
  shelters: 'src-shelters',
  observations: 'src-observations',
};

/** Property carrying the feature id, per source group. */
export const ID_PROPERTY: Record<GroupName, string> = {
  flood: 'areaId',
  roads: 'roadId',
  settlements: 'settlementId',
  routes: 'routeId',
  shelters: 'shelterId',
  observations: 'eventId',
};

export const GROUP_KIND: Record<GroupName, MapFeatureKind> = {
  flood: 'flood',
  roads: 'road',
  settlements: 'settlement',
  routes: 'route',
  shelters: 'shelter',
  observations: 'report',
};

export const KIND_GROUP: Record<MapFeatureKind, GroupName> = {
  flood: 'flood',
  road: 'roads',
  settlement: 'settlements',
  route: 'routes',
  shelter: 'shelters',
  report: 'observations',
};

/** User-facing layer toggles (data-testid `layer-toggle-<id>`). */
export const TOGGLE_IDS = ['terrain', 'rivers', 'roads', 'settlements', 'shelters', 'flood', 'blocked', 'cutoff', 'observations', 'routes'] as const;
export type ToggleId = (typeof TOGGLE_IDS)[number];

export const TOGGLE_LABELS: Record<ToggleId, string> = {
  terrain: 'Terrain',
  rivers: 'Rivers & water',
  roads: 'Roads',
  settlements: 'Settlements',
  shelters: 'Shelters',
  flood: 'Flood extent',
  blocked: 'Blocked roads & bridges',
  cutoff: 'Cut-off settlements',
  observations: 'Observations (reports)',
  routes: 'Routes',
};

/** Overlay (snapshot-driven) layer ids per toggle. Basemap layers are added by basemap.ts. */
/** Single-source data class key (LAYER_DATA_CLASS) per toggle. Backend flood is modelled -> EXPERIMENTAL. */
export const TOGGLE_CLASS_KEY: Record<ToggleId, LayerKey> = {
  terrain: 'hillshade',
  rivers: 'waterways',
  roads: 'roads',
  settlements: 'settlements',
  shelters: 'shelters',
  flood: 'flood-modelled',
  blocked: 'road-status',
  cutoff: 'settlements',
  observations: 'settlements',
  routes: 'routes',
};
export const toggleDataClass = (id: ToggleId): DataClass => LAYER_DATA_CLASS[TOGGLE_CLASS_KEY[id]];

export const TOGGLE_LAYERS: Record<ToggleId, string[]> = {
  terrain: [],
  rivers: [],
  roads: ['roads-bridge-casing', 'roads-line', 'roads-line-minor', 'roads-synthetic'],
  settlements: ['settlements-circle', 'settlements-synthetic'],
  shelters: ['shelters-circle', 'shelters-synthetic'],
  flood: ['flood-fill', 'flood-outline', 'flood-outline-modelled', 'flood-uncertain'],
  blocked: ['roads-blocked', 'roads-blocking', 'flood-blocking'],
  cutoff: ['settlements-halo'],
  observations: ['observations-symbol'],
  routes: ['routes-recalc-glow', 'routes-line', 'routes-refused', 'routes-synthetic'],
};

/** Selection highlights stay visible whatever the toggles say, so a selected feature is never lost. */
export const ALWAYS_LAYERS = ['flood-selected', 'roads-selected', 'routes-selected', 'settlements-selected', 'shelters-selected', 'observations-selected'];

/** Layers that respond to click/hover (topmost first). */
export const INTERACTIVE_LAYERS = [
  'observations-symbol', 'settlements-circle', 'shelters-circle', 'routes-line', 'routes-refused',
  'roads-blocked', 'roads-line', 'roads-line-minor', 'flood-fill',
];

const LAYER_TO_GROUP: Record<string, GroupName> = {
  'observations-symbol': 'observations',
  'settlements-circle': 'settlements',
  'shelters-circle': 'shelters',
  'routes-line': 'routes',
  'routes-refused': 'routes',
  'roads-line': 'roads',
  'roads-line-minor': 'roads',
  'roads-blocked': 'roads',
  'flood-fill': 'flood',
};

/** Pure: map a clicked layer + its properties to a selection (undefined if not selectable). */
export function featureToSelection(
  layerId: string,
  properties: Record<string, unknown> | null | undefined,
): { kind: MapFeatureKind; id: string } | undefined {
  const group = LAYER_TO_GROUP[layerId];
  const id = group && properties?.[ID_PROPERTY[group]];
  return group && typeof id === 'string' ? { kind: GROUP_KIND[group], id } : undefined;
}

export { SETU_MAP_COLORS };

/**
 * Semantic colours (shared design system): blue water, red impassable, orange warning,
 * green safe, grey disconnected/unavailable, purple requires review.
 * warning/review fall back to local values until @setu/ui exports them.
 */
const palette = SETU_MAP_COLORS as Record<string, string>;
export const COLORS = {
  water: palette.flooded ?? '#1e88e5',
  critical: palette.blocked ?? '#c62828',
  warning: palette.warning ?? '#ef6c00',
  safe: palette.safe ?? '#2e7d32',
  review: palette.review ?? '#7b1fa2',
  grey: '#757575',
  greyLight: '#9e9e9e',
  observedFlood: '#0d47a1',
  modelledFlood: '#64b5f6',
  routeSupply: '#37474f',
  unverified: palette.unverified ?? '#e0a030',
  shelterOpen: '#00796b',
  shelterClosed: '#616161',
  blocking: '#ff6d00',
  selected: '#ffea00',
  observation: '#37474f',
} as const;

const isStatus = (s: string): ExpressionSpecification => ['==', ['get', 'status'], s];
const confidenceIs = (c: string): ExpressionSpecification => ['==', ['get', 'confidence'], c];

/** Blocked = server status 'blocked' or (proposed) passability 'impassable'. Read from properties, never derived. */
const isBlocked: ExpressionSpecification = ['any', isStatus('blocked'), ['==', ['get', 'passability'], 'impassable']];
const isBridge: ExpressionSpecification = ['==', ['get', 'kind'], 'bridge'];
const isPartial: ExpressionSpecification = isStatus('partial');
/** Open/unknown roads are the bulk of the layer: drawn from zoom 12 only, so the island overview stays readable. */
const isRoutine: ExpressionSpecification = ['any', isStatus('open'), isStatus('unknown')];

export const MINOR_ROAD_MIN_ZOOM = 12;

/** Flood fill: observed = solid strong blue; modelled = lighter blue; uncertain = faint orange; unstated = neutral. */
const floodFill: ExpressionSpecification = [
  'case',
  confidenceIs('observed'), COLORS.observedFlood,
  confidenceIs('modelled'), COLORS.modelledFlood,
  confidenceIs('uncertain'), COLORS.warning,
  '#90a4ae',
];
const floodOpacity: ExpressionSpecification = [
  'case',
  confidenceIs('uncertain'), 0.14,
  confidenceIs('observed'), ['interpolate', ['linear'], ['get', 'severity'], 1, 0.4, 5, 0.75],
  ['interpolate', ['linear'], ['get', 'severity'], 1, 0.2, 5, 0.5],
];

const roadStatusColor: ExpressionSpecification = [
  'match', ['get', 'status'],
  'open', COLORS.safe,
  'partial', COLORS.warning,
  'blocked', COLORS.critical,
  COLORS.grey,
];


const settlementColor: ExpressionSpecification = [
  'match', ['get', 'accessibility'],
  'accessible', COLORS.safe,
  'limited', COLORS.warning,
  'cut_off', COLORS.grey,
  COLORS.grey,
];

/** Shelter not open with capacity 0 and occupancy 0 = pre-identified, not confirmed. */
const preidentified: ExpressionSpecification = ['all', ['!', ['get', 'open']], ['==', ['get', 'capacity'], 0], ['==', ['get', 'occupancy'], 0]];

const noMatch: ExpressionSpecification = ['==', ['get', 'none'], '__none__'];

export const MAP_LAYERS: LayerSpecification[] = [
  { id: 'flood-fill', type: 'fill', source: SOURCE_IDS.flood, paint: { 'fill-color': floodFill, 'fill-opacity': floodOpacity } },
  {
    // Observed (and unstated) flood: solid outline.
    id: 'flood-outline', type: 'line', source: SOURCE_IDS.flood,
    filter: ['!', ['any', confidenceIs('modelled'), confidenceIs('uncertain')]],
    paint: { 'line-color': COLORS.observedFlood, 'line-width': ['case', confidenceIs('observed'), 2.5, 1] },
  },
  {
    // Modelled flood: thin dashed outline, visibly different from observed.
    id: 'flood-outline-modelled', type: 'line', source: SOURCE_IDS.flood, filter: confidenceIs('modelled'),
    paint: { 'line-color': '#1e88e5', 'line-width': 1.5, 'line-dasharray': [3, 2] },
  },
  {
    // Uncertain flood: orange dashed outline, faint fill.
    id: 'flood-uncertain', type: 'line', source: SOURCE_IDS.flood, filter: confidenceIs('uncertain'),
    paint: { 'line-color': COLORS.warning, 'line-width': 3, 'line-dasharray': [2, 1.5] },
  },
  {
    // Bridges get a dark casing so they read as a different symbol from roads.
    id: 'roads-bridge-casing', type: 'line', source: SOURCE_IDS.roads, filter: isBridge,
    layout: { 'line-cap': 'butt' },
    paint: { 'line-color': '#212121', 'line-width': 11 },
  },
  {
    id: 'roads-line-minor', type: 'line', source: SOURCE_IDS.roads, minzoom: MINOR_ROAD_MIN_ZOOM,
    filter: ['all', ['!', isBlocked], isRoutine],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': roadStatusColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 4] },
  },
  {
    id: 'roads-line', type: 'line', source: SOURCE_IDS.roads,
    filter: ['all', ['!', isBlocked], ['!', isRoutine]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': roadStatusColor, 'line-width': ['case', isPartial, 4.5, 3.5] },
  },
  {
    id: 'roads-blocked', type: 'line', source: SOURCE_IDS.roads, filter: isBlocked,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': COLORS.critical, 'line-width': 7, 'line-dasharray': [1.5, 1] },
  },
  {
    // Recalculated routes: soft glow underneath to make them stand out.
    id: 'routes-recalc-glow', type: 'line', source: SOURCE_IDS.routes, filter: isStatus('recalculated'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.unverified, 'line-width': 14, 'line-opacity': 0.25 },
  },
  {
    // Not verified: the frontend cannot tell a route was computed, so it is never drawn solid green.
    id: 'routes-line', type: 'line', source: SOURCE_IDS.routes, filter: ['!', isStatus('unavailable')],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': COLORS.unverified, 'line-width': ['case', isStatus('recalculated'), 6, 4], 'line-dasharray': [2, 1.5] },
  },
  {
    // Refused routes: grey, dashed, faded (unavailable). The blocking feature carries the red.
    id: 'routes-refused', type: 'line', source: SOURCE_IDS.routes, filter: isStatus('unavailable'),
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': COLORS.grey, 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [2, 2] },
  },
  {
    // Disconnected = grey dot + red halo.
    id: 'settlements-halo', type: 'circle', source: SOURCE_IDS.settlements,
    filter: ['==', ['get', 'accessibility'], 'cut_off'],
    paint: {
      'circle-radius': 20,
      'circle-color': COLORS.critical,
      'circle-opacity': 0.3,
      'circle-stroke-color': COLORS.critical,
      'circle-stroke-width': 2,
      'circle-stroke-opacity': 0.8,
    },
  },
  {
    id: 'roads-synthetic', type: 'line', source: SOURCE_IDS.roads, filter: ['==', ['get', 'synthetic'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#7b3fb0', 'line-width': 11, 'line-opacity': 0.28 },
  },
  {
    // Backend-flagged demo/fixture features (properties.synthetic === true): purple ring, so they never pass as real.
    id: 'settlements-synthetic', type: 'circle', source: SOURCE_IDS.settlements, filter: ['==', ['get', 'synthetic'], true],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 11, 13, 16], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#7b3fb0', 'circle-stroke-width': 3, 'circle-stroke-opacity': 0.9 },
  },
  {
    id: 'shelters-synthetic', type: 'circle', source: SOURCE_IDS.shelters, filter: ['==', ['get', 'synthetic'], true],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 12, 13, 17], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#7b3fb0', 'circle-stroke-width': 3, 'circle-stroke-opacity': 0.9 },
  },
  {
    id: 'routes-synthetic', type: 'line', source: SOURCE_IDS.routes, filter: ['==', ['get', 'synthetic'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#7b3fb0', 'line-width': 10, 'line-opacity': 0.28 },
  },
  {
    id: 'settlements-circle', type: 'circle', source: SOURCE_IDS.settlements,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 13, 9],
      'circle-color': settlementColor,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  },
  {
    id: 'shelters-circle', type: 'circle', source: SOURCE_IDS.shelters,
    paint: {
      // Radius grows with occupancy. Pre-identified (not open, 0/0) = hollow grey ring, not a "closed" shelter.
      'circle-radius': ['interpolate', ['linear'], ['get', 'occupancy'], 0, 7, 500, 12],
      'circle-color': ['case', ['get', 'open'], COLORS.shelterOpen, preidentified, 'rgba(255,255,255,0.55)', COLORS.shelterClosed],
      'circle-stroke-color': ['case', ['get', 'open'], '#ffffff', preidentified, COLORS.shelterClosed, '#ffffff'],
      'circle-stroke-width': ['case', preidentified, 3, 2],
    },
  },
  {
    // Report locations (from listEvents). Icon shape encodes server state; images are registered in MapView.
    id: 'observations-symbol', type: 'symbol', source: SOURCE_IDS.observations,
    layout: { 'icon-image': ['concat', OBS_ICON_PREFIX, ['get', 'serverState']], 'icon-allow-overlap': true, 'icon-size': 1 },
  },
  // Blocking-feature highlights: filter is replaced with the blockingFeatureIds of the selected settlement/route.
  { id: 'flood-blocking', type: 'line', source: SOURCE_IDS.flood, filter: noMatch, paint: { 'line-color': COLORS.blocking, 'line-width': 5 } },
  {
    id: 'roads-blocking', type: 'line', source: SOURCE_IDS.roads, filter: noMatch,
    paint: { 'line-color': COLORS.blocking, 'line-width': 16, 'line-opacity': 0.55 },
  },
  // Selection highlights: filter is replaced when selection changes.
  { id: 'flood-selected', type: 'line', source: SOURCE_IDS.flood, filter: noMatch, paint: { 'line-color': COLORS.selected, 'line-width': 4 } },
  {
    id: 'roads-selected', type: 'line', source: SOURCE_IDS.roads, filter: noMatch,
    paint: { 'line-color': COLORS.selected, 'line-width': 9, 'line-opacity': 0.6 },
  },
  {
    id: 'routes-selected', type: 'line', source: SOURCE_IDS.routes, filter: noMatch,
    paint: { 'line-color': COLORS.selected, 'line-width': 10, 'line-opacity': 0.6 },
  },
  {
    id: 'settlements-selected', type: 'circle', source: SOURCE_IDS.settlements, filter: noMatch,
    paint: { 'circle-radius': 15, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': COLORS.selected, 'circle-stroke-width': 4 },
  },
  {
    id: 'shelters-selected', type: 'circle', source: SOURCE_IDS.shelters, filter: noMatch,
    paint: { 'circle-radius': 17, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': COLORS.selected, 'circle-stroke-width': 4 },
  },
  {
    id: 'observations-selected', type: 'circle', source: SOURCE_IDS.observations, filter: noMatch,
    paint: { 'circle-radius': 15, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': COLORS.selected, 'circle-stroke-width': 4 },
  },
];

export function selectionFilter(group: GroupName, id: string | undefined): ExpressionSpecification {
  return id === undefined ? noMatch : ['==', ['get', ID_PROPERTY[group]], id];
}

/** Filter matching any of the given feature ids (blockingFeatureIds) within a layer group. */
export function idsFilter(group: GroupName, ids: readonly string[]): ExpressionSpecification {
  return ids.length === 0 ? noMatch : ['in', ['get', ID_PROPERTY[group]], ['literal', [...ids]]];
}

export const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

/** Snapshot-driven sources -> GeoJSON (rendered as-is; nothing is derived). */
export function snapshotSources(s: ProjectionSnapshot): Record<Exclude<GroupName, 'observations'>, unknown> {
  return { flood: s.flood, roads: s.roads, settlements: s.settlements, routes: s.routes, shelters: s.shelters };
}
