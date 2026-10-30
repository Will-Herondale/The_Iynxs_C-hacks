import { type GeoArtifacts } from './projection';

/**
 * Synthetic Majuli geo artifacts for G1.
 * Minimal fixture so the server can serve projections without real geo data.
 */

function nodeKey(lng: number, lat: number): string {
  return `${Math.round(lng * 100000)},${Math.round(lat * 100000)}`;
}

export const SYNTHETIC_ARTIFACTS: GeoArtifacts = {
  roads: [
    { edgeId: 'R1', name: 'Main Road', geometry: { type: 'LineString', coordinates: [[94.1, 26.9], [94.2, 26.9]] } },
    { edgeId: 'R2', name: 'Bridge Road', geometry: { type: 'LineString', coordinates: [[94.2, 26.9], [94.3, 26.9]] } },
    { edgeId: 'R3', name: 'Village Path', geometry: { type: 'LineString', coordinates: [[94.1, 26.95], [94.2, 26.95]] } },
  ],
  routeEdges: [
    { edgeId: 'R1-0', fromNode: nodeKey(94.1, 26.9), toNode: nodeKey(94.2, 26.9), lengthM: 11100, class: 'residential' },
    { edgeId: 'R2-0', fromNode: nodeKey(94.2, 26.9), toNode: nodeKey(94.3, 26.9), lengthM: 11100, class: 'residential' },
    { edgeId: 'R3-0', fromNode: nodeKey(94.1, 26.95), toNode: nodeKey(94.2, 26.95), lengthM: 11100, class: 'track' },
  ],
  settlements: [
    { settlementId: 'S1', name: 'Kamalabari', lng: 94100000, lat: 26900000, population: 5000, households: 800, needs: ['food', 'water'], nodeId: nodeKey(94.1, 26.9) },
    { settlementId: 'S2', name: 'Garamur', lng: 94200000, lat: 26950000, population: 3000, households: 500, needs: ['medical'], nodeId: nodeKey(94.2, 26.95) },
    { settlementId: 'S3', name: 'Ahatguri', lng: 94300000, lat: 26850000, population: 2000, households: 350, needs: ['food'], nodeId: nodeKey(94.3, 26.85) },
  ],
  shelters: [
    { shelterId: 'SH1', name: 'High School Shelter', lng: 94150000, lat: 26920000, capacity: 2000, occupancy: 0, open: true, nodeId: nodeKey(94.15, 26.92) },
    { shelterId: 'SH2', name: 'Community Hall', lng: 94250000, lat: 26900000, capacity: 1000, occupancy: 0, open: true, nodeId: nodeKey(94.25, 26.9) },
  ],
  floodReferencePoints: [
    { pointId: 'P1', lng: 94200000, lat: 26900000, refElevDm: 1200, drainElevDm: 1150 },
  ],
  routes: [
    { routeId: 'EVAC-1', from: 'S1', to: 'SH1', geometry: { type: 'LineString', coordinates: [[94.1, 26.9], [94.15, 26.92]] } },
    { routeId: 'EVAC-2', from: 'S2', to: 'SH2', geometry: { type: 'LineString', coordinates: [[94.2, 26.95], [94.25, 26.9]] } },
  ],
};
