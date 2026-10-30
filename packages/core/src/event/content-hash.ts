// Content hash: sha256 over canonical JSON of envelope fields (excluding hash and sig).

import { canonicalJson, validateNoFloats } from './canonical.js';

export interface HashableEnvelope {
  v: number;
  id: string;
  origin: string;
  seq: number;
  hlc: { l: number; c: number };
  vv: Record<string, number>;
  type: string;
  actor: { id: string; role: string };
  subject: string | null;
  at: number;
  payload: unknown;
}

export async function contentHash(env: HashableEnvelope): Promise<string> {
  const issues = validateNoFloats(env.payload);
  if (issues.length > 0) {
    throw new Error(`contentHash: payload contains floats at ${issues.join(', ')}`);
  }

  const fields = {
    v: env.v,
    id: env.id,
    origin: env.origin,
    seq: env.seq,
    hlc: env.hlc,
    vv: env.vv,
    type: env.type,
    actor: env.actor,
    subject: env.subject,
    at: env.at,
    payload: env.payload,
  };

  const canonical = canonicalJson(fields);
  const buf = new TextEncoder().encode(canonical);

  // Web Crypto API (Node 18+ and all browsers). Async digest.
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', buf);
  return hex(new Uint8Array(hashBuf));
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
