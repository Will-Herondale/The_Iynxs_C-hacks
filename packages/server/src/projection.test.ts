import { describe, expect, it } from 'vitest';
import { createEnvelope, type Envelope, type RouteEdge } from '../../core/src/index';
import { projectSnapshot, type GeoArtifacts } from './projection';

const AS_OF = 1_800_000_000_000;

function makeArtifacts(): GeoArtifacts {
  const first: RouteEdge = {
    edgeId: 'road-42-0',
    sourceRoadId: 'road-42',
    fromNode: 'node-a',
    toNode: 'node-b',
    lengthM: 100,
    class: 'primary',
  };
  const second: RouteEdge = {
    edgeId: 'road-42-1',
    sourceRoadId: 'road-42',
    fromNode: 'node-b',
    toNode: 'node-c',
    lengthM: 100,
    class: 'primary',
  };

  return {
    roads: [{
      edgeId: 'road-42',
      name: 'River Road',
      geometry: { type: 'LineString', coordinates: [[94, 27], [94.002, 27]] },
    }],
    routeEdges: [first, second],
    settlements: [{
      settlementId: 'settlement-a',
      name: 'Settlement A',
      lng: 94_000_000,
      lat: 27_000_000,
      population: 10,
      households: 2,
      needs: [],
      nodeId: 'node-a',
    }],
    shelters: [{
      shelterId: 'shelter-c',
      name: 'Shelter C',
      lng: 94_002_000,
      lat: 27_000_000,
      capacity: 100,
      occupancy: 0,
      open: true,
      nodeId: 'node-c',
    }],
    floodReferencePoints: [],
    routes: [{
      routeId: 'route-a-c',
      from: 'settlement-a',
      to: 'shelter-c',
      geometry: { type: 'LineString', coordinates: [[94, 27], [94.002, 27]] },
    }],
  };
}

async function rawRoadBlockage(): Promise<Envelope> {
  return createEnvelope({
    origin: 'projection-test',
    seq: 1,
    hlc: { l: AS_OF - 1, c: 0 },
    vv: {},
    type: 'obs.road',
    actor: { id: 'projection-test', role: 'operator' },
    subject: 'edge:road-42',
    at: AS_OF - 1,
    payload: {
      edge_id: 'road-42',
      state: 'blocked',
      cause: 'water',
      depth_dm: 50,
      valid_from: AS_OF - 100,
      valid_until: null,
      confidence: 100,
    },
  });
}

describe('route-edge/source-road ID mapping', () => {
  it('does not treat an unmapped real segment as blocked when no road observation exists', () => {
    const snapshot = projectSnapshot([], makeArtifacts(), AS_OF);
    const route = snapshot.routes.features[0];

    expect(route.properties.status).toBe('active');
    expect(route.properties.refusal).toBeUndefined();
  });

  it('computes the route on the road graph and reports its provenance', () => {
    const snapshot = projectSnapshot([], makeArtifacts(), AS_OF);
    const route = snapshot.routes.features[0];

    expect(route.properties.status).toBe('active');
    expect(route.properties.computation).toMatchObject({
      method: 'road_graph',
      verified: true,
      distanceM: 200,
      segmentCount: 2,
      windowMin: 45,
    });
    expect(route.properties.etaMin).toBe(3); // 200 m at 1.3 m/s
  });

  it('refuses a route that cannot reach shelter inside the evacuation window', () => {
    const artifacts = makeArtifacts();
    artifacts.routeEdges = artifacts.routeEdges.map((edge) => ({ ...edge, lengthM: 3000 }));
    const snapshot = projectSnapshot([], artifacts, AS_OF);
    const route = snapshot.routes.features[0];

    expect(route.properties.status).toBe('unavailable');
    expect(route.properties.computation?.verified).toBe(false);
    expect(route.properties.refusal?.summary).toContain('45-minute evacuation window');
  });

  it('maps a raw-road blockage to route segments and names the actual road', async () => {
    const snapshot = projectSnapshot([await rawRoadBlockage()], makeArtifacts(), AS_OF);
    const route = snapshot.routes.features[0];

    expect(route.properties.status).toBe('unavailable');
    expect(route.properties.refusal).toMatchObject({
      blockingFeatureIds: ['road-42-0'],
    });
    expect(route.properties.refusal?.summary).toContain('River Road');
    expect(route.properties.refusal?.summary).not.toContain('road-42-246');
  });
});
