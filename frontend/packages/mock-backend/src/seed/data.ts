/**
 * Seed scenario: a flood-prone slice of south-central Guwahati, Assam (~26.14N, 91.73E).
 * Names are real localities; geometries are hand-drawn approximations for a demo, NOT survey data.
 * Coordinates are [lng, lat] (GeoJSON order).
 */
import type { FloodProps, RoadProps, RouteProps, SettlementProps, ShelterProps } from '@setu/contract';
import type { Pos } from './geo.js';

export const SEED_TIME = '2026-06-01T06:00:00.000Z';
export const MAP_CENTER: Pos = [91.73, 26.14];

type Feat<G, P> = { id: string; geometry: G; properties: P };
type Line = { type: 'LineString'; coordinates: Pos[] };
type Polygon = { type: 'Polygon'; coordinates: Pos[][] };
type Point = { type: 'Point'; coordinates: Pos };

const line = (coordinates: Pos[]): Line => ({ type: 'LineString', coordinates });
const point = (lng: number, lat: number): Point => ({ type: 'Point', coordinates: [lng, lat] });

/** Flood polygons. A1 = Bharalu basin (low-lying), A2 = Deepor Beel fringe / Garchuk side. */
export const FLOOD_A1: Polygon = {
  type: 'Polygon',
  coordinates: [[[91.7105, 26.1610], [91.7290, 26.1650], [91.7420, 26.1600], [91.7390, 26.1520], [91.7240, 26.1490], [91.7120, 26.1530], [91.7105, 26.1610]]],
};
export const FLOOD_A2: Polygon = {
  type: 'Polygon',
  coordinates: [[[91.6950, 26.1040], [91.7100, 26.1070], [91.7160, 26.1000], [91.7090, 26.0940], [91.6970, 26.0950], [91.6950, 26.1040]]],
};
/** Precomputed larger A2 extent used when a severity>=4 report lands inside A2. */
export const FLOOD_A2_GROWN: Polygon = {
  type: 'Polygon',
  coordinates: [[[91.6900, 26.1110], [91.7160, 26.1180], [91.7290, 26.1060], [91.7230, 26.0900], [91.7020, 26.0870], [91.6890, 26.0960], [91.6900, 26.1110]]],
};

/**
 * Precomputed A2 extent after the B1 (Bharalu Bridge) submerged report: the old grown extent plus a
 * lobe along the low-lying river corridor that reaches the bridge. Scripted, not computed.
 * Covers B1; deliberately excludes S4 (Hatigaon) and shelter SH3 so S4 is cut off, not flooded.
 */
export const FLOOD_A2_B1_GROWN: Polygon = {
  type: 'Polygon',
  coordinates: [[[91.6900, 26.1110], [91.7160, 26.1180], [91.7500, 26.1225], [91.7940, 26.1295], [91.7985, 26.1315], [91.8000, 26.1290], [91.7985, 26.1268], [91.7500, 26.1190], [91.7290, 26.1060], [91.7230, 26.0900], [91.7020, 26.0870], [91.6890, 26.0960], [91.6900, 26.1110]]],
};
/** A3 = Beltola south marsh: water reported by a single unverified source, so confidence is uncertain. */
export const FLOOD_A3: Polygon = {
  type: 'Polygon',
  coordinates: [[[91.7600, 26.1060], [91.7700, 26.1090], [91.7740, 26.1040], [91.7650, 26.1000], [91.7600, 26.1060]]],
};

export const FLOOD: Feat<Polygon, FloodProps>[] = [
  { id: 'A1', geometry: FLOOD_A1, properties: { areaId: 'A1', depthCm: 60, severity: 3, confidence: 'observed' } },
  { id: 'A2', geometry: FLOOD_A2, properties: { areaId: 'A2', depthCm: 35, severity: 2, confidence: 'modelled' } },
  { id: 'A3', geometry: FLOOD_A3, properties: { areaId: 'A3', depthCm: 15, severity: 1, confidence: 'uncertain' } },
];

/** Gauge id -> flood area it reads. Scripted lookup; there is no hydrology here. */
export const GAUGES: Record<string, string> = { G1: 'A1', G2: 'A2' };

const road = (id: string, name: string, coords: Pos[], kind: 'road' | 'bridge' = 'road'): Feat<Line, RoadProps> => ({
  id,
  geometry: line(coords),
  // status 'open' <=> passability 'passable'; rules flip both together.
  properties: { roadId: id, name, kind, passability: 'passable', status: 'open', updatedAt: SEED_TIME, sourceEventIds: [] },
});

export const B1_COORDS: Pos[] = [[91.7984, 26.1300], [91.7975, 26.1285]];

