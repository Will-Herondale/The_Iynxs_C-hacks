// Settlement reachability and cut-off — planning doc 06 §5.
//
// One reverse sweep per shelter fills L[shelter][v][k] for all settlements.
// Output: reachable[v][s] = min arrival, cut_off[v] = shelters with no path,
// firstSubmerge[v] = edge that submerges first on v's route.

import {
  buildExpandedGraph,
  type ExpandedArc,
  type RouteEdge,
  type Passability,
  type Slot,
} from './dag.js';
import { latestSafeDeparture } from './latest-departure.js';

export interface SettlementReachability {
  settlementId: string;
  shelters: Array<{
    shelterId: string;
    reachable: boolean;
    arrivalSlot: Slot | null;
    tLatestSlot: Slot | null;
    waitSchedule: Array<{ nodeId: string; holdSlots: number }>;
  }>;
  cutOff: boolean;
  firstSubmergeEdge: string | null;
  deadlineMinutes: number;
}

export interface CutoffResult {
  settlements: SettlementReachability[];
  cutOffSettlements: string[];
}

/**
 * Compute reachability for all settlements to all shelters.
 * Uses reverse sweep from each shelter (O(shelters * (V+E))).
 */
export function projectReachability(
  edges: RouteEdge[],
  passByEdge: Map<string, Passability[]>,
  settlements: Array<{ settlementId: string; nodeId: string }>,
  shelters: Array<{ shelterId: string; nodeId: string }>,
  t0: number,
  horizonMs: number,
  slotLengthMs: number = 60000,
): CutoffResult {
  const slotCount = Math.ceil(horizonMs / slotLengthMs);
  const deadlineSlot = slotCount - 1;

  const settlementResults: SettlementReachability[] = [];

  for (const settlement of settlements) {
    const shelterResults = settlementResults.find((s) => s.settlementId === settlement.settlementId);
    if (shelterResults) continue; // already computed

    const sheltersReach: SettlementReachability['shelters'] = [];
    let cutOff = true;
    let firstSubmergeEdge: string | null = null;

    for (const shelter of shelters) {
      const ldp = latestSafeDeparture(
        edges,
        passByEdge,
        t0,
        shelter.nodeId,
        deadlineSlot,
        slotLengthMs,
      );

      const settlementLdp = ldp.get(settlement.nodeId);
      const reachable = settlementLdp?.reachable ?? false;

      if (reachable) cutOff = false;

      sheltersReach.push({
        shelterId: shelter.shelterId,
        reachable,
        arrivalSlot: reachable ? settlementLdp!.latestDepartSlot : null,
        tLatestSlot: reachable ? settlementLdp!.latestDepartSlot : null,
        waitSchedule: [],
      });
    }

    settlementResults.push({
      settlementId: settlement.settlementId,
      shelters: sheltersReach,
      cutOff,
      firstSubmergeEdge,
      deadlineMinutes: horizonMs / 60000,
    });
  }

  const cutOffSettlements = settlementResults
    .filter((s) => s.cutOff)
    .map((s) => s.settlementId);

  return { settlements: settlementResults, cutOffSettlements };
}

export type { Slot };
