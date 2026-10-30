/**
 * Seed scenario: Majuli, Assam (river island, ~26.95N 94.17E).
 * Built from the fixtures that `scripts/build-fixtures.mjs` derives from the bundled `@setu/geo` data
 * (Karthik's published OSM / DDMA layers). Everything under ./fixtures is a SYNTHETIC build-time fixture:
 * the flood polygons are a DEM-threshold mask (not a hydraulic simulation) and the routes are precomputed,
 * static geometry. Nothing is routed or flooded at runtime. Coordinates are [lng, lat].
 */
import type { FloodProps, RoadProps, RouteProps, SettlementProps, ShelterProps } from '@setu/contract';
import type { Pos } from './geo.js';
import { FIXTURES } from './fixtures.js';

export const SEED_TIME = '2026-06-01T06:00:00.000Z';
/** Majuli island centre (matches @setu/geo MAJULI_CENTER). */
export const MAP_CENTER: Pos = [94.17, 26.95];

type Feat<G, P> = { id: string; geometry: G; properties: P };
type Line = { type: 'LineString'; coordinates: Pos[] };
type Polygon = { type: 'Polygon'; coordinates: Pos[][] };
type Point = { type: 'Point'; coordinates: Pos };

/** Scenario targets (Karthik's geo/SCENARIOS.md; all SYNTHETIC). */
export const S1_BRIDGE_ID = '284824410';
export const S1_DECK_M = 84.8;
export const S1_LEVEL_M = 85.3;
export const S2_ROAD_ID = '1074461062';
export const S2_SHELTER_ID = 'MJ-SH-009';
export const S4_SETTLEMENT_ID = '10692764768';
export const S4_GROUND_M = 82.3;
export const S4_LEVEL_M = 83.8;
/** Smallest field depth (cm above local ground at Auniati) that reaches the S4 level: round((83.8 - 82.3) * 100). */
export const S4_TRIGGER_CM = Math.round((S4_LEVEL_M - S4_GROUND_M) * 100);

/** Flood area ids by level; a level's polygons replace the previous level's whole set. */
export const FLOOD_LEVELS = {
  '83.8': { levelM: S4_LEVEL_M, areaPrefix: 'flood-s4-' },
  '85.3': { levelM: S1_LEVEL_M, areaPrefix: 'flood-s1-' },
} as const;
export type FloodLevelKey = keyof typeof FLOOD_LEVELS;

/**
 * Flood features for a level, taken as-is from the build-time fixture. `depthCm` / `severity` are the fixture
 * builder's DEM-derived values for the synthetic threshold mask (level minus terrain), not hydraulic modelling.
 */
export function floodFeatures(level: FloodLevelKey): Feat<Polygon, FloodProps>[] {
  return FIXTURES.flood[level].features.map((f) => ({
    id: f.properties.areaId,
    geometry: structuredClone(f.geometry) as Polygon,
    properties: { areaId: f.properties.areaId, depthCm: f.properties.depthCm, severity: f.properties.severity, confidence: 'modelled' as const },
  }));
}

/** Baseline flood: none published. The first scripted report switches a level on. */
export const FLOOD: Feat<Polygon, FloodProps>[] = [];

export const ROADS: Feat<Line, RoadProps>[] = FIXTURES.roads.features.map((f) => ({
  id: f.properties.roadId,
  geometry: f.geometry as Line,
  // status 'open' <=> passability 'passable'; rules flip both together.
  properties: { roadId: f.properties.roadId, name: f.properties.name, kind: f.properties.kind, passability: 'passable', status: 'open', updatedAt: SEED_TIME, sourceEventIds: [] },
}));

/** Population is published for ~1 of 62 places; 0 means "not published", never a real zero. */
export const SETTLEMENTS: Feat<Point, SettlementProps>[] = FIXTURES.settlements.features.map((f) => ({
  id: f.properties.settlementId,
  geometry: f.geometry as Point,
  properties: { settlementId: f.properties.settlementId, name: f.properties.name, population: f.properties.population ?? 0, accessibility: 'accessible', households: 0, needs: [] },
}));

/** Capacity/occupancy are NOT published (0/0) and `open:false` = "pre-identified camp, not confirmed open". */
export const SHELTERS: Feat<Point, ShelterProps>[] = FIXTURES.shelters.features.map((f) => ({
  id: f.properties.shelterId,
  geometry: f.geometry as Point,
  properties: { shelterId: f.properties.shelterId, name: f.properties.name, capacity: 0, occupancy: 0, open: false },
}));

const toRoute = (f: (typeof FIXTURES.routes.features)[number]): Feat<Line, RouteProps> => {
  const p = f.properties;
  const properties: RouteProps = { routeId: p.routeId, from: p.from, to: p.to, kind: 'evacuation', status: p.role === 'alternate' ? 'recalculated' : 'active', etaMin: p.etaMin };
  if (p.replacesRouteId) properties.replacesRouteId = p.replacesRouteId;
  return { id: p.routeId, geometry: f.geometry as Line, properties };
};

/** Baseline routes only; alternates are held back and added by the scripted rules. */
export const ROUTES: Feat<Line, RouteProps>[] = FIXTURES.routes.features.filter((f) => f.properties.role === 'baseline').map(toRoute);
/** Precomputed alternates (status `recalculated`), keyed by the baseline route they replace. */
export const ALTERNATES: Record<string, Feat<Line, RouteProps>[]> = {};
for (const f of FIXTURES.routes.features) {
  if (f.properties.role !== 'alternate' || !f.properties.replacesRouteId) continue;
  (ALTERNATES[f.properties.replacesRouteId] ??= []).push(toRoute(f));
}
/** routeId -> curated road ids the precomputed route traverses (static; the rules never trace a graph). */
export const ROUTE_VIA: Record<string, string[]> = Object.fromEntries(FIXTURES.routes.features.map((f) => [f.properties.routeId, f.properties.viaRoadIds]));
/** Far-side settlements affected by each scripted road blockage (from the fixture build). */
export const AFFECTED_SETTLEMENTS: Record<string, string[]> = FIXTURES.notes.affectedSettlements;
