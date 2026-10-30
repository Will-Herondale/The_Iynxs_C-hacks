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
  flood: ['flood-fill', 'flood-outline', 'flood-selected'],
  roads: ['roads-line', 'roads-selected'],
  settlements: ['settlements-halo', 'settlements-circle', 'settlements-selected'],
  routes: ['routes-line', 'routes-selected'],
  shelters: ['shelters-circle', 'shelters-selected'],
};

/** Layers that respond to click/hover (topmost first). */
export const INTERACTIVE_LAYERS = ['settlements-circle', 'shelters-circle', 'routes-line', 'roads-line', 'flood-fill'];

const LAYER_TO_GROUP: Record<string, LayerName> = {
  'settlements-circle': 'settlements',
  'shelters-circle': 'shelters',
  'routes-line': 'routes',
  'roads-line': 'roads',
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

export const COLORS = {
  roadOpen: '#2e7d32',
  roadPartial: '#f9a825',
  roadBlocked: '#c62828',
  roadUnknown: '#757575',
  accessible: '#2e7d32',
  limited: '#f9a825',
  cutOff: '#d32f2f',
  evacuation: '#1565c0',
  supply: '#6a1b9a',
  recalculated: '#00acc1',
  unavailable: '#9e9e9e',
  shelterOpen: '#00796b',
  shelterClosed: '#616161',
  flood: '#1e88e5',
  selected: '#ffea00',
} as const;

/** Fill colour/opacity by severity 1-5. */
const floodColor: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'severity'],
  1, '#90caf9', 3, '#1e88e5', 5, '#0d2c6c',
];

const roadStatus: ExpressionSpecification = [
  'match', ['get', 'status'],
  'open', COLORS.roadOpen,
  'partial', COLORS.roadPartial,
  'blocked', COLORS.roadBlocked,
  COLORS.roadUnknown,
];

const isStatus = (s: string): ExpressionSpecification => ['==', ['get', 'status'], s];

const routeColor: ExpressionSpecification = [
  'case',
  isStatus('unavailable'), COLORS.unavailable,
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
    paint: { 'fill-color': floodColor, 'fill-opacity': 0.45 },
  },
  {
    id: 'flood-outline', type: 'line', source: SOURCE_IDS.flood,
    paint: { 'line-color': '#0d47a1', 'line-width': 1.5 },
  },
  {
    id: 'roads-line', type: 'line', source: SOURCE_IDS.roads,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': roadStatus,
      'line-width': ['case', isStatus('blocked'), 6, isStatus('partial'), 4.5, 3.5],
      'line-dasharray': ['case', isStatus('blocked'), ['literal', [1.5, 1]], ['literal', [1, 0]]],
    },
  },
  {
    id: 'routes-line', type: 'line', source: SOURCE_IDS.routes,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': routeColor,
      'line-width': ['case', isStatus('recalculated'), 6, isStatus('unavailable'), 2.5, 4],
      'line-opacity': ['case', isStatus('unavailable'), 0.7, 1],
      'line-dasharray': ['case', isStatus('unavailable'), ['literal', [2, 2]], ['literal', [1, 0]]],
    },
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

export const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

/** Source id -> GeoJSON for a server snapshot (rendered as-is; nothing is derived). */
export function snapshotSources(s: ProjectionSnapshot): Record<LayerName, unknown> {
  return { flood: s.flood, roads: s.roads, settlements: s.settlements, routes: s.routes, shelters: s.shelters };
}
