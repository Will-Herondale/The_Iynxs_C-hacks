// Deterministic projection fold — planning doc 04, §3.
//
// Combines flood, network, people, and decision projections into a single
// ProjectionSnapshot that matches the frontend contract (@setu/contract).
//
// The fold is a pure function: (events, artifacts, asOf) → ProjectionSnapshot.
// Same inputs always produce the same output bytes.

import {
  type ProjectionSnapshot,
  type FloodExtent,
  type RoadStatus,
  type Settlement,
  type Route,
  type Shelter,
} from './contract-types';
import {
  type Envelope,
  totalOrder,
} from '../../core/src/index';
import {
  projectFlood,
  type WaterObservation,
  type FloodPoint,
} from '../../core/src/index';
import {
  projectNetwork,
} from '../../core/src/index';

/**
 * Geographic artifacts — loaded once at startup from Karthik's geo pipeline.
 * For G1, synthetic fixtures are used.
 */
export interface GeoArtifacts {
  roads: Array<{
    edgeId: string;
    name: string;
    geometry: { type: 'LineString'; coordinates: number[][] };
  }>;
  settlements: Array<{
    settlementId: string;
    name: string;
    lng: number; // microdegrees
    lat: number; // microdegrees
    population: number;
    households: number;
    needs: string[];
    nodeId: string;
  }>;
  shelters: Array<{
    shelterId: string;
    name: string;
    lng: number; // microdegrees
    lat: number; // microdegrees
    capacity: number;
    occupancy: number;
    open: boolean;
    nodeId: string;
  }>;
  floodReferencePoints: Array<FloodPoint>;
  routes: Array<{
    routeId: string;
    from: string; // settlementId
    to: string; // settlementId
    geometry: { type: 'LineString'; coordinates: number[][] };
  }>;
}

/**
 * Extract water observations from events.
 */
function extractWaterObservations(
  events: Envelope[],
): WaterObservation[] {
  const obs: WaterObservation[] = [];
  for (const env of events) {
    if (env.type !== 'obs.water') continue;
    const p = env.payload as {
      point_id: string;
      depth_dm: number;
      ref_kind: string;
      confidence: number;
    };
    obs.push({
      pointId: p.point_id,
      depthDm: p.depth_dm,
      refKind: p.ref_kind as
        | 'bridge_deck'
        | 'road_surface'
        | 'embankment_crest'
        | 'gauge_zero',
      confidence: p.confidence,
      observedAt: env.at,
      hlc: env.hlc,
      origin: env.origin,
      seq: env.seq,
      suspectClock: false,
    });
  }
  return obs;
}

/**
 * Build a GeoJSON FeatureCollection for flood extent.
 */
function buildFloodExtent(
  projection: ReturnType<typeof projectFlood>,
): FloodExtent {
  const now = new Date(projection.generatedAt).toISOString();
  const features: FloodExtent['features'] = [];

  let featureId = 0;
  for (const cell of projection.cells) {
    if (!cell.wet) continue;

    const depthCm = Math.round((cell.depthDm / 10) * 100);
    const severity = depthCm > 100 ? 5 : depthCm > 50 ? 4 : depthCm > 20 ? 3 : depthCm > 10 ? 2 : 1;

    const cx = cell.cx / 1_000_000;
    const cy = cell.cy / 1_000_000;
    const offset = 0.0003;

    features.push({
      type: 'Feature',
      id: `flood-${featureId++}`,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [cx - offset, cy - offset],
          [cx + offset, cy - offset],
          [cx + offset, cy + offset],
          [cx - offset, cy + offset],
          [cx - offset, cy - offset],
        ]],
      },
      properties: {
        areaId: `cell-${cell.cx}-${cell.cy}`,
        depthCm,
        severity,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    version: 1,
    generatedAt: now,
    features,
  };
}

/**
 * Build a GeoJSON FeatureCollection for road status.
 */
