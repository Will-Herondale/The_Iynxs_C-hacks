import { describe, expect, it } from 'vitest';
import { hlcNow, hlcUpdate, hlcCompare, hlcInitial } from './hlc.js';

describe('HLC', () => {
  it('starts at now with counter 0 when clock advances', () => {
    // Pin physical time in the past so hlcNow always advances l and resets c.
    const s = { l: Date.now() - 1000, c: 5 };
    const h = hlcNow(s);
    expect(h.l).toBeGreaterThanOrEqual(Date.now() - 1000);
    expect(h.c).toBe(0);
  });

  it('increments counter for same-l events', () => {
    let s = hlcInitial();
    const t = Date.now() + 5000; // future timestamp to pin physical time
    s = { l: t, c: 0 };
    const h1 = hlcNow(s);
    s = { l: h1.l, c: h1.c };
    const h2 = hlcNow(s);
    expect(h2.l).toBe(h1.l);
    expect(h2.c).toBe(h1.c + 1);
  });

  it('advances physical time when clock moves forward', () => {
    let s = { l: 1000, c: 5 };
    const h = hlcNow(s);
    expect(h.l).toBeGreaterThanOrEqual(1000);
    if (h.l === 1000) {
      expect(h.c).toBe(6);
    } else {
      expect(h.c).toBe(0);
    }
  });

  it('compare orders by l then c', () => {
    expect(hlcCompare({ l: 100, c: 0 }, { l: 200, c: 0 })).toBeLessThan(0);
    expect(hlcCompare({ l: 200, c: 0 }, { l: 100, c: 0 })).toBeGreaterThan(0);
    expect(hlcCompare({ l: 100, c: 1 }, { l: 100, c: 2 })).toBeLessThan(0);
    expect(hlcCompare({ l: 100, c: 5 }, { l: 100, c: 5 })).toBe(0);
  });

  it('hlcUpdate takes max physical time', () => {
    const s = { l: 1000, c: 3 };
    const updated = hlcUpdate(s, 1500);
    expect(updated.l).toBe(1500);
    expect(updated.c).toBe(0);
    const updated2 = hlcUpdate(s, 500);
    expect(updated2.l).toBe(1000);
    expect(updated2.c).toBe(4);
  });
});
