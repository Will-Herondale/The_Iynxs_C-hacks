// ULID v1 — time-sortable identifier, zero dependencies.
// Encoded as 26 chars Crockford Base32: 10-byte timestamp + 16-byte randomness.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function crockfordEncode(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let val = 0;
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(val >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += CROCKFORD[(val << (5 - bits)) & 0x1f];
  }
  return out;
}

function crockfordDecode(s: string): Uint8Array {
  const bytes: number[] = [];
  let bits = 0;
  let val = 0;
  for (const ch of s) {
    const d = CROCKFORD.indexOf(ch);
    if (d < 0) throw new Error(`Invalid ULID character: ${ch}`);
    val = (val << 5) | d;
    bits += 5;
    if (bits >= 8) {
      bytes.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
    globalThis.crypto.getRandomValues(buf);
  return buf;
}

export interface UlidOptions {
  /** Timestamp in ms. Defaults to Date.now() (only at envelope creation, not in folds). */
  timestamp?: number;
  /** Entropy source. Defaults to crypto.getRandomValues. */
  random?: () => Uint8Array;
}

export function ulid(opts: UlidOptions = {}): string {
  let ms = opts.timestamp ?? Date.now();
  const tsBytes = new Uint8Array(6);
  for (let i = 5; i >= 0; i--) {
    tsBytes[i] = ms & 0xff;
    ms = Math.floor(ms / 256);
  }
  const randBytes = (opts.random ?? randomBytes)(10);
  const all = new Uint8Array([...tsBytes, ...randBytes]);
  return crockfordEncode(all);
}

export function ulidTimestamp(id: string): number {
  const bytes = crockfordDecode(id.slice(0, 12));
  let ms = 0;
  for (let i = 0; i < 6; i++) {
    ms = ms * 256 + bytes[i];
  }
  return ms;
}

export function ulidIsValid(id: string): boolean {
  if (id.length !== 26) return false;
  try {
    crockfordDecode(id);
    return true;
  } catch {
    return false;
  }
}
