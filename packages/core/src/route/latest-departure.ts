// Latest safe departure — planning doc 06 §4.
//
// Reverse sweep: L[v] = latest departure slot at node v that still arrives
// by deadline. Computed once per shelter in O(V+E) — all nodes at once.
// Binary search on t0 is INVALID without waiting; reverse sweep is exact.

import {
  buildExpandedGraph,
  type RouteEdge,
  type Passability,
} from './dag.js';

export interface LatestDepartureResult {
  nodeId: string;
  latestDepartSlot: Slot;        // slot index relative to t0
  latestDepartMs: number;        // epoch ms
  waitSchedule: Array<{ nodeId: string; holdSlots: number }>;
  reachable: boolean;
}

export type Slot = number;

/**
 * Reverse sweep: compute latest departure slot at every node to arrive
 * at `dstNode` by `deadlineSlot`.
 *
 * L[dst] = deadlineSlot
 * L[u] = max over arcs (u,k)->(v,k') of k, where k' <= L[v] and arc is valid
 *
 * Processes arcs in reverse slot order.
 */
export function latestSafeDeparture(
  edges: RouteEdge[],
  passByEdge: Map<string, Passability[]>,
  t0: number,
  dstNode: string,
  deadlineSlot: Slot,
  slotLengthMs: number = 60000,
): Map<string, LatestDepartureResult> {
  // Build expanded graph
  const horizonMs = (deadlineSlot + 1) * slotLengthMs;
  const graph = buildExpandedGraph(edges, passByEdge, t0, horizonMs, slotLengthMs);
  const { nodes, arcs, slotCount } = graph;

  // L[node][slot] = latest departure slot at node that reaches dst by deadline
  // We compute L[node] = max slot k such that there's a path from (node,k) to (dst, <=deadlineSlot)
  
  // reachable[node][slot] = can reach dst from (node, slot) by deadline
  const reachable = new Map<string, boolean>(); // "nodeId:slot" -> boolean

  // Destination is reachable at any slot <= deadlineSlot
  for (let s = 0; s <= deadlineSlot && s < slotCount; s++) {
    reachable.set(`${dstNode}:${s}`, true);
  }

  // Process arcs in reverse slot order
  // An arc (u,k)->(v,k') means: if v is reachable at k', then u is reachable at k
  for (let s = slotCount - 1; s >= 0; s--) {
    for (const arc of arcs) {
      if (arc.from.slot !== s) continue;
      const toKey = `${arc.to.nodeId}:${arc.to.slot}`;
      if (!reachable.get(toKey)) continue;

      const fromKey = `${arc.from.nodeId}:${s}`;
      reachable.set(fromKey, true);
    }
  }

  // For each node, find latest reachable slot
  const results = new Map<string, LatestDepartureResult>();
  const allNodes = new Set(nodes.map((n) => n.nodeId));

  for (const nodeId of allNodes) {
    let latestSlot = -1;
    for (let s = slotCount - 1; s >= 0; s--) {
      if (reachable.get(`${nodeId}:${s}`)) {
        latestSlot = s;
        break;
      }
    }

    if (latestSlot >= 0) {
      results.set(nodeId, {
        nodeId,
        latestDepartSlot: latestSlot,
        latestDepartMs: t0 + latestSlot * slotLengthMs,
        waitSchedule: [],
        reachable: true,
      });
    } else {
      results.set(nodeId, {
        nodeId,
        latestDepartSlot: -1,
        latestDepartMs: -1,
        waitSchedule: [],
        reachable: false,
      });
    }
  }

  return results;
}
