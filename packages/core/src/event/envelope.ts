// Canonical event envelope — the internal format used by the fold and sync.
// This is NOT the wire format. The wire format (frontend FieldEvent) is
// translated to this envelope at the packages/server API boundary.

import { contentHash } from './content-hash.js';
import { hlcCompare, type HLC } from './hlc.js';
import { ulid, type UlidOptions } from './ulid.js';

export interface Envelope {
  v: 1;
  id: string;                 // ULID — identity only, never trusted for ordering
  origin: string;             // device that CREATED the event; never renumbered by relays
  seq: number;                // gap-free per-origin counter, starts at 1
  hlc: HLC;                   // hybrid logical clock at creation
  vv: Record<string, number>; // causal frontier known to creator: origin -> max seq
  type: string;
  actor: { id: string; role: string };
  subject: string | null;     // canonical entity key, e.g. "edge:way/123456" or "person:PE-0007"
  at: number;                 // epoch ms, observed time (payload data, untrusted)
  payload: unknown;           // no floats — integers, strings, booleans, null, arrays, objects
  hash: string;               // sha256 of canonical JSON of all fields above (excl. hash, sig)
  sig: string | null;         // ed25519 over hash, base64url (optional in v1)
}

export interface EnvelopeInput extends Omit<Envelope, 'id' | 'hash' | 'sig'> {
  id?: string;
}

export async function createEnvelope(
  input: EnvelopeInput,
  opts: UlidOptions = {},
): Promise<Envelope> {
  const id = input.id ?? (await ulid(opts));
  const env: Envelope = {
    v: 1,
    id,
    origin: input.origin,
    seq: input.seq,
    hlc: input.hlc,
    vv: input.vv,
    type: input.type,
    actor: input.actor,
    subject: input.subject,
    at: input.at,
    payload: input.payload,
    hash: '', // filled in below
    sig: input.sig ?? null,
  };
  env.hash = await contentHash(env);
  return env;
}

export function envelopeIsValid(env: Envelope): { valid: boolean; reason?: string } {
  if (env.v !== 1) return { valid: false, reason: 'unsupported schema version' };
  if (!env.id || typeof env.id !== 'string') return { valid: false, reason: 'missing id' };
  if (!env.origin || typeof env.origin !== 'string') return { valid: false, reason: 'missing origin' };
  if (!Number.isInteger(env.seq) || env.seq < 1) return { valid: false, reason: 'invalid seq' };
  if (!env.hlc || typeof env.hlc.l !== 'number' || typeof env.hlc.c !== 'number')
    return { valid: false, reason: 'invalid hlc' };
  if (!env.type || typeof env.type !== 'string') return { valid: false, reason: 'missing type' };
  if (!env.actor || typeof env.actor.id !== 'string') return { valid: false, reason: 'invalid actor' };
  if (typeof env.at !== 'number' || !Number.isFinite(env.at)) return { valid: false, reason: 'invalid at' };
  if (typeof env.payload !== 'object' || env.payload === null) {
    return { valid: false, reason: 'payload must be an object' };
  }
  return { valid: true };
}

export function envelopeEqual(a: Envelope, b: Envelope): boolean {
  return (
    a.id === b.id &&
    a.origin === b.origin &&
    a.seq === b.seq &&
    hlcCompare(a.hlc, b.hlc) === 0 &&
    a.type === b.type &&
    a.subject === b.subject &&
    a.at === b.at &&
    JSON.stringify(a.payload) === JSON.stringify(b.payload) &&
    a.hash === b.hash
  );
}

/**
 * Causal ordering: does a happen-before b based on vector clocks?
 * Returns true if a.vv <= b.vv for all origins and a strictly precedes b in at least one.
 */
export function happensBefore(a: Envelope, b: Envelope): boolean {
  const origins = new Set([...Object.keys(a.vv), ...Object.keys(b.vv)]);
  let strictlyLess = false;
  for (const o of origins) {
    const av = a.vv[o] ?? 0;
    const bv = b.vv[o] ?? 0;
    if (av > bv) return false;
    if (av < bv) strictlyLess = true;
  }
  return strictlyLess;
}

/**
 * Total order for deterministic folding: (hlc.l, hlc.c, origin, seq, id).
 * This is consistent with happens-before but imposes an order on concurrent events.
 */
export function totalOrder(a: Envelope, b: Envelope): number {
  const hlc = hlcCompare(a.hlc, b.hlc);
  if (hlc !== 0) return hlc;
  if (a.origin < b.origin) return -1;
  if (a.origin > b.origin) return 1;
  if (a.seq < b.seq) return -1;
  if (a.seq > b.seq) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
