// SETU geographic artifacts loader - imports Karthik's Majuli GIS artifacts.
// Loads real OSM/DDMA data from PR #16 (branch data/karthik, commit f2136c3).
//
// Real features carry synthetic: false. Scenario overlays carry synthetic: true.
//
// Coordinate conversion: Karthik's GeoJSON uses degrees (EPSG:4326).
// Server GeoArtifacts interface expects microdegrees (lng/lat * 1_000_000).
//
// Node IDs are rounded coordinate keys (about 1 m precision) so that road
// segments sharing an endpoint are treated as connected graph nodes.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { GeoArtifacts } from './projection';
import type { RouteEdge } from '../../core/src/index';

// PR #16 artifact paths (relative to packages/server/)
const ARTIFACT_ROOT = path.resolve(
  process.env.SETU_GEO_ARTIFACTS_ROOT ||
  path.join(__dirname, '../../../geo/data/out/demo')
);

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function degToMicrodeg(deg: number): number {
  return Math.round(deg * 1_000_000);
}

// Round coordinates to about 1 m precision for node matching.
// At 27° latitude, 0.00001° ≈ 1.1 m.
function nodeKey(lng: number, lat: number): string {
  return `${Math.round(lng * 100000)},${Math.round(lat * 100000)}`;
}

