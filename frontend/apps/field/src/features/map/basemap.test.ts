import { describe, expect, it } from 'vitest';
import { BASE_LAYER_IDS } from '@setu/geo';
import { BASEMAP_SOURCE, createBasemapStyle, DISTRICT_CENTER } from './basemap.js';

describe('offline basemap', () => {
  it('is the bundled @setu/geo style with no network URLs', () => {
    expect(BASEMAP_SOURCE).toBe('@setu/geo');
    const style = createBasemapStyle();
    expect(style.layers.map((l) => l.id)).toEqual(expect.arrayContaining([...BASE_LAYER_IDS]));
    const json = JSON.stringify(style);
    expect(json).not.toMatch(/https?:\/\/(?!localhost)/);
    expect(DISTRICT_CENTER[0]).toBeCloseTo(94.2, 0);
  });
});

import { shelterCounts, shelterStatus } from './honesty.js';

describe('shelter honesty', () => {
  it('only open===true is Open (reported)', () => {
    expect(shelterStatus({ open: true, capacity: 0, occupancy: 0 }).label).toBe('Open (reported)');
    expect(shelterStatus({ open: false, capacity: 0, occupancy: 0 })).toEqual({ status: 'pre-identified', label: 'Pre-identified · not confirmed' });
  });
  it('never shows 0/0 as counts', () => {
    expect(shelterCounts({ open: false, capacity: 0, occupancy: 0 })).toBe('not published');
    expect(shelterCounts({ open: true, capacity: 0, occupancy: 0 })).toBe('not published');
    expect(shelterCounts({ open: true, capacity: 10, occupancy: 2 })).toBe('2 of 10');
  });
});
