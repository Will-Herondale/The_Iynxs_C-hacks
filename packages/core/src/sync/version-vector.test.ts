import { describe, expect, it } from 'vitest';
import {
  vvEmpty, vvGet, vvSet, vvMerge, vvEqual, vvClone, vvToSortedEntries,
} from './version-vector.js';

describe('version vector', () => {
  it('starts empty', () => {
    expect(vvGet(vvEmpty(), 'a')).toBe(0);
  });

  it('set and get', () => {
    const vv = vvSet(vvEmpty(), 'a', 5);
    expect(vvGet(vv, 'a')).toBe(5);
    expect(vvGet(vv, 'b')).toBe(0);
  });

  it('merge takes max per origin', () => {
    const a = vvSet(vvEmpty(), 'a', 3);
    const b = vvSet(vvEmpty(), 'a', 5);
    vvSet(b, 'c', 2);
    const merged = vvMerge(vvClone(a), b);
    expect(vvGet(merged, 'a')).toBe(5);
    expect(vvGet(merged, 'c')).toBe(2);
  });

  it('equal detects same content', () => {
    const a = vvSet(vvEmpty(), 'a', 1);
    vvSet(a, 'b', 2);
    const b = vvSet(vvEmpty(), 'b', 2);
    vvSet(b, 'a', 1);
    expect(vvEqual(a, b)).toBe(true);
  });

  it('toSortedEntries is deterministic', () => {
    const vv = vvSet(vvEmpty(), 'z', 1);
    vvSet(vv, 'a', 2);
    vvSet(vv, 'm', 3);
    const entries = vvToSortedEntries(vv);
    expect(entries.map(([k]) => k)).toEqual(['a', 'm', 'z']);
  });

  it('clone is independent', () => {
    const a = vvSet(vvEmpty(), 'a', 1);
    const b = vvClone(a);
    vvSet(b, 'a', 99);
    expect(vvGet(a, 'a')).toBe(1);
    expect(vvGet(b, 'a')).toBe(99);
  });
});
