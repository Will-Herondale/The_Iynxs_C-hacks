import { describe, expect, it } from 'vitest';
import { ulid, ulidTimestamp, ulidIsValid } from './ulid.js';

describe('ULID', () => {
  it('generates 26-char strings', () => {
    const id = ulid();
    expect(id.length).toBe(26);
    expect(ulidIsValid(id)).toBe(true);
  });

  it('is monotonic in time', () => {
    const a = ulid({ timestamp: 1000 });
    const b = ulid({ timestamp: 2000 });
    expect(ulidTimestamp(a)).toBeLessThan(ulidTimestamp(b));
  });

  it('encodes timestamp correctly', () => {
    const id = ulid({ timestamp: 1234567890123 });
    expect(ulidTimestamp(id)).toBe(1234567890123);
    expect(ulidIsValid(id)).toBe(true);
  });

  it('rejects invalid characters', () => {
    expect(ulidIsValid('000000000000!################')).toBe(false);
    expect(ulidIsValid('too_short')).toBe(false);
    expect(ulidIsValid('')).toBe(false);
  });
});
