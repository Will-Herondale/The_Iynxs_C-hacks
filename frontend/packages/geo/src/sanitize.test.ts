import { describe, expect, it } from 'vitest';
import { loadGeoLayer, sanitizeCollection } from './layers.js';
import type { GeoFeatureCollection } from './types.js';

const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
const fc = (geometry: unknown): GeoFeatureCollection => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] } as GeoFeatureCollection);

describe('sanitizeCollection', () => {
  it('drops an empty polygon inside a MultiPolygon and keeps the real one unchanged', () => {
    const out = sanitizeCollection(fc({ type: 'MultiPolygon', coordinates: [[ring], []] }));
    expect(out.features).toHaveLength(1);
    expect((out.features[0]!.geometry as { coordinates: unknown }).coordinates).toEqual([[ring]]);
  });
  it('drops a polygon whose outer ring is too short, and short holes', () => {
    expect(sanitizeCollection(fc({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).features).toHaveLength(0);
    const kept = sanitizeCollection(fc({ type: 'Polygon', coordinates: [ring, [[0, 0], [0, 0]]] }));
    expect((kept.features[0]!.geometry as { coordinates: unknown }).coordinates).toEqual([ring]);
  });
  it('leaves points and lines alone', () => {
    const line = fc({ type: 'LineString', coordinates: [[0, 0], [1, 1]] });
    expect(sanitizeCollection(line)).toEqual(line);
  });
  it('the bundled waterbodies layer has no degenerate parts after loading', async () => {
    const water = await loadGeoLayer('waterbodies');
    for (const f of water.features) {
      const g = f.geometry as { type: string; coordinates: unknown[][] };
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates as unknown[][][];
      for (const p of polys) expect((p[0] as unknown[]).length).toBeGreaterThanOrEqual(4);
    }
  });
});
