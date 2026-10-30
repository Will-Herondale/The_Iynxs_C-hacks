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
}

describe('buildExpandedGraph', () => {
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