function buildRoadStatus(
  roads: GeoArtifacts['roads'],
  passability: ReturnType<typeof projectNetwork>,
): RoadStatus {
  const now = new Date().toISOString();
  const features: RoadStatus['features'] = [];

  const passByEdge = new Map(passability.map((p) => [p.edgeId, p]));

  let featureId = 0;
  for (const road of roads) {
    const pass = passByEdge.get(road.edgeId);
    const status = pass
      ? pass.disputed
        ? 'unknown'
        : pass.state
      : 'unknown';

    features.push({
      type: 'Feature',
      id: `road-${featureId++}`,
      geometry: road.geometry,
      properties: {
        roadId: road.edgeId,
        name: road.name,
        status,
        updatedAt: now,
        sourceEventIds: pass ? pass.sourceEventIds : [],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    version: 1,
    generatedAt: now,
    features,
  };
}

/**
 * Build a GeoJSON FeatureCollection for settlements with accessibility.
 */
function buildSettlements(
  settlements: GeoArtifacts['settlements'],
  cutOff: Set<string>,
): Settlement {
  const now = new Date().toISOString();
  const features: Settlement['features'] = [];

  let featureId = 0;
  for (const s of settlements) {
    features.push({
      type: 'Feature',
      id: `settlement-${featureId++}`,
      geometry: {
        type: 'Point',
        coordinates: [s.lng / 1_000_000, s.lat / 1_000_000],
      },
      properties: {
        settlementId: s.settlementId,
        name: s.name,
        population: s.population,
        accessibility: cutOff.has(s.settlementId) ? 'cut_off' : 'accessible',
        households: s.households,
        needs: s.needs,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    version: 1,
    generatedAt: now,
    features,
  };
}

/**
 * Build a GeoJSON FeatureCollection for routes.
 */
function buildRoutes(
  routes: GeoArtifacts['routes'],
): Route {
  const now = new Date().toISOString();
  const features: Route['features'] = [];

  let featureId = 0;
  for (const r of routes) {
    features.push({
      type: 'Feature',
      id: `route-${featureId++}`,
      geometry: r.geometry,
      properties: {
        routeId: r.routeId,
        from: r.from,
        to: r.to,
        kind: 'evacuation',
        status: 'active',
        etaMin: 30,
        replacesRouteId: undefined,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    version: 1,
    generatedAt: now,
    features,
  };
}

/**
 * Build a GeoJSON FeatureCollection for shelters.
 */
function buildShelters(shelters: GeoArtifacts['shelters']): Shelter {
  const now = new Date().toISOString();
  const features: Shelter['features'] = [];

  let featureId = 0;
  for (const s of shelters) {
    features.push({
      type: 'Feature',
      id: `shelter-${featureId++}`,
      geometry: {
        type: 'Point',
        coordinates: [s.lng / 1_000_000, s.lat / 1_000_000],
      },
      properties: {
        shelterId: s.shelterId,
        name: s.name,
        capacity: s.capacity,
        occupancy: s.occupancy,
        open: s.open,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    version: 1,
    generatedAt: now,
    features,
  };
}

/**
 * Determine cut-off settlements: those near wet cells.
 */
function computeCutOff(
  settlements: GeoArtifacts['settlements'],
  floodProjection: ReturnType<typeof projectFlood>,
  cellSizeM: number = 30,
): Set<string> {
  const cutOff = new Set<string>();

  const wetCenters = floodProjection.cells
    .filter((c) => c.wet)
    .map((c) => ({ cx: c.cx, cy: c.cy }));

  if (wetCenters.length === 0) return cutOff;

  const thresholdM = 200;
  const thresholdCells = thresholdM / cellSizeM;

  for (const s of settlements) {
    const degPerCell = cellSizeM / 111000;
    const sX = Math.round(s.lng / 1_000_000 / degPerCell);
    const sY = Math.round(s.lat / 1_000_000 / degPerCell);

    for (const wc of wetCenters) {
      const dx = Math.abs(sX - wc.cx / 1_000_000 / degPerCell);
      const dy = Math.abs(sY - wc.cy / 1_000_000 / degPerCell);
      if (dx <= thresholdCells && dy <= thresholdCells) {
        cutOff.add(s.settlementId);
        break;
      }
    }
  }

  return cutOff;
}

/**
 * The main deterministic fold: (events, artifacts, asOf) → ProjectionSnapshot.
 */
export function projectSnapshot(
  events: Envelope[],
  artifacts: GeoArtifacts,
  asOf: number,
): ProjectionSnapshot {
  const sortedEvents = [...events].sort(totalOrder);

  const waterObs = extractWaterObservations(sortedEvents);

  const floodProjection = projectFlood(
    [],
    waterObs,
    artifacts.floodReferencePoints[0] ?? null,
    asOf,
  );

  const roadEdges = artifacts.roads.map((r) => ({
    edgeId: r.edgeId,
    class: 'residential',
  }));
  const networkProjection = projectNetwork(
    sortedEvents,
    roadEdges,
    asOf,
  );

  const cutOff = computeCutOff(artifacts.settlements, floodProjection);

  const flood = buildFloodExtent(floodProjection);
  const roads = buildRoadStatus(artifacts.roads, networkProjection);
  const settlements = buildSettlements(artifacts.settlements, cutOff);
  const shelters = buildShelters(artifacts.shelters);
  const routes = buildRoutes(artifacts.routes);

  const now = new Date(asOf).toISOString();

  return {
    version: 1,
    generatedAt: now,
    flood,
    roads,
    settlements,
    routes,
    shelters,
  };
}
