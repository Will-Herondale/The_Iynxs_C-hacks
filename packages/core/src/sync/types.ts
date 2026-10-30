// Sync request/response types (planning doc 04, §3).

export interface SyncRequest {
  proto: 1;
  replica_id: string;
  vv: VersionVector;      // requester's contiguous hwm, per origin
  push: Envelope[];       // may be empty; capped at 500
  limit?: number;         // default 500, max 500
}

export interface SyncResponse {
  proto: 1;
  from: string;
  vv: VersionVector;      // responder's hwm after ingesting push
  events: Envelope[];     // ordered by (origin, seq)
  more: boolean;          // true => issue another round immediately
  rejected: Array<{ id: string; reason: string }>;
}

export interface SyncState {
  hwm: VersionVector;     // highest CONTIGUOUS seq per origin
  holes: Map<string, Set<number>>; // seqs seen but not yet contiguous
  seen: Set<string>;      // event id membership
}

export function syncStateEmpty(): SyncState {
  return { hwm: {}, holes: new Map(), seen: new Set() };
}

export type { VersionVector } from './version-vector.js';
export type { Envelope } from '../event/envelope.js';
