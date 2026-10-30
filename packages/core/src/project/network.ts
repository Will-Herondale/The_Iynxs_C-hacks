// Road network projection — planning doc 06.
//
// Converts obs.road events into per-edge passability state for a given
// `asOf` time, using valid-time observation selection with disputed-flag
// resolution. See planning doc 03 (§3.2) for the selection rule.

import { type Envelope, totalOrder } from '../event/envelope.js';

export type RoadState = 'open' | 'partial' | 'blocked' | 'unknown' | 'disputed';
export type BlockageCause = 'water' | 'debris' | 'structural' | 'unknown';

export interface RoadObservation {
  edgeId: string;
  state: RoadState;
  cause: BlockageCause;
  depthDm: number | null;
  validFrom: number;      // epoch ms
  validUntil: number | null;  // null = open-ended
  confidence: number;     // 0..100
  observedAt: number;     // epoch ms
  hlc: { l: number; c: number };
  origin: string;
  seq: number;
}

export interface EdgePassability {
  edgeId: string;
  state: RoadState;
  depthDm: number | null;
  disputed: boolean;
  sourceEventIds: string[];
  validFrom: number;
  validUntil: number | null;
}

function obsRankKey(o: RoadObservation): [number, number, number, number, string, number] {
  return [o.observedAt, o.confidence, o.hlc.l, o.hlc.c, o.origin, o.seq];
}

function statesDisagree(a: RoadState, b: RoadState): boolean {
  return a !== b;
}

/**
 * For each edge, select the winning observation covering slot time `t`.
 * Returns per-edge passability state.
 */
export function selectRoadState(
  obs: RoadObservation[],
  edgeId: string,
  t: number,
): { winner: RoadObservation | null; runnerUp: RoadObservation[]; disputed: boolean } {
  const candidates = obs.filter(
    (o) =>
      o.edgeId === edgeId &&
      o.validFrom <= t &&
      (o.validUntil === null || t < o.validUntil),
  );

  if (candidates.length === 0) {
    return { winner: null, runnerUp: [], disputed: false };
  }

  // Sort by rank descending: (observedAt, confidence, hlc.l, hlc.c, origin, seq)
  candidates.sort((a, b) => {
    const ra = obsRankKey(a);
    const rb = obsRankKey(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
    }
    return 0; // fully equal keys; stable order is deterministic
  });

  const winner = candidates[0];
  const runnerUp = candidates.slice(1);

  // Disputed if top two disagree on state AND are causally concurrent
  let disputed = false;
  if (runnerUp.length > 0) {
    const top2 = runnerUp[0];
    // Causal concurrency: neither happens-before the other
    // (approximated by identical hlc.l within tolerance + different origin)
    const sameTime = Math.abs(winner.hlc.l - top2.hlc.l) <= 1000; // 1s
    const differentOrigin = winner.origin !== top2.origin;
    const disagree = statesDisagree(winner.state, top2.state);
    if (sameTime && differentOrigin && disagree) disputed = true;
  }

  // Pessimistic bias for water-caused impassability
  let finalState = winner.state;
  if (winner.cause === 'water' && winner.state === 'open') {
    const waterBlocker = runnerUp.find((o) => o.cause === 'water' && o.state === 'blocked');
    if (waterBlocker) finalState = 'blocked';
  }

  return { winner, runnerUp: runnerUp.filter((o) => o !== winner), disputed };
}

export function projectNetwork(
  events: Envelope[],
  edges: Array<{ edgeId: string; class?: string }>,
  asOf: number,
): EdgePassability[] {
  const obs: RoadObservation[] = [];

  for (const env of events) {
    if (env.type !== 'obs.road') continue;
    const p = env.payload as {
      edge_id: string;
      state: RoadState;
      cause: BlockageCause;
      depth_dm: number | null;
      valid_from: number;
      valid_until: number | null;
      confidence: number;
    };
    obs.push({
      edgeId: p.edge_id,
      state: p.state,
      cause: p.cause,
      depthDm: p.depth_dm,
      validFrom: p.valid_from,
      validUntil: p.valid_until,
      confidence: p.confidence,
      observedAt: env.at,
      hlc: env.hlc,
      origin: env.origin,
      seq: env.seq,
    });
  }

  const result: EdgePassability[] = [];
  for (const edge of edges) {
    const { winner, disputed } = selectRoadState(obs, edge.edgeId, asOf);
    if (!winner) {
      result.push({
        edgeId: edge.edgeId,
        state: 'unknown',
        depthDm: null,
        disputed: false,
        sourceEventIds: [],
        validFrom: asOf,
        validUntil: null,
      });
    } else {
      const allObsForEdge = obs.filter((o) => o.edgeId === edge.edgeId);
      result.push({
        edgeId: edge.edgeId,
        state: winner.state,
        depthDm: winner.depthDm,
        disputed,
        sourceEventIds: allObsForEdge.map((o) => `${o.origin}:${o.seq}`),
        validFrom: winner.validFrom,
        validUntil: winner.validUntil,
      });
    }
  }

  return result.sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
}
