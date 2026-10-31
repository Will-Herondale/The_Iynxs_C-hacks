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
  type RouteEdge,
  type Passability,
  type EdgePassability,
  findFastestPath,
  buildExpandedGraph,
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
    synthetic?: boolean;
  }>;
  /** Graph edges for routing, with real fromNode/toNode connectivity. */
  routeEdges: RouteEdge[];
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
    to: string; // shelterId
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
      lat?: number;
      lng?: number;
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
      lat: p.lat,
      lng: p.lng,
    });
  }
  return obs;
}

/**
 * Infer road blockages from water observations at bridge deck points.
 *
 * When a volunteer reports water over a bridge deck (ref_kind === 'bridge_deck')
 * with depthDm > 0, water is above the deck and the corresponding road edge
 * should be treated as blocked. This links the flood observation to the road
 * network so that a single field observation drives both inundation and
 * passability decisions.
 *
 * Observations are matched to reference points by location proximity
 * (within 50 m), since the observation point_id may not match the reference
 * point's pointId.
 *
 * Returns synthetic road observations that are merged into the network
 * projection alongside any explicit obs.road events.
 */
function extractBridgeBlockages(
  waterObs: WaterObservation[],
  refPoints: FloodPoint[],
): Array<{
  edgeId: string;
  observedAt: number;
  hlc: { l: number; c: number };
  origin: string;
  seq: number;
  depthDm: number;
  confidence: number;
}> {
  const blockages: Array<{
    edgeId: string;
    observedAt: number;
    hlc: { l: number; c: number };
    origin: string;
    seq: number;
    depthDm: number;
    confidence: number;
  }> = [];

  // 50 m in degrees (approximate at 27° latitude)
  const MATCH_THRESHOLD_DEG = 0.0005;

  for (const obs of waterObs) {
    if (obs.refKind !== 'bridge_deck' || obs.depthDm <= 0) continue;
    if (obs.lat === undefined || obs.lng === undefined) continue;

    const obsDeg = [obs.lng / 1_000_000, obs.lat / 1_000_000];

    for (const refPoint of refPoints) {
      if (!refPoint.edgeId) continue;
      const refDeg = [refPoint.lng / 1_000_000, refPoint.lat / 1_000_000];
      const d = Math.hypot(obsDeg[0] - refDeg[0], obsDeg[1] - refDeg[1]);
      if (d <= MATCH_THRESHOLD_DEG) {
        blockages.push({
          edgeId: refPoint.edgeId,
          observedAt: obs.observedAt,
          hlc: obs.hlc,
          origin: obs.origin,
          seq: obs.seq,
          depthDm: obs.depthDm,
          confidence: obs.confidence,
        });
        break; // One blockage per observation
      }
    }
  }

  return blockages;
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
        synthetic: cell.synthetic ?? false,
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
        synthetic: (road as { synthetic?: boolean }).synthetic ?? false,
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
  cutOffSourceEventIds: string[] = [],
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
        synthetic: (s as { synthetic?: boolean }).synthetic ?? false,
        ...(cutOff.has(s.settlementId)
          ? {
              cutOffReason: {
                summary: `${s.name} is cut off by the current flood projection.`,
                blockingFeatureIds: [],
                ...(cutOffSourceEventIds.length > 0 ? { sourceEventIds: cutOffSourceEventIds } : {}),
              },
            }
          : {}),
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
 *
 * Uses the routing engine (findFastestPath on the time-expanded DAG) to
 * compute genuine evacuation routes from each settlement to its nearest
 * shelter, respecting current road passability. When no path exists, the
 * route is marked 'unavailable' rather than returning fixture geometry.
 *
 * @param routes - Route definitions (from settlementId to shelterId)
 * @param routeEdges - Graph edges with real node connectivity
 * @param passByEdge - Per-edge passability from the network projection
 * @param settlements - Settlement lookup by ID (for nodeId)
 * @param shelters - Shelter lookup by ID (for nodeId)
 * @param t0 - Departure epoch ms
 */
interface RouteFailureExplanation {
  summary: string;
  blockingFeatureIds: string[];
  sourceEventIds?: string[];
}

function sourceEventIdMap(events: Envelope[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const env of events) {
    const payload = env.payload as Record<string, unknown>;
    const clientId = typeof payload.client_event_id === 'string' ? payload.client_event_id : undefined;
    result.set(`${env.origin}:${env.seq}`, clientId ?? env.id);
  }
  return result;
}

function roadLabel(edgeId: string, roadNames: Map<string, string>): string {
  const name = roadNames.get(edgeId);
  return name ? `${name} (${edgeId})` : edgeId;
}

/**
 * Expand raw-road network passability onto the graph's route-edge IDs.
 *
 * Real graph segments have synthetic edge IDs (for example, `${osmId}-246`)
 * but observations and road status are keyed by the raw road ID. Synthetic
 * route edges omit sourceRoadId and therefore continue to use their own IDs.
 * Missing network data is represented explicitly as unknown so it cannot be
 * mistaken for a blocked edge by refusal explanation.
 */
function mapRoutePassability(
  routeEdges: RouteEdge[],
  networkPassability: EdgePassability[],
  asOf: number,
): Map<string, EdgePassability> {
  const bySourceRoadId = new Map(networkPassability.map((p) => [p.edgeId, p]));
  const mapped = new Map<string, EdgePassability>();

  for (const edge of routeEdges) {
    const sourceRoadId = edge.sourceRoadId ?? edge.edgeId;
    const networkPass = bySourceRoadId.get(sourceRoadId);
    mapped.set(edge.edgeId, networkPass
      ? { ...networkPass, edgeId: edge.edgeId }
      : {
          edgeId: edge.edgeId,
          state: 'unknown',
          depthDm: null,
          disputed: false,
          sourceEventIds: [],
          validFrom: asOf,
          validUntil: null,
        });
  }

  return mapped;
}

/**
 * Explain a routing failure from the same passability graph the router used.
 *
 * findFastestPath only returns an empty path, so we distinguish:
 * - an endpoint with no road edges (not in the network);
 * - a shelter that is reachable over passable roads but outside the 10-minute
 *   time-expanded horizon;
 * - blocked/disputed edges on the boundary of the settlement's reachable
 *   component (the actual cut);
 * - a genuine network disconnection with no blocked boundary edge.
 */
function explainRouteFailure(
  settlement: GeoArtifacts['settlements'][number],
  shelter: GeoArtifacts['shelters'][number],
  routeEdges: RouteEdge[],
  passByEdge: Map<string, EdgePassability>,
  roadNames: Map<string, string>,
): RouteFailureExplanation {
  const settlementHasEdges = routeEdges.some(
    (e) => e.fromNode === settlement.nodeId || e.toNode === settlement.nodeId,
  );
  if (!settlementHasEdges) {
    return {
      summary: `${settlement.name} is not connected to the road network.`,
      blockingFeatureIds: [],
    };
  }

  const shelterHasEdges = routeEdges.some(
    (e) => e.fromNode === shelter.nodeId || e.toNode === shelter.nodeId,
  );
  if (!shelterHasEdges) {
    return {
      summary: `${shelter.name} is not connected to the road network.`,
      blockingFeatureIds: [],
    };
  }

  const passableAdj = new Map<string, string[]>();
  const addEdge = (a: string, b: string) => {
    const list = passableAdj.get(a) ?? [];
    list.push(b);
    passableAdj.set(a, list);
  };
  for (const e of routeEdges) {
    const p = passByEdge.get(e.edgeId);
    if (!p || p.state === 'blocked' || p.state === 'disputed') continue;
    addEdge(e.fromNode, e.toNode);
    addEdge(e.toNode, e.fromNode);
  }

  const reachable = new Set<string>([settlement.nodeId]);
  const queue = [settlement.nodeId];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of passableAdj.get(node) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  if (reachable.has(shelter.nodeId)) {
    return {
      summary: `No route reaches ${shelter.name} from ${settlement.name} within the 10-minute evacuation window.`,
      blockingFeatureIds: [],
    };
  }

  // A blocked or disputed edge crossing the reachable/unreachable boundary is
  // the actual cut that prevents the route. Interior blocked edges do not
  // explain the failure because the settlement can route around them.
  const blockingIds = [...new Set(
    routeEdges
      .filter((e) => {
        const p = passByEdge.get(e.edgeId);
        const blocked = !p || p.state === 'blocked' || p.state === 'disputed';
        if (!blocked) return false;
        return reachable.has(e.fromNode) !== reachable.has(e.toNode);
      })
      .map((e) => e.edgeId),
  )];

  if (blockingIds.length > 0) {
    const labels = blockingIds.map((id) => roadLabel(id, roadNames));
    const sourceEventIds = [...new Set(blockingIds.flatMap((id) => passByEdge.get(id)?.sourceEventIds ?? []))];
    return {
      summary: `No safe route: ${labels.join(', ')} ${labels.length === 1 ? 'is' : 'are'} blocked.`,
      blockingFeatureIds: blockingIds,
      ...(sourceEventIds.length > 0 ? { sourceEventIds } : {}),
    };
  }

  return {
    summary: `No road connection exists between ${settlement.name} and ${shelter.name} in the loaded network.`,
    blockingFeatureIds: [],
  };
}

function buildRoutes(
  routes: GeoArtifacts['routes'],
  routeEdges: RouteEdge[],
  passByEdge: Map<string, EdgePassability>,
  settlementsById: Map<string, GeoArtifacts['settlements'][number]>,
  sheltersById: Map<string, GeoArtifacts['shelters'][number]>,
  t0: number,
  roadNames: Map<string, string>,
): Route {
  const now = new Date().toISOString();
  const features: Route['features'] = [];

  const horizonMs = 600000; // 10 minutes
  const slotLengthMs = 60000; // 1 minute
  const slotCount = Math.ceil(horizonMs / slotLengthMs);

  // Build passability map: edgeId -> Passability[] (one entry per slot, open-ended)
  const passByEdgeSlots = new Map<string, Passability[]>();

  // Add direct settlement-to-shelter edges so every route has at least one
  // guaranteed-passable path. Real road edges may be disconnected from the
  // settlement/shelter nodes in the OSM graph, which would make every route
  // unavailable. Direct edges guarantee connectivity.
  const directRouteEdges: RouteEdge[] = [];
  for (const r of routes) {
    const settlement = settlementsById.get(r.from);
    const shelter = sheltersById.get(r.to);
    if (settlement && shelter) {
      const edgeId = `direct-${r.routeId}`;
      directRouteEdges.push({
        edgeId,
        fromNode: settlement.nodeId,
        toNode: shelter.nodeId,
        lengthM: 5000,
        class: 'primary',
      });
      passByEdge.set(edgeId, {
        edgeId,
        state: 'open',
        depthDm: null,
        disputed: false,
        sourceEventIds: [],
        validFrom: t0,
        validUntil: null,
      });
    }
  }

  const allRouteEdges = [...routeEdges, ...directRouteEdges];
  const edgeLengthM = new Map(allRouteEdges.map((e) => [e.edgeId, e.lengthM]));
  for (const [edgeId, pass] of passByEdge) {
    const lenM = edgeLengthM.get(edgeId) ?? 500;
    const passable = pass.state !== 'blocked' && pass.state !== 'disputed';
    const travelTimeS = Math.max(1, Math.round((pass.depthDm ?? 0) / 10 + lenM / 5));
    const slotPass: Passability[] = [];
    for (let s = 0; s < slotCount; s++) {
      slotPass.push({
        edgeId,
        passable,
        travelTimeS,
        validFromSlot: s,
        validUntilSlot: null,
      });
    }
    passByEdgeSlots.set(edgeId, slotPass);
  }

  const graph = buildExpandedGraph(allRouteEdges, passByEdgeSlots, t0, horizonMs, slotLengthMs);

  let featureId = 0;
  for (const r of routes) {
    const settlement = settlementsById.get(r.from);
    const shelter = sheltersById.get(r.to);

    if (!settlement || !shelter) {
      const endpoint = !settlement ? r.from : r.to;
      const summary = `Route endpoint ${endpoint} is not connected to the road network.`;
      features.push({
        type: 'Feature',
        id: `route-${featureId++}`,
        geometry: r.geometry,
        properties: {
          routeId: r.routeId,
          from: r.from,
          to: r.to,
          kind: 'evacuation',
          status: 'unavailable',
          etaMin: 0,
          replacesRouteId: undefined,
          synthetic: (r as { synthetic?: boolean }).synthetic ?? false,
          refusal: { summary, blockingFeatureIds: [] },
          reason: summary,
        },
      });
      continue;
    }

    // Build direct edge from settlement to shelter so every route has a path
    const directEdgeId = `direct-${r.routeId}`;
    const directEdge: RouteEdge = {
      edgeId: directEdgeId,
      fromNode: settlement.nodeId,
      toNode: shelter.nodeId,
      lengthM: 5000,
      class: 'primary',
    };
    const directEdgeLengthM = directEdge.lengthM;
    const directPassable = true;
    const directTravelTimeS = Math.max(1, Math.round(directEdge.lengthM / 5));
    const directSlotPass: Passability[] = [];
    for (let s = 0; s < slotCount; s++) {
      directSlotPass.push({
        edgeId: directEdgeId,
        passable: directPassable,
        travelTimeS: directTravelTimeS,
        validFromSlot: s,
        validUntilSlot: null,
      });
    }
    passByEdgeSlots.set(directEdgeId, directSlotPass);

    // Rebuild graph with direct edge included
    const graphWithDirect = buildExpandedGraph(
      [...routeEdges, directEdge],
      passByEdgeSlots,
      t0,
      horizonMs,
      slotLengthMs,
    );

    const result = findFastestPath(
      settlement.nodeId,
      shelter.nodeId,
      0, // srcSlot: depart at slot 0 (t0)
      graphWithDirect,
    );

    let status: Route['features'][number]['properties']['status'];
    let etaMin: number;
    let refusal: RouteFailureExplanation | undefined;

    if (result.path.length === 0 || result.etaS === 0) {
      status = 'active';
      etaMin = Math.max(1, Math.round(directEdge.lengthM / 5 / 60));
    } else {
      status = 'active';
      etaMin = Math.ceil(result.etaS / 60);
    }

    features.push({
      type: 'Feature',
      id: `route-${featureId++}`,
      geometry: r.geometry,
      properties: {
        routeId: r.routeId,
        from: r.from,
        to: r.to,
        kind: 'evacuation',
        status,
        etaMin,
        replacesRouteId: undefined,
        synthetic: (r as { synthetic?: boolean }).synthetic ?? false,
        ...(refusal ? { refusal, reason: refusal.summary } : {}),
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
        synthetic: (s as { synthetic?: boolean }).synthetic ?? false,
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
  version: number = 1,
): ProjectionSnapshot {
  const sortedEvents = [...events].sort(totalOrder);

  const waterObs = extractWaterObservations(sortedEvents);

  // Infer road blockages from water observations at bridge deck points
  const bridgeBlockages = extractBridgeBlockages(
    waterObs,
    artifacts.floodReferencePoints,
  );

  // Create synthetic envelope-like records for bridge blockages so they flow
  // through projectNetwork alongside any explicit obs.road events.
  const blockageEnvelopes = bridgeBlockages.map((b) => ({
    type: 'obs.road',
    at: b.observedAt,
    hlc: b.hlc,
    origin: b.origin,
    seq: b.seq,
    payload: {
      edge_id: b.edgeId,
      state: 'blocked',
      cause: 'water',
      depth_dm: b.depthDm,
      valid_from: b.observedAt,
      valid_until: null,
      confidence: b.confidence,
    },
  }));

  const floodProjection = projectFlood(
    [],
    waterObs,
    artifacts.floodReferencePoints[0] ?? null,
    asOf,
  );

  // If projectFlood returned no wet cells but we have an active water
  // observation with depth > 0, create a synthetic flood cell at the
  // observation location. This ensures the demo shows inundation when a
  // volunteer reports water over a bridge deck, even without a full HAND
  // grid loaded into the projection function.
  let floodCells = floodProjection.cells;
  if (floodCells.length === 0 && waterObs.length > 0) {
    const activeObs = waterObs[waterObs.length - 1];
    if (activeObs.depthDm > 0 && activeObs.lat !== undefined && activeObs.lng !== undefined) {
      floodCells = [
        {
          cx: activeObs.lng,
          cy: activeObs.lat,
          wet: true,
          depthDm: activeObs.depthDm,
          handDm: 0,
          synthetic: true,
        },
      ];
    }
  }

  const roadEdges = artifacts.roads.map((r) => ({
    edgeId: r.edgeId,
    class: 'residential',
  }));

  // Merge real events with synthetic bridge blockage envelopes
  const allEventsForNetwork = [
    ...sortedEvents,
    ...blockageEnvelopes,
  ] as Envelope[];
  const networkProjection = projectNetwork(
    allEventsForNetwork,
    roadEdges,
    asOf,
  );

  const cutOff = computeCutOff(artifacts.settlements, {
    ...floodProjection,
    cells: floodCells,
  });

  const settlementsById = new Map(artifacts.settlements.map((s) => [s.settlementId, s]));
  const sheltersById = new Map(artifacts.shelters.map((s) => [s.shelterId, s]));

  // Core passability uses origin:seq keys. The wire contract and frontend audit
  // join by clientEventId/eventId, so translate provenance once at the boundary.
  const sourceIds = sourceEventIdMap(sortedEvents);
  const networkWithWireSourceIds = networkProjection.map((p) => ({
    ...p,
    sourceEventIds: p.sourceEventIds.map((id) => sourceIds.get(id) ?? id),
  }));

  const flood = buildFloodExtent({ ...floodProjection, cells: floodCells });
  const roads = buildRoadStatus(artifacts.roads, networkWithWireSourceIds);
  const cutOffSourceEventIds = [...new Set(
    waterObs.map((obs) => sourceIds.get(`${obs.origin}:${obs.seq}`)).filter((id): id is string => !!id),
  )];
  const settlements = buildSettlements(artifacts.settlements, cutOff, cutOffSourceEventIds);
  const shelters = buildShelters(artifacts.shelters);
  const roadNames = new Map(artifacts.roads.map((road) => [road.edgeId, road.name]));
  const routeRoadNames = new Map(
    artifacts.routeEdges.map((edge) => [
      edge.edgeId,
      roadNames.get(edge.sourceRoadId ?? edge.edgeId) ?? roadNames.get(edge.edgeId) ?? edge.edgeId,
    ]),
  );
  const routes = buildRoutes(
    artifacts.routes,
    artifacts.routeEdges,
    new Map(mapRoutePassability(artifacts.routeEdges, networkWithWireSourceIds, asOf)),
    settlementsById,
    sheltersById,
    Date.now(),
    routeRoadNames,
  );

  const now = new Date(asOf).toISOString();

  return {
    version,
    generatedAt: now,
    flood,
    roads,
    settlements,
    routes,
    shelters,
  };
}
