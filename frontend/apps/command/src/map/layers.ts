import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import type { ProjectionSnapshot } from '@setu/contract';
import type { FeatureKind } from '../app';
import type { LayerName } from '../app';

/** Seed scenario centre (Guwahati), [lng, lat]. */
export const MAP_CENTER: [number, number] = [91.73, 26.14];
export const MAP_ZOOM = 11;

export const SOURCE_IDS = {
  flood: 'src-flood',
  roads: 'src-roads',
  settlements: 'src-settlements',
  routes: 'src-routes',
  shelters: 'src-shelters',
} as const satisfies Record<LayerName, string>;

/** Property carrying the feature id, per layer group. */
export const ID_PROPERTY: Record<LayerName, string> = {
  flood: 'areaId',
  roads: 'roadId',
  settlements: 'settlementId',
  routes: 'routeId',
  shelters: 'shelterId',
};

export const LAYER_KIND: Record<LayerName, FeatureKind> = {
  flood: 'flood',
  roads: 'road',
  settlements: 'settlement',
  routes: 'route',
  shelters: 'shelter',
};

export const KIND_LAYER: Record<FeatureKind, LayerName> = {
  flood: 'flood',
  road: 'roads',
  settlement: 'settlements',
  route: 'routes',
  shelter: 'shelters',
};

/** Map-layer ids belonging to each toggle group (selection highlight layers included). */
export const GROUP_LAYERS: Record<LayerName, string[]> = {
  flood: ['flood-fill', 'flood-outline', 'flood-uncertain', 'flood-blocking', 'flood-selected'],
  roads: ['roads-bridge-casing', 'roads-line', 'roads-blocked', 'roads-blocking', 'roads-selected'],
  settlements: ['settlements-halo', 'settlements-circle', 'settlements-selected'],
  routes: ['routes-recalc-glow', 'routes-line', 'routes-refused', 'routes-selected'],
  shelters: ['shelters-circle', 'shelters-selected'],
};

/** Layers that respond to click/hover (topmost first). */
export const INTERACTIVE_LAYERS = ['settlements-circle', 'shelters-circle', 'routes-line', 'routes-refused', 'roads-blocked', 'roads-line', 'flood-fill'];

const LAYER_TO_GROUP: Record<string, LayerName> = {
  'settlements-circle': 'settlements',
  'shelters-circle': 'shelters',
  'routes-line': 'routes',
  'routes-refused': 'routes',
  'roads-line': 'roads',
  'roads-blocked': 'roads',
  'flood-fill': 'flood',
};

/** Pure: map a clicked layer + its properties to a selection (undefined if not selectable). */
export function featureToSelection(
  layerId: string,
  properties: Record<string, unknown> | null | undefined,
): { kind: FeatureKind; id: string } | undefined {
  const group = LAYER_TO_GROUP[layerId];
  const id = group && properties?.[ID_PROPERTY[group]];
  return group && typeof id === 'string' ? { kind: LAYER_KIND[group], id } : undefined;
}

/**
 * Local fallback for @setu/ui SETU_MAP_COLORS (Team Scenario). Swap to the shared constant once merged.
 * flooded = blue, blocked = red, safe = green, uncertain = amber.
 */
export const SETU_MAP_COLORS = { flooded: '#1e88e5', blocked: '#c62828', safe: '#2e7d32', uncertain: '#f9a825' } as const;

export const COLORS = {
  roadOpen: SETU_MAP_COLORS.safe,
  roadPartial: SETU_MAP_COLORS.uncertain,
  roadBlocked: SETU_MAP_COLORS.blocked,
  roadUnknown: '#757575',
  accessible: SETU_MAP_COLORS.safe,
  limited: '#f9a825',
  cutOff: SETU_MAP_COLORS.blocked,
  evacuation: '#1565c0',
  supply: '#6a1b9a',
  recalculated: '#00acc1',
  unavailable: '#9e9e9e',
  shelterOpen: '#00796b',
  shelterClosed: '#616161',
  flood: SETU_MAP_COLORS.flooded,
  floodUncertain: SETU_MAP_COLORS.uncertain,
  blocking: '#ff6d00',
  selected: '#ffea00',
} as const;

/** Fill colour by severity 1-5 (darker = deeper/more severe). */
const floodColor: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'severity'],
  1, '#90caf9', 3, '#1e88e5', 5, '#0d2c6c',
];
/** Opacity also rises with severity; uncertain areas stay faint so they read as "not confirmed". */
const floodOpacity: ExpressionSpecification = [
  'case',
  ['==', ['get', 'confidence'], 'uncertain'], 0.14,
  ['interpolate', ['linear'], ['get', 'severity'], 1, 0.25, 3, 0.45, 5, 0.65],
];

const roadStatus: ExpressionSpecification = [
  'match', ['get', 'status'],
  'open', COLORS.roadOpen,
  'partial', COLORS.roadPartial,
  'blocked', COLORS.roadBlocked,
  COLORS.roadUnknown,
];

const isStatus = (s: string): ExpressionSpecification => ['==', ['get', 'status'], s];

/** Blocked = server status 'blocked' or (proposed) passability 'impassable'. Read from properties, never derived. */
const isBlocked: ExpressionSpecification = ['any', isStatus('blocked'), ['==', ['get', 'passability'], 'impassable']];
const isBridge: ExpressionSpecification = ['==', ['get', 'kind'], 'bridge'];
const isUncertainFlood: ExpressionSpecification = ['==', ['get', 'confidence'], 'uncertain'];

