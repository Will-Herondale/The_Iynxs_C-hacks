import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HILLSHADE_COORDINATES } from './hillshadeExtent.js';
import { createOfflineStyle, TERRAIN_SOURCE_ID } from './index.js';

const meta = JSON.parse(readFileSync(new URL('../../data/hillshade.json', import.meta.url), 'utf8')) as { coordinates: number[][]; bounds: number[][] };

describe('terrain image placement', () => {
  it('uses the hillshade image\'s own corners from data/hillshade.json', () => {
    expect(HILLSHADE_COORDINATES).toEqual(meta.coordinates);
  });

  it('the terrain source covers the whole image extent, not the island bounding box', () => {
    const src = createOfflineStyle({ terrain: true }).sources[TERRAIN_SOURCE_ID] as unknown as { coordinates: number[][] };
    expect(src.coordinates).toEqual(meta.coordinates);
    const lngs = src.coordinates.map((c) => c[0]!); const lats = src.coordinates.map((c) => c[1]!);
    expect([Math.min(...lngs), Math.max(...lngs)]).toEqual([meta.bounds[0]![0], meta.bounds[1]![0]]);
    expect([Math.min(...lats), Math.max(...lats)]).toEqual([meta.bounds[0]![1], meta.bounds[1]![1]]);
  });
});
