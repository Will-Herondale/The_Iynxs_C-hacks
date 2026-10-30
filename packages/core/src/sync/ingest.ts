// Sync ingest algorithm — planning doc 04, §4.
//
// Ingests events into the replica's SyncState, handling:
//   - duplicate delivery (same origin+seq+hash)
//   - out-of-order arrival (holes table)
//   - chunk truncation (partial progress self-heals)
//   - hash collisions (same origin+seq, different hash)
//   - torn writes (truncated trailing line discarded at load)
//
// Returns { state, accepted, rejected, holes } where:
//   accepted: event was stored and hwm may have advanced
//   rejected: event was quarantined (collision or invalid)
//   holes: current hole table after ingest

import { Envelope, envelopeIsValid } from '../event/envelope.js';
import { SyncState, VersionVector, vvGet, vvSet, vvClone } from './types.js';

export interface IngestResult {
  state: SyncState;
  accepted: Envelope[];
  rejected: Array<{ id: string; reason: string; env?: Envelope }>;
}

const MAX_EVENT_BYTES = 64 * 1024;

/**
 * Ingest a single event into the sync state.
 * Never mutates the input state — returns a new state.
 */
export function ingestEvent(state: SyncState, env: Envelope): IngestResult {
  const result: IngestResult = {
    state: {
      hwm: vvClone(state.hwm),
      holes: new Map(state.holes),
      seen: new Set(state.seen),
    },
    accepted: [],
    rejected: [],
  };

  // Validate envelope shape
  const valid = envelopeIsValid(env);
  if (!valid.valid) {
    result.rejected.push({ id: env.id, reason: `invalid envelope: ${valid.reason}` });
    return result;
  }

  // Size limit
  const size = new TextEncoder().encode(JSON.stringify(env)).length;
  if (size > MAX_EVENT_BYTES) {
    result.rejected.push({ id: env.id, reason: `event too large: ${size} bytes` });
    return result;
  }

  const origin = env.origin;
  const seq = env.seq;
  const existingHwm = vvGet(result.state.hwm, origin);

  // Duplicate: same origin+seq already stored
  if (seq <= existingHwm) {
    const existing = result.state.seen.has(env.id);
    if (existing) {
      // Exact duplicate — idempotent, ignore
      return result;
    }
    // Same origin+seq but different id → hash collision
    result.rejected.push({ id: env.id, reason: `collision: origin=${origin} seq=${seq} already stored with different id` });
    return result;
  }

  // Hole: gap before this seq — park it, don't advance hwm
  if (seq > existingHwm + 1) {
    const holes = result.state.holes.get(origin) ?? new Set<number>();
    holes.add(seq);
    result.state.holes.set(origin, holes);
    result.state.seen.add(env.id);
    return result;
  }

  // Contiguous: seq == hwm + 1
  // Store the event and advance hwm
  result.state.seen.add(env.id);
  result.state.hwm = vvSet(result.state.hwm, origin, seq);
  result.accepted.push(env);

  // Advance hwm through any holes we now fill
  let advanced = true;
  while (advanced) {
    advanced = false;
    const nextHwm = vvGet(result.state.hwm, origin) + 1;
    const holes = result.state.holes.get(origin);
    if (holes && holes.has(nextHwm)) {
      holes.delete(nextHwm);
      result.state.hwm = vvSet(result.state.hwm, origin, nextHwm);
      advanced = true;
    }
  }

  return result;
}

/**
 * Ingest a batch of events, ordered by (origin, seq).
 * Returns the final state plus all accepted/rejected events.
 */
export function ingestBatch(state: SyncState, events: Envelope[]): IngestResult {
  let current = state;
  const allAccepted: Envelope[] = [];
  const allRejected: Array<{ id: string; reason: string; env?: Envelope }> = [];

  // Sort deterministically by (origin, seq) — sync protocol delivery order.
  // Total order (hlc-based) is for the fold, not for ingest.
  const sorted = [...events].sort((a, b) => {
    if (a.origin !== b.origin) return a.origin < b.origin ? -1 : 1;
    return a.seq - b.seq;
  });

  for (const env of sorted) {
    const result = ingestEvent(current, env);
    current = result.state;
    allAccepted.push(...result.accepted);
    allRejected.push(...result.rejected);
  }

  return { state: current, accepted: allAccepted, rejected: allRejected };
}

export { MAX_EVENT_BYTES };