const routeColor: ExpressionSpecification = [
  'case',
  isStatus('recalculated'), COLORS.recalculated,
  ['==', ['get', 'kind'], 'supply'], COLORS.supply,
  COLORS.evacuation,
];

const settlementColor: ExpressionSpecification = [
  'match', ['get', 'accessibility'],
  'accessible', COLORS.accessible,
  'limited', COLORS.limited,
  'cut_off', COLORS.cutOff,
  COLORS.roadUnknown,
];

const noMatch: ExpressionSpecification = ['==', ['get', 'none'], '__none__'];

export const MAP_LAYERS: LayerSpecification[] = [
  {
    id: 'flood-fill', type: 'fill', source: SOURCE_IDS.flood,
    paint: { 'fill-color': floodColor, 'fill-opacity': floodOpacity },
  },
  {
    id: 'flood-outline', type: 'line', source: SOURCE_IDS.flood,
    filter: ['!', isUncertainFlood],
    paint: { 'line-color': '#0d47a1', 'line-width': 1.5 },
  },
  {
    // Uncertain flood: amber dashed outline, faint fill.
    id: 'flood-uncertain', type: 'line', source: SOURCE_IDS.flood,
    filter: isUncertainFlood,
    paint: { 'line-color': COLORS.floodUncertain, 'line-width': 3, 'line-dasharray': [2, 1.5] },
  },
  {
    // Bridges get a dark casing so they read as a different symbol from roads.
    id: 'roads-bridge-casing', type: 'line', source: SOURCE_IDS.roads,
    filter: isBridge,
    layout: { 'line-cap': 'butt' },
    paint: { 'line-color': '#212121', 'line-width': 11 },
  },
  {
    id: 'roads-line', type: 'line', source: SOURCE_IDS.roads,
    filter: ['!', isBlocked],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': roadStatus,
      'line-width': ['case', isStatus('partial'), 4.5, 3.5],
    },
  },
  {
    id: 'roads-blocked', type: 'line', source: SOURCE_IDS.roads,
    filter: isBlocked,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': COLORS.roadBlocked, 'line-width': 7, 'line-dasharray': [1.5, 1] },
  },
  {
    // Recalculated routes: soft glow underneath to make them stand out.
    id: 'routes-recalc-glow', type: 'line', source: SOURCE_IDS.routes,
    filter: isStatus('recalculated'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.recalculated, 'line-width': 14, 'line-opacity': 0.3 },
  },
  {
    id: 'routes-line', type: 'line', source: SOURCE_IDS.routes,
    filter: ['!', isStatus('unavailable')],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': routeColor,
      'line-width': ['case', isStatus('recalculated'), 6, 4],
    },
  },
  {
    // Refused routes: red, dashed, faded.
    id: 'routes-refused', type: 'line', source: SOURCE_IDS.routes,
    filter: isStatus('unavailable'),
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': COLORS.roadBlocked, 'line-width': 3, 'line-opacity': 0.5, 'line-dasharray': [2, 2] },
  },
  {
    id: 'settlements-halo', type: 'circle', source: SOURCE_IDS.settlements,
    filter: ['==', ['get', 'accessibility'], 'cut_off'],
    paint: {
      'circle-radius': 20,
      'circle-color': COLORS.cutOff,
      'circle-opacity': 0.3,
      'circle-stroke-color': COLORS.cutOff,
      'circle-stroke-width': 2,
      'circle-stroke-opacity': 0.8,
    },
  },
  {
    id: 'settlements-circle', type: 'circle', source: SOURCE_IDS.settlements,
    paint: {
      'circle-radius': 9,
      'circle-color': settlementColor,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  },
  {
    id: 'shelters-circle', type: 'circle', source: SOURCE_IDS.shelters,
    paint: {
      // Radius grows with occupancy; closed shelters are grey.
      'circle-radius': ['interpolate', ['linear'], ['get', 'occupancy'], 0, 6, 500, 12],
      'circle-color': ['case', ['get', 'open'], COLORS.shelterOpen, COLORS.shelterClosed],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  },
  // Blocking-feature highlights: filter is replaced with the blockingFeatureIds of the selected settlement/route.
  {
    id: 'flood-blocking', type: 'line', source: SOURCE_IDS.flood, filter: noMatch,
    paint: { 'line-color': COLORS.blocking, 'line-width': 5 },
  },
  {
    id: 'roads-blocking', type: 'line', source: SOURCE_IDS.roads, filter: noMatch,
    paint: { 'line-color': COLORS.blocking, 'line-width': 16, 'line-opacity': 0.55 },
  },
  // Selection highlights: filter is replaced when selection changes.
  {
    id: 'flood-selected', type: 'line', source: SOURCE_IDS.flood, filter: noMatch,
    paint: { 'line-color': COLORS.selected, 'line-width': 4 },
  },
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
];

export function selectionFilter(group: LayerName, id: string | undefined): ExpressionSpecification {
  return id === undefined ? noMatch : ['==', ['get', ID_PROPERTY[group]], id];
}

/** Filter matching any of the given feature ids (blockingFeatureIds) within a layer group. */
export function idsFilter(group: LayerName, ids: readonly string[]): ExpressionSpecification {
  return ids.length === 0 ? noMatch : ['in', ['get', ID_PROPERTY[group]], ['literal', [...ids]]];
}

export const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

/** Source id -> GeoJSON for a server snapshot (rendered as-is; nothing is derived). */
export function snapshotSources(s: ProjectionSnapshot): Record<LayerName, unknown> {
  return { flood: s.flood, roads: s.roads, settlements: s.settlements, routes: s.routes, shelters: s.shelters };
}
