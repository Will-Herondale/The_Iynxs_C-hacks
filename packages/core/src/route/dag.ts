// Time-expanded DAG routing — planning doc 06.
//
// Builds a (node, slot) expanded graph where every arc strictly increases
// the slot index, making it a DAG. Shortest path = reverse DP in O(V+E).
// Node waiting is encoded as zero-cost self-loops, which restores monotonicity
// and makes the arrival function non-decreasing (FIFO-safe).

export type Slot = number; // index into time slots

export interface RouteEdge {
  edgeId: string;
  fromNode: string;
  toNode: string;
  lengthM: number;
  class: string;
}

export interface Passability {
  edgeId: string;
  passable: boolean;   // depth <= threshold AND not blocked
  travelTimeS: number; // seconds to traverse at this slot
  validFromSlot: Slot;
  validUntilSlot: Slot | null; // null = open-ended
}

export interface ExpandedNode {
  nodeId: string;
  slot: Slot;
}

export interface ExpandedArc {
  from: ExpandedNode;
  to: ExpandedNode;
  costS: number;
}

export interface RouteResult {
  path: string[];          // edgeIds
  etaS: number;
  departAt: number;        // epoch ms
  waits: Array<{ nodeId: string; holdS: number }>;
  replayPassed: boolean;
}

/**
 * Build the time-expanded DAG from route edges and per-slot passability.
 * slotLengthMs: duration of each slot in ms (default 60000 = 1 min).
 */
export function buildExpandedGraph(
  edges: RouteEdge[],
  passByEdge: Map<string, Passability[]>,
  t0: number,           // departure epoch ms
  horizonMs: number,    // total horizon
  slotLengthMs: number = 60000,
): { nodes: ExpandedNode[]; arcs: ExpandedArc[]; slotCount: number; slotOf: (t: number) => Slot } {
  const slotCount = Math.ceil(horizonMs / slotLengthMs);
  const slotOf = (t: number): Slot => Math.floor((t - t0) / slotLengthMs);

  const nodes: ExpandedNode[] = [];
  const nodeIndex = new Map<string, number>(); // "nodeId:slot" -> index
  const arcs: ExpandedArc[] = [];

  // Create all (node, slot) nodes
  const allNodes = new Set<string>();
  for (const e of edges) {
    allNodes.add(e.fromNode);
    allNodes.add(e.toNode);
  }

  for (const nodeId of allNodes) {
    for (let s = 0; s < slotCount; s++) {
      const key = `${nodeId}:${s}`;
      nodeIndex.set(key, nodes.length);
      nodes.push({ nodeId, slot: s });
    }
  }

  // Wait arcs: (node, s) -> (node, s+1) if node is passable at both slots
  for (const nodeId of allNodes) {
    for (let s = 0; s < slotCount - 1; s++) {
      const passCurr = isNodePassable(s, passByEdge);
      const passNext = isNodePassable(s + 1, passByEdge);
      if (passCurr && passNext) {
        arcs.push({
          from: { nodeId, slot: s },
          to: { nodeId, slot: s + 1 },
          costS: 0,
        });
      }
    }
  }

  // Travel arcs: (fromNode, s) -> (toNode, s') where s' = s + ceil(travelTime/slotLengthMs)
  // Edge must be passable for all slots from s to s'
  for (const e of edges) {
    const passList = passByEdge.get(e.edgeId);
    if (!passList) continue;

    for (let s = 0; s < slotCount; s++) {
      const pass = passList[s];
      if (!pass || !pass.passable) continue;

      const travelSlots = Math.ceil(pass.travelTimeS / (slotLengthMs / 1000));
      const sPrime = s + travelSlots;
      if (sPrime >= slotCount) continue;

      // Verify edge passable for all intermediate slots
      let allPass = true;
      for (let j = s; j <= sPrime && j < slotCount; j++) {
        const pj = passList[j];
        if (!pj || !pj.passable) {
          allPass = false;
          break;
        }
      }
      if (!allPass) continue;

      // Destination node must be passable at arrival slot
      const destPass = isNodePassable(sPrime, passByEdge);
      if (!destPass) continue;

      arcs.push({
        from: { nodeId: e.fromNode, slot: s },
        to: { nodeId: e.toNode, slot: sPrime },
        costS: pass.travelTimeS,
      });
    }
  }

  return { nodes, arcs, slotCount, slotOf };
}

