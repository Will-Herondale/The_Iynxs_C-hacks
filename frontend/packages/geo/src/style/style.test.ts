import { describe, expect, it } from 'vitest';
import { createOfflineStyle, addBaseLayers, BASE_LAYER_IDS, selectVisibleLabels } from './index.js';

describe('createOfflineStyle', () => {
  it('has no http(s) URLs, no glyphs, no sprite', () => {
    for (const terrain of [false, true]) {
      const style = createOfflineStyle({ terrain });
      expect(JSON.stringify(style)).not.toMatch(/https?:\/\//);
      expect(style).not.toHaveProperty('glyphs');
      expect(style).not.toHaveProperty('sprite');
      expect(style.layers.some((l) => 'text-field' in (l.layout ?? {}))).toBe(false);
    }
  });

  it('contains all BASE_LAYER_IDS, with terrain only when asked', () => {
    const plain = createOfflineStyle();
    expect(plain.layers.map((l) => l.id)).toEqual([...BASE_LAYER_IDS]);
    const t = createOfflineStyle({ terrain: true });
    expect(t.layers).toHaveLength(plain.layers.length + 1);
    expect(t.layers[1]?.type).toBe('raster');
    expect(t.sources['setu-hillshade']?.type).toBe('image');
  });

  it('references only declared sources and dashes ferries', () => {
    const s = createOfflineStyle({ terrain: true });
    for (const l of s.layers) if (l.source) expect(s.sources[l.source]).toBeDefined();
    expect(s.layers.find((l) => l.id === 'setu-ferries')?.paint?.['line-dasharray']).toBeDefined();
  });
});

describe('addBaseLayers', () => {
  it('adds sources/layers once and sets data from the loader', async () => {
    const sources = new Map<string, { data?: unknown; setData(d: unknown): void }>();
    const layers = new Set<string>();
    const map = {
      addSource: (id: string) => sources.set(id, { setData(d) { this.data = d; } }),
      addLayer: (l: { id: string }) => layers.add(l.id),
      getSource: (id: string) => sources.get(id),
      getLayer: (id: string) => (layers.has(id) ? {} : undefined),
    };
    const fc = { type: 'FeatureCollection' as const, features: [] };
    await addBaseLayers(map, { load: async () => fc });
    await addBaseLayers(map, { load: async () => fc });
    expect([...layers]).toEqual([...BASE_LAYER_IDS]);
    expect(sources.get('setu-roads')?.data).toBe(fc);
  });
});

describe('selectVisibleLabels', () => {
  const project = (l: [number, number]) => ({ x: l[0], y: l[1] });
  it('filters by zoom and declutters by priority', () => {
    const f = [
      { id: 'a', lngLat: [0, 0] as [number, number], text: 'A', priority: 1 },
      { id: 'b', lngLat: [10, 5] as [number, number], text: 'B', priority: 5 },
      { id: 'c', lngLat: [500, 500] as [number, number], text: 'C', minZoom: 12 },
    ];
    expect(selectVisibleLabels(f, 10, project).map((v) => v.feature.id)).toEqual(['b']);
    expect(selectVisibleLabels(f, 13, project).map((v) => v.feature.id)).toEqual(['b', 'c']);
  });
});
