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
