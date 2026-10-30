import { describe, expect, it } from 'vitest';
import {
  buildExpandedGraph,
  findFastestPath,
  latestSafeDeparture,
  projectReachability,
  type RouteEdge,
  type Passability,
} from './index.js';

function makePassability(
  edgeId: string,
  passable: boolean,
  travelTimeS: number,
  slots: number,
): Passability[] {
  return Array.from({ length: slots }, () => ({
    edgeId,
    passable,
    travelTimeS,
    validFromSlot: 0,
    validUntilSlot: null,
  }));
}describe('buildExpandedGraph', () => {
  it('creates nodes and arcs for simple graph', () => {
    const edges: RouteEdge[] = [
      { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
    ];
    const pass = new Map<string, Passability[]>([
      ['E1', makePassability('E1', true, 60, 10)],
    ]);
    const graph = buildExpandedGraph(edges, pass, 0, 600000, 60000);
    expect(graph.slotCount).toBe(10);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.arcs.length).toBeGreaterThan(0);
  });
});

describe('findFastestPath', () => {
  it('finds path when all edges passable', () => {
    const edges: RouteEdge[] = [
      { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
      { edgeId: 'E2', fromNode: 'B', toNode: 'C', lengthM: 1000, class: 'residential' },
    ];
    const pass = new Map<string, Passability[]>([
      ['E1', makePassability('E1', true, 60, 10)],
      ['E2', makePassability('E2', true, 60, 10)],
    ]);
    const graph = buildExpandedGraph(edges, pass, 0, 600000, 60000);
    const result = findFastestPath('A', 'C', 0, graph);
    expect(result.path.length).toBeGreaterThan(0);
    expect(result.etaS).toBeGreaterThan(0);
    expect(result.waits).not.toBeNull();
  });

  it('returns empty path when unreachable', () => {
    const edges: RouteEdge[] = [
      { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
    ];
    const pass = new Map<string, Passability[]>([
      ['E1', makePassability('E1', false, 60, 10)],
    ]);
    const graph = buildExpandedGraph(edges, pass, 0, 600000, 60000);
    const result = findFastestPath('A', 'B', 0, graph);
    expect(result.path.length).toBe(0);
    expect(result.waits).toBeNull();
  });
});

describe('latestSafeDeparture', () => {
  it('computes latest departure for reachable node', () => {
    const edges: RouteEdge[] = [
      { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
    ];
    const pass = new Map<string, Passability[]>([
      ['E1', makePassability('E1', true, 60, 10)],
    ]);
    const result = latestSafeDeparture(edges, pass, 0, 'B', 5, 60000);
    expect(result.has('A')).toBe(true);
    expect(result.get('A')?.reachable).toBe(true);
    expect(result.get('A')?.latestDepartSlot).toBeGreaterThanOrEqual(0);
  });
});

describe('projectReachability', () => {
  it('computes reachability for settlements and shelters', () => {
    const edges: RouteEdge[] = [
      { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
    ];
    const pass = new Map<string, Passability[]>([
      ['E1', makePassability('E1', true, 60, 10)],
    ]);
    const settlements = [{ settlementId: 'S1', nodeId: 'A' }];
    const shelters = [{ shelterId: 'SH1', nodeId: 'B' }];
    const result = projectReachability(edges, pass, settlements, shelters, 0, 600000, 60000);
    expect(result.settlements).toHaveLength(1);
    expect(result.settlements[0].shelters).toHaveLength(1);
    expect(result.settlements[0].shelters[0].reachable).toBe(true);
    expect(result.cutOffSettlements).toHaveLength(0);
  });

  it('marks settlement cut off when no path', () => {
    const edges: RouteEdge[] = [
      { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
    ];
    const pass = new Map<string, Passability[]>([
      ['E1', makePassability('E1', false, 60, 10)],
    ]);
    const settlements = [{ settlementId: 'S1', nodeId: 'A' }];
    const shelters = [{ shelterId: 'SH1', nodeId: 'B' }];
    const result = projectReachability(edges, pass, settlements, shelters, 0, 600000, 60000);
    expect(result.settlements[0].cutOff).toBe(true);
    expect(result.cutOffSettlements).toContain('S1');
  });
});

describe('Route recalculation after road becomes impassable', () => {
  const baseEdges: RouteEdge[] = [
    { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
    { edgeId: 'E2', fromNode: 'B', toNode: 'C', lengthM: 1000, class: 'residential' },
    { edgeId: 'E3', fromNode: 'A', toNode: 'C', lengthM: 3000, class: 'residential' }, // longer detour
  ];

  it('recalculates route when primary road becomes blocked', () => {
    const slots = 10;
    const passAll = new Map<string, Passability[]>([
      ['E1', makePassability('E1', true, 60, slots)],
      ['E2', makePassability('E2', true, 60, slots)],
      ['E3', makePassability('E3', true, 180, slots)],
    ]);

    // All passable: fastest path is A->B->C (120s) not A->C (180s)
    const graphAll = buildExpandedGraph(baseEdges, passAll, 0, 600000, 60000);
    const resultAll = findFastestPath('A', 'C', 0, graphAll);
    expect(resultAll.path.length).toBeGreaterThan(0);
    expect(resultAll.etaS).toBe(120);

    // Block E2: must detour via E3 (180s)
    const passBlocked = new Map<string, Passability[]>([
      ['E1', makePassability('E1', true, 60, slots)],
      ['E2', makePassability('E2', false, 60, slots)],
      ['E3', makePassability('E3', true, 180, slots)],
    ]);
    const graphBlocked = buildExpandedGraph(baseEdges, passBlocked, 0, 600000, 60000);
    const resultBlocked = findFastestPath('A', 'C', 0, graphBlocked);
    expect(resultBlocked.path.length).toBeGreaterThan(0);
    expect(resultBlocked.etaS).toBe(180);
    expect(resultBlocked.etaS).toBeGreaterThan(resultAll.etaS);
  });

  it('returns no path when all routes blocked', () => {
    const slots = 10;
    const passAllBlocked = new Map<string, Passability[]>([
      ['E1', makePassability('E1', false, 60, slots)],
      ['E2', makePassability('E2', false, 60, slots)],
      ['E3', makePassability('E3', false, 60, slots)],
    ]);
    const graph = buildExpandedGraph(baseEdges, passAllBlocked, 0, 600000, 60000);
    const result = findFastestPath('A', 'C', 0, graph);
    expect(result.path.length).toBe(0);
    expect(result.etaS).toBe(0);
    expect(result.waits).toBeNull();
  });

  it('graph connectivity: disconnected components yield no route', () => {
    const edges: RouteEdge[] = [
      { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
      { edgeId: 'E2', fromNode: 'C', toNode: 'D', lengthM: 1000, class: 'residential' }, // separate component
    ];
    const pass = new Map<string, Passability[]>([
      ['E1', makePassability('E1', true, 60, 10)],
      ['E2', makePassability('E2', true, 60, 10)],
    ]);
    const graph = buildExpandedGraph(edges, pass, 0, 600000, 60000);
    // A and D are in different components — no route
    const result = findFastestPath('A', 'D', 0, graph);
    expect(result.path.length).toBe(0);
    expect(result.waits).toBeNull();
  });
});

describe('Fixture-provided route/ETA rejection', () => {
  it('computed ETA differs from hardcoded fixture value', () => {
    // Simulates a fixture that claims etaMin=45 (2700s) but the actual
    // routing engine computes a different value. The fixture value must
    // never be trusted over the computed result.
    const edges: RouteEdge[] = [
      { edgeId: 'E1', fromNode: 'A', toNode: 'B', lengthM: 1000, class: 'residential' },
    ];
    const pass = new Map<string, Passability[]>([
      ['E1', makePassability('E1', true, 120, 10)],
    ]);
    const graph = buildExpandedGraph(edges, pass, 0, 600000, 60000);
    const result = findFastestPath('A', 'B', 0, graph);

    const fixtureEtaMin = 45; // hardcoded in synthetic fixture
    const computedEtaMin = Math.ceil(result.etaS / 60);

    expect(computedEtaMin).not.toBe(fixtureEtaMin);
    expect(result.etaS).toBe(120); // 1000m / (1000m/120s) = 120s travel time
  });
});