function isNodePassable(
  slot: Slot,
  passByEdge: Map<string, Passability[]>,
): boolean {
  // A node is passable if at least one incident edge is passable at this slot
  // (node itself isn't flooded; edges define passability)
  for (const [, passList] of passByEdge) {
    const p = passList[slot];
    if (p && p.passable) return true;
  }
  return true; // default passable if no data
}

/**
 * Reverse DP on the DAG: compute earliest arrival at every (node, slot)
 * from source (srcNode, srcSlot).
 */
export function earliestArrivalFrom(
  srcNode: string,
  srcSlot: Slot,
  { arcs, slotCount }: ReturnType<typeof buildExpandedGraph>,
): Map<string, number> {
  // nodeId -> earliest arrival slot index (or Infinity)
  const bestSlot = new Map<string, number>();
  bestSlot.set(srcNode, srcSlot);

  // Process in decreasing slot order (reverse topological)
  for (let s = slotCount - 1; s >= 0; s--) {
    // For each arc arriving at slot s, relax the source node
    for (const arc of arcs) {
      if (arc.to.slot !== s) continue;
      const fromSlot = arc.from.slot;
      const currentBest = bestSlot.get(arc.from.nodeId) ?? Infinity;
      if (fromSlot < currentBest) {
        bestSlot.set(arc.from.nodeId, fromSlot);
      }
    }
  }

  return bestSlot;
}

/**
 * Find fastest path from src to dst departing at srcSlot.
 * Returns path edges and eta.
 */
export function findFastestPath(
  srcNode: string,
  dstNode: string,
  srcSlot: Slot,
  graph: ReturnType<typeof buildExpandedGraph>,
): { path: string[]; etaS: number; waits: Array<{ nodeId: string; holdS: number }> | null } {
  const { arcs, slotCount } = graph;

  // Forward DP: earliest arrival slot at each (node, slot)
  // dist[node][slot] = earliest arrival slot at node when departing src at srcSlot
  const dist = new Map<string, number>(); // "nodeId:slot" -> arrival slot
  const prev = new Map<string, { arc: ExpandedArc; prevSlot: Slot }>();

  const srcKey = `${srcNode}:${srcSlot}`;
  dist.set(srcKey, srcSlot);

  // Process in increasing slot order (topological)
  for (let s = 0; s < slotCount; s++) {
    // Wait arcs propagate within same node
    for (const arc of arcs) {
      if (arc.from.slot !== s) continue;
      const fromKey = `${arc.from.nodeId}:${s}`;
      const toKey = `${arc.to.nodeId}:${arc.to.slot}`;
      const currentDist = dist.get(fromKey);
      if (currentDist === undefined) continue;

      const arrivalAtTo = arc.to.slot;
      const existing = dist.get(toKey);
      if (existing === undefined || arrivalAtTo < existing) {
        dist.set(toKey, arrivalAtTo);
        prev.set(toKey, { arc, prevSlot: s });
      }
    }
  }

  // Find best arrival at dst across all slots
  let bestDstSlot = Infinity;
  let bestDstKey = '';
  for (let s = 0; s < slotCount; s++) {
    const key = `${dstNode}:${s}`;
    const d = dist.get(key);
    if (d !== undefined && d < bestDstSlot) {
      bestDstSlot = d;
      bestDstKey = key;
    }
  }

  if (bestDstSlot === Infinity) {
    return { path: [], etaS: 0, waits: null };
  }

  // Reconstruct path
  const pathEdges: string[] = [];
  const waits: Array<{ nodeId: string; holdS: number }> = [];
  let currentKey = bestDstKey;

  while (currentKey !== srcKey) {
    const p = prev.get(currentKey);
    if (!p) break;
    const arc = p.arc;
    if (arc.costS > 0) {
      pathEdges.unshift(arc.from.nodeId === arc.to.nodeId ? '' : arc.from.nodeId + '->' + arc.to.nodeId);
    }
    if (arc.from.slot === arc.to.slot && arc.from.nodeId === arc.to.nodeId) {
      // Wait arc
      waits.push({ nodeId: arc.from.nodeId, holdS: 0 }); // wait is 1 slot = slotLengthMs
    }
    currentKey = `${arc.from.nodeId}:${p.prevSlot}`;
  }

  pathEdges.reverse();
  waits.reverse();

  const etaS = (bestDstSlot - srcSlot) * 60; // 1 min per slot
  return { path: pathEdges, etaS, waits };
}
