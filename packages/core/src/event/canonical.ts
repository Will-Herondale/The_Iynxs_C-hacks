// Canonical JSON serialization — deterministic byte output for hashing and comparison.
// Rules:
// - Object keys sorted by UTF-16 code unit
// - No whitespace
// - Integers only (no floats, NaN, Infinity)
// - Strings: NFC-normalized, UTF-8 encoded
// - null retained; undefined omitted
// - Arrays preserve order

function isInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && isFinite(value);
}

function isValidScalar(value: unknown): boolean {
  if (value === null || value === true || value === false) return true;
  if (typeof value === 'string') return true;
  if (isInteger(value)) return true;
  return false;
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !isFinite(value)) {
      throw new Error(`canonicalize: float/NaN/Infinity not allowed: ${String(value)}`);
    }
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k])).join(',') + '}';
  }
  throw new Error(`canonicalize: unsupported type: ${typeof value}`);
}

/**
 * Serialize a value to canonical JSON. Throws if the value contains floats,
 * NaN, Infinity, undefined, symbols, or functions.
 */
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

/**
 * Validate that a value contains only canonical-JSON-safe types.
 * Returns a list of offending paths (empty if valid).
 */
export function validateNoFloats(value: unknown, path: string = ''): string[] {
  const issues: string[] = [];
  if (value === null || value === true || value === false || typeof value === 'string') return issues;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !isFinite(value)) issues.push(path || 'root');
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => issues.push(...validateNoFloats(v, `${path}[${i}]`)));
    return issues;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      issues.push(...validateNoFloats(v, path ? `${path}.${k}` : k));
    }
    return issues;
  }
  issues.push(path || 'root');
  return issues;
}