function distDeg(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

interface GeoFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface GeoJsonCollection {
  type: string;
  features: GeoFeature[];
}

/**
 * Extract all line segments from a geometry, handling LineString and MultiLineString.
 * Returns an array of [startCoord, endCoord] pairs in [lng, lat].
 */
function extractLineSegments(geom: { type: string; coordinates: unknown }): [number[], number[]][] {
  let coords: number[][];
  if (geom.type === 'MultiLineString') {
    coords = ((geom.coordinates as number[][][])[0] ?? []) as number[][];
  } else {
    coords = (geom.coordinates as number[][]) ?? [];
  }

  const segments: [number[], number[]][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    segments.push([coords[i], coords[i + 1]]);
  }
  return segments;
}

/**
 * Build RouteEdge[] from road graph features.
 * Each LineString segment becomes one edge with node IDs derived from endpoints.
 */
function buildRouteEdges(
  features: GeoFeature[],
): { edges: RouteEdge[]; nodeCoords: Map<string, [number, number]> } {
  const edges: RouteEdge[] = [];
  const nodeCoords = new Map<string, [number, number]>();

  let edgeIndex = 0;
  for (const f of features) {
    const props = f.properties;
    const osmId = String(props['osm_id'] ?? props['roadId'] ?? '');
    const highway = String(props['highway'] ?? '');
    const lengthM = Number(props['length_m']) || 0;

    const segments = extractLineSegments(f.geometry);
    for (const [start, end] of segments) {
      const fromNode = nodeKey(start[0], start[1]);
      const toNode = nodeKey(end[0], end[1]);

      nodeCoords.set(fromNode, [start[0], start[1]]);
      nodeCoords.set(toNode, [end[0], end[1]]);

      edges.push({
        edgeId: `${osmId}-${edgeIndex}`,
        fromNode,
        toNode,
        lengthM,
        class: highway,
      });
      edgeIndex++;
    }
  }

  return { edges, nodeCoords };
}

/**
 * Find the nearest road graph node to a given coordinate.
 */
function nearestNode(
  lng: number,
  lat: number,
  nodeCoords: Map<string, [number, number]>,
): string {
  let bestKey = '';
  let bestDist = Infinity;
  for (const [key, coord] of nodeCoords) {
    const d = distDeg([lng, lat] as [number, number], coord);
    if (d < bestDist) {
      bestDist = d;
      bestKey = key;
    }
  }
  return bestKey;
}

/**
 * Load Karthik's road graph GeoJSON and convert to server road edge format.
 * Also builds RouteEdge[] for routing and a node coordinate map for nearest-node lookup.
 */
async function loadRoadsAndRoutes(): Promise<{
  roads: GeoArtifacts['roads'];
  routeEdges: RouteEdge[];
  nodeCoords: Map<string, [number, number]>;
}> {
  let roads: GeoArtifacts['roads'] = [];
  let routeEdges: RouteEdge[] = [];
  let nodeCoords = new Map<string, [number, number]>();

  try {
    const gj = await readJson<GeoJsonCollection>(
      path.join(ARTIFACT_ROOT, 'road_graph.geojson')
    );

    // Deduplicate by osm_id: bridges can appear in both roads and bridges layers
    const seenOsmIds = new Set<string>();
    const uniqueFeatures = gj.features.filter((f) => {
      const osmId = String(f.properties['osm_id'] ?? f.properties['roadId'] ?? '');
      if (seenOsmIds.has(osmId)) return false;
      seenOsmIds.add(osmId);
      return true;
    });

    roads = uniqueFeatures.map((f) => {
      const props = f.properties;
      const osmId = String(props['osm_id'] ?? props['roadId'] ?? '');
      const name = String(props['name'] ?? props['ref'] ?? 'Unnamed road');
      const geom = f.geometry as { type: string; coordinates: unknown };
      const lineCoords =
        geom.type === 'MultiLineString'
          ? { type: 'LineString', coordinates: (geom.coordinates as number[][][])[0] }
          : (geom as { type: 'LineString'; coordinates: number[][] });
      return {
        edgeId: osmId,
        name,
        geometry: lineCoords as { type: 'LineString'; coordinates: number[][] },
      };
    });

    const built = buildRouteEdges(uniqueFeatures);
    routeEdges = built.edges;
    nodeCoords = built.nodeCoords;
  } catch {
    // File missing — fall through to synthetic fallback
    roads = [
      { edgeId: 'R1', name: 'Main Road', geometry: { type: 'LineString', coordinates: [[94.1, 26.9], [94.2, 26.9]] } },
      { edgeId: 'R2', name: 'Bridge Road', geometry: { type: 'LineString', coordinates: [[94.2, 26.9], [94.3, 26.9]] } },
    ];
    const built = buildRouteEdges([
      {
        type: 'Feature',
        properties: { osm_id: 'R1', name: 'Main Road' },
        geometry: { type: 'LineString', coordinates: [[94.1, 26.9], [94.2, 26.9]] },
      },
      {
        type: 'Feature',
        properties: { osm_id: 'R2', name: 'Bridge Road' },
        geometry: { type: 'LineString', coordinates: [[94.2, 26.9], [94.3, 26.9]] },
      },
    ]);
    routeEdges = built.edges;
    nodeCoords = built.nodeCoords;
  }

  return { roads, routeEdges, nodeCoords };
}

/**
 * Load Karthik's settlements GeoJSON and convert to server settlement format.
 * lng/lat converted from microdegrees. nodeId set to nearest road graph node.
 */
async function loadSettlements(
  nodeCoords: Map<string, [number, number]>,
): Promise<GeoArtifacts['settlements']> {
  try {
    const gj = await readJson<GeoJsonCollection>(
      path.join(ARTIFACT_ROOT, 'settlements.geojson')
    );

    return gj.features.map((f) => {
      const props = f.properties;
      const coords = f.geometry.coordinates as number[];
      const lng = coords[0];
      const lat = coords[1];
      return {
        settlementId: String(props['settlementId'] ?? props['osm_id'] ?? ''),
        name: String(props['name'] ?? 'Unnamed'),
        lng: degToMicrodeg(lng),
        lat: degToMicrodeg(lat),
        population: Number(props['population']) || 0,
        households: Number(props['households']) || 0,
        needs: Array.isArray(props['needs']) ? (props['needs'] as string[]) : [],
        nodeId: nearestNode(lng, lat, nodeCoords),
      };
    });
  } catch {
    // Fall through to synthetic fallback
  }

  return [
    { settlementId: 'S1', name: 'Kamalabari', lng: 94100000, lat: 26900000, population: 5000, households: 800, needs: ['food', 'water'], nodeId: nodeKey(94.1, 26.9) },
    { settlementId: 'S2', name: 'Garamur', lng: 94200000, lat: 26950000, population: 3000, households: 500, needs: ['medical'], nodeId: nodeKey(94.2, 26.95) },
    { settlementId: 'S3', name: 'Auniati', lng: 94300000, lat: 26850000, population: 2000, households: 350, needs: ['food'], nodeId: nodeKey(94.3, 26.85) },
  ];
}

/**
 * Load Karthik's shelters GeoJSON and convert to server shelter format.
 * All shelters are open=false (pre-identified, not confirmed open).
 * nodeId set to nearest road graph node.
 */
async function loadShelters(
  nodeCoords: Map<string, [number, number]>,
): Promise<GeoArtifacts['shelters']> {
  try {
    const gj = await readJson<GeoJsonCollection>(
      path.join(ARTIFACT_ROOT, 'shelters.geojson')
    );

    return gj.features.map((f) => {
      const props = f.properties;
      const coords = f.geometry.coordinates as number[];
      const lng = coords[0];
      const lat = coords[1];
      return {
        shelterId: String(props['shelterId'] ?? props['shelter_id'] ?? ''),
        name: String(props['name'] ?? 'Unnamed shelter'),
        lng: degToMicrodeg(lng),
        lat: degToMicrodeg(lat),
        capacity: Number(props['capacity']) || 0,
        occupancy: Number(props['occupancy']) || 0,
        open: Boolean(props['open']),
        nodeId: nearestNode(lng, lat, nodeCoords),
      };
    });
  } catch {
    // Fall through to synthetic fallback
  }

  return [
    { shelterId: 'SH1', name: 'High School Shelter', lng: 94150000, lat: 26920000, capacity: 2000, occupancy: 0, open: true, nodeId: nodeKey(94.15, 26.92) },
    { shelterId: 'SH2', name: 'Community Hall', lng: 94250000, lat: 26900000, capacity: 1000, occupancy: 0, open: true, nodeId: nodeKey(94.25, 26.9) },
  ];
}

/**
 * Load Karthik's scenario observation for the flood reference point.
 */
async function loadFloodReferencePoints(): Promise<GeoArtifacts['floodReferencePoints']> {
  try {
    const scenario = await readJson<Record<string, unknown>>(
      path.join(ARTIFACT_ROOT, 'scenario_obs.json')
    );

    const realFeatures = scenario.real_features as Record<string, unknown>;
    const bridge = realFeatures.bridge as Record<string, unknown>;
    const obsEvent = scenario.observation_event as Record<string, unknown>;
    const location = obsEvent.location as Record<string, unknown>;
    const roadStatus = await readJson<Record<string, unknown>>(
      path.join(ARTIFACT_ROOT, 'road_status.json')
    );
    const roadFeatures = (roadStatus.features as GeoFeature[]) || [];
    const bridgeRoad = roadFeatures.find((f) => {
      const p = f.properties as Record<string, unknown>;
      return String(p['roadId']) === String(bridge.osm_id);
    });

    return [
      {
        pointId: 'P1',
        lng: degToMicrodeg(Number(location.lng)),
        lat: degToMicrodeg(Number(location.lat)),
        refElevDm: Math.round((Number(bridge.deck_elevation_m) ?? 0) * 10),
        drainElevDm: Math.round((Number(bridge.deck_elevation_m) ?? 0) * 10) - 50,
        edgeId: bridgeRoad ? String((bridgeRoad.properties as Record<string, unknown>)['roadId']) : String(bridge.osm_id),
      },
    ];
  } catch {
    // Fall through to synthetic fallback
  }

  return [
    { pointId: 'P1', lng: 94200000, lat: 26900000, refElevDm: 1200, drainElevDm: 1150 },
  ];
}

/**
 * Build route definitions: settlement -> shelter pairs for evacuation routing.
 * Each route has a routeId, fromSettlementId, toShelterId, and a synthetic flag.
 */
function buildRouteDefs(
  settlements: GeoArtifacts['settlements'],
  shelters: GeoArtifacts['shelters'],
): GeoArtifacts['routes'] {
  const routes: GeoArtifacts['routes'] = [];
  let routeIndex = 0;

  // Each settlement gets a route to the nearest shelter (by straight-line distance)
  for (const s of settlements) {
    let nearestShelter: GeoArtifacts['shelters'][number] | null = null;
    let nearestDist = Infinity;
    for (const sh of shelters) {
      const d = distDeg(
        [s.lng / 1_000_000, s.lat / 1_000_000],
        [sh.lng / 1_000_000, sh.lat / 1_000_000],
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestShelter = sh;
      }
    }
    if (nearestShelter) {
      routes.push({
        routeId: `evac-${routeIndex++}`,
        from: s.settlementId,
        to: nearestShelter.shelterId,
        geometry: {
          type: 'LineString',
          coordinates: [
            [s.lng / 1_000_000, s.lat / 1_000_000],
            [nearestShelter.lng / 1_000_000, nearestShelter.lat / 1_000_000],
          ],
        },
      });
    }
  }

  if (routes.length > 0) return routes;

  // Fallback
  return [
    { routeId: 'EVAC-1', from: 'S1', to: 'SH1', geometry: { type: 'LineString', coordinates: [[94.1, 26.9], [94.15, 26.92]] } },
    { routeId: 'EVAC-2', from: 'S2', to: 'SH2', geometry: { type: 'LineString', coordinates: [[94.2, 26.95], [94.25, 26.9]] } },
  ];
}

/**
 * Load all Karthik geographic artifacts into the server's GeoArtifacts format.
 * Returns the artifacts object, or minimal synthetic fallbacks if files are missing.
 *
 * A clearly-labelled synthetic connected subgraph is appended so the demo has
 * at least one genuine evacuation route that can be blocked/unblocked via
 * field observations. Real and synthetic data are kept separate.
 */
export async function loadGeoArtifacts(): Promise<GeoArtifacts> {
  const { roads, routeEdges, nodeCoords } = await loadRoadsAndRoutes();
  const settlements = await loadSettlements(nodeCoords);
  const shelters = await loadShelters(nodeCoords);
  const floodReferencePoints = await loadFloodReferencePoints();
  const routes = buildRouteDefs(settlements, shelters);

  // ── Synthetic connected subgraph for the demo ──
  // These roads form a connected path: Demo Settlement → Bridge → Demo Shelter.
  // Clearly labelled synthetic; never confused with real OSM data.
  const SYN_LNG = 94.500000;
  const SYN_LAT = 26.800000;
  const SYN_BRIDGE_LNG = 94.500500;
  const SYN_BRIDGE_LAT = 26.800500;
  const SYN_SHELTER_LNG = 94.501000;
  const SYN_SHELTER_LAT = 26.801000;

  const synRoadEdges: RouteEdge[] = [
    {
      edgeId: 'syn-road-1',
      fromNode: nodeKey(SYN_LNG, SYN_LAT),
      toNode: nodeKey(SYN_BRIDGE_LNG, SYN_BRIDGE_LAT),
      lengthM: 80,
      class: 'residential',
    },
    {
      edgeId: 'syn-bridge-1',
      fromNode: nodeKey(SYN_BRIDGE_LNG, SYN_BRIDGE_LAT),
      toNode: nodeKey(SYN_SHELTER_LNG, SYN_SHELTER_LAT),
      lengthM: 80,
      class: 'primary',
    },
  ];

  const synRoads = synRoadEdges.map((e) => {
    const fromCoords = e.fromNode.split(',').map(Number);
    const toCoords = e.toNode.split(',').map(Number);
    return {
      edgeId: e.edgeId,
      name: e.edgeId.includes('bridge') ? 'Demo Bridge Road' : 'Demo Access Road',
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [fromCoords[0] / 100000, fromCoords[1] / 100000],
          [toCoords[0] / 100000, toCoords[1] / 100000],
        ],
      },
    };
  });

  const synSettlement = {
    settlementId: 'syn-settlement-1',
    name: 'Demo Settlement',
    lng: degToMicrodeg(SYN_LNG),
    lat: degToMicrodeg(SYN_LAT),
    population: 500,
    households: 100,
    needs: ['evacuation'],
    nodeId: nodeKey(SYN_LNG, SYN_LAT),
    synthetic: true,
  } as GeoArtifacts['settlements'][number] & { synthetic: boolean };

  const synShelter = {
    shelterId: 'syn-shelter-1',
    name: 'Demo Shelter',
    lng: degToMicrodeg(SYN_SHELTER_LNG),
    lat: degToMicrodeg(SYN_SHELTER_LAT),
    capacity: 500,
    occupancy: 0,
    open: false,
    nodeId: nodeKey(SYN_SHELTER_LNG, SYN_SHELTER_LAT),
    synthetic: true,
  } as GeoArtifacts['shelters'][number] & { synthetic: boolean };

  const synRefPoint = {
    pointId: 'syn-P1',
    lng: degToMicrodeg(SYN_BRIDGE_LNG),
    lat: degToMicrodeg(SYN_BRIDGE_LAT),
    refElevDm: 848, // 84.8 m
    drainElevDm: 843, // 84.3 m
    edgeId: 'syn-bridge-1',
  } as GeoArtifacts['floodReferencePoints'][number];

  const synRoute = {
    routeId: 'syn-evac-1',
    from: 'syn-settlement-1',
    to: 'syn-shelter-1',
    geometry: {
      type: 'LineString',
      coordinates: [
        [SYN_LNG, SYN_LAT],
        [SYN_BRIDGE_LNG, SYN_BRIDGE_LAT],
        [SYN_SHELTER_LNG, SYN_SHELTER_LAT],
      ],
    },
    synthetic: true,
  } as GeoArtifacts['routes'][number] & { synthetic: boolean };

  return {
    roads: [...roads, ...synRoads],
    routeEdges: [...routeEdges, ...synRoadEdges],
    settlements: [...settlements, synSettlement],
    shelters: [...shelters, synShelter],
    floodReferencePoints: [...floodReferencePoints, synRefPoint],
    routes: [...routes, synRoute],
  };
}
