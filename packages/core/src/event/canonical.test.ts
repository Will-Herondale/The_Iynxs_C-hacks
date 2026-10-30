import { describe, expect, it } from 'vitest';
import { canonicalJson, validateNoFloats } from './canonical.js';

describe('canonical JSON', () => {
  it('sorts object keys', () => {
    const a = canonicalJson({ b: 1, a: 2 });
    const b = canonicalJson({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([2, 1])).toBe('[2,1]');
    expect(canonicalJson([1, 2])).toBe('[1,2]');
  });

  it('handles nested objects and arrays', () => {
    const v = canonicalJson({ z: [3, 1], a: { b: 2, c: 1 } });
    expect(v).toBe('{"a":{"b":2,"c":1},"z":[3,1]}');
  });

  it('handles null and booleans', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson({ x: null, y: false })).toBe('{"x":null,"y":false}');
  });

  it('rejects floats', () => {
    expect(() => canonicalJson(1.5)).toThrow();
    expect(() => canonicalJson({ x: 1.5 })).toThrow();
    expect(() => canonicalJson([1, 2.5])).toThrow();
  });

  it('validateNoFloats reports paths', () => {
    const issues = validateNoFloats({ a: 1, b: 2.5, c: { d: 3.14 } });
    expect(issues).toContain('b');
    expect(issues).toContain('c.d');
  });

  it('accepts integers', () => {
    expect(canonicalJson(0)).toBe('0');
    expect(canonicalJson(-5)).toBe('-5');
    expect(canonicalJson({ n: 42 })).toBe('{"n":42}');
  });
});