export const ROADS: Feat<Line, RoadProps>[] = [
  road('R1', 'Guwahati-Shillong (GS) Road', [[91.7560, 26.1700], [91.7640, 26.1560], [91.7720, 26.1430], [91.7800, 26.1300], [91.7880, 26.1180]]),
  road('R2', 'RG Baruah Road', [[91.7560, 26.1700], [91.7480, 26.1665], [91.7380, 26.1630], [91.7290, 26.1650]]),
  road('R3', 'Lokhra Road', [[91.7720, 26.1430], [91.7600, 26.1385], [91.7500, 26.1330], [91.7420, 26.1260]]),
  road('R4', 'Bharalu Embankment Road', [[91.7290, 26.1650], [91.7240, 26.1580], [91.7200, 26.1500], [91.7160, 26.1420]]),
  road('R5', 'Zoo Road', [[91.7640, 26.1560], [91.7540, 26.1540], [91.7440, 26.1500], [91.7330, 26.1450]]),
  road('R6', 'Rukminigaon Link Road', [[91.7880, 26.1180], [91.7960, 26.1250], [91.8000, 26.1340]]),
  road('R7', 'Beltola-Basistha Road', [[91.7800, 26.1300], [91.7700, 26.1250], [91.7600, 26.1200], [91.7480, 26.1170]]),
  road('R8', 'Beltola Tiniali Bypass', [[91.7800, 26.1300], [91.7750, 26.1180], [91.7650, 26.1100], [91.7540, 26.1050], [91.7480, 26.1170]]),
  road('R9', 'Kahilipara Main Road', [[91.7330, 26.1450], [91.7400, 26.1340], [91.7420, 26.1260], [91.7480, 26.1170]]),
  road('R10', 'Garchuk-Maligaon Road', [[91.7160, 26.1420], [91.7100, 26.1330], [91.7040, 26.1250], [91.7000, 26.1160]]),
  // Bridge on the only road access from Hatigaon (S4) to its shelter SH3; EVAC-3 crosses it.
  road('B1', 'Bharalu Bridge', B1_COORDS, 'bridge'),
];

const settlement = (id: string, name: string, lng: number, lat: number, population: number, households: number, needs: string[], extra: Partial<SettlementProps> = {}): Feat<Point, SettlementProps> => ({
  id,
  geometry: point(lng, lat),
  properties: { settlementId: id, name, population, accessibility: 'accessible', households, needs, ...extra },
});

export const SETTLEMENTS: Feat<Point, SettlementProps>[] = [
  settlement('S1', 'Bharalumukh', 91.7210, 26.1620, 4200, 960, ['drinking_water', 'boats']),
  settlement('S2', 'Silpukhuri', 91.7545, 26.1690, 3100, 720, ['medical']),
  settlement('S3', 'Beltola', 91.7690, 26.1245, 5200, 1180, ['food', 'drinking_water']),
  settlement('S4', 'Hatigaon', 91.7990, 26.1320, 3600, 810, ['food'], { evacuationPriority: 'high' }),
  settlement('S5', 'Kahilipara', 91.7405, 26.1335, 2800, 640, ['medical', 'boats']),
  settlement('S6', 'Garchuk', 91.7005, 26.1170, 2400, 540, ['drinking_water', 'shelter']),
];

const shelter = (id: string, name: string, lng: number, lat: number, capacity: number, occupancy: number): Feat<Point, ShelterProps> => ({
  id,
  geometry: point(lng, lat),
  properties: { shelterId: id, name, capacity, occupancy, open: true },
});

export const SHELTERS: Feat<Point, ShelterProps>[] = [
  shelter('SH1', 'Latasil Govt. Higher Secondary School', 91.7480, 26.1665, 600, 40),
  shelter('SH2', 'Basistha Community Hall', 91.7480, 26.1170, 450, 25),
  shelter('SH3', 'Hatigaon Higher Secondary School', 91.7960, 26.1250, 700, 60),
];

const route = (id: string, from: string, to: string, etaMin: number, coords: Pos[], extra: Partial<RouteProps> = {}): Feat<Line, RouteProps> => ({
  id,
  geometry: line(coords),
  properties: { routeId: id, from, to, kind: 'evacuation', status: 'active', etaMin, ...extra },
});

export const ROUTES: Feat<Line, RouteProps>[] = [
  // Bharalumukh -> Latasil school via RG Baruah Road
  route('EVAC-1', 'S1', 'SH1', 22, [[91.7210, 26.1620], [91.7290, 26.1650], [91.7380, 26.1630], [91.7480, 26.1665]]),
  // Beltola -> Basistha hall via Beltola-Basistha Road (R7)
  route('EVAC-2', 'S3', 'SH2', 18, [[91.7690, 26.1245], [91.7600, 26.1200], [91.7480, 26.1170]]),
  // Hatigaon -> Hatigaon school, crossing Bharalu Bridge (B1)
  route('EVAC-3', 'S4', 'SH3', 9, [[91.7990, 26.1320], [91.7984, 26.1300], [91.7975, 26.1285], [91.7968, 26.1268], [91.7960, 26.1250]]),
];

/** Precomputed replacement geometries (scripted, not computed). */
export const EVAC_2B_GEOMETRY: Pos[] = [[91.7690, 26.1245], [91.7750, 26.1180], [91.7650, 26.1100], [91.7540, 26.1050], [91.7480, 26.1170]];
export const EVAC_1B_GEOMETRY: Pos[] = [[91.7210, 26.1620], [91.7240, 26.1580], [91.7330, 26.1450], [91.7440, 26.1500], [91.7540, 26.1540], [91.7480, 26.1665]];
