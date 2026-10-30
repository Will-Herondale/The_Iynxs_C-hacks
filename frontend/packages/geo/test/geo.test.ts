import { describe, expect, it } from 'vitest';
import { statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GEO_LAYER_NAMES, GEO_PROVENANCE, MAJULI_BOUNDS, MAJULI_CENTER, SCENARIOS, loadGeoLayer, geoLayerUrls } from '../src/index.js';

const dataDir = new URL('../data/', import.meta.url);

describe('@setu/geo bundled data', () => {
  it('loads every layer with the counts recorded in provenance', async () => {
    for (const name of GEO_LAYER_NAMES) {
      const fc = await loadGeoLayer(name);
      expect(fc.type).toBe('FeatureCollection');
      expect(fc.features.length, name).toBeGreaterThan(0);
      expect(fc.features.length, name).toBe(GEO_PROVENANCE.counts[name]);
    }
  });

  it('has the expected fixed counts for Karthik layers', async () => {
    expect((await loadGeoLayer('shelters')).features).toHaveLength(23);
    expect((await loadGeoLayer('ferries')).features).toHaveLength(2);
    expect((await loadGeoLayer('island')).features).toHaveLength(1);
  });

  it('keeps every coordinate inside MAJULI_BOUNDS (waterways within the 0.01° pad)', async () => {
    const [[w, s], [e, n]] = MAJULI_BOUNDS;
    const pad = 0.0101;
    const visit = (c: unknown, tol: number): void => {
      if (typeof (c as number[])[0] === 'number') {
        const [x, y] = c as [number, number];
        expect(x).toBeGreaterThanOrEqual(w - tol); expect(x).toBeLessThanOrEqual(e + tol);
        expect(y).toBeGreaterThanOrEqual(s - tol); expect(y).toBeLessThanOrEqual(n + tol);
      } else (c as unknown[]).forEach((x) => visit(x, tol));
    };
    for (const name of GEO_LAYER_NAMES) {
      const fc = await loadGeoLayer(name);
      const tol = ['island', 'places', 'shelters'].includes(name) ? 0.00002 : ['waterways', 'waterbodies', 'ferries'].includes(name) ? pad : 0.05; // lines/polygons are kept whole if they touch the island, so may overhang slightly
      for (const f of fc.features) visit((f.geometry as { coordinates: unknown }).coordinates, tol);
    }
    expect(MAJULI_CENTER[0]).toBeGreaterThan(w); expect(MAJULI_CENTER[0]).toBeLessThan(e);
    expect(MAJULI_CENTER[1]).toBeGreaterThan(s); expect(MAJULI_CENTER[1]).toBeLessThan(n);
  });

  it('drops tracks, paths and service roads from roads', async () => {
    const roads = await loadGeoLayer('roads');
    const classes = new Set(roads.features.map((f) => f.properties?.highway));
    for (const bad of ['track', 'path', 'footway', 'service', 'residential']) expect(classes.has(bad)).toBe(false);
  });

  it('retains the scenario targets (S1 bridge, S2 road, S4 village, S2 shelter)', async () => {
    const has = async (layer: 'bridges' | 'roads' | 'places', id: number) =>
      (await loadGeoLayer(layer)).features.some((f) => f.properties?.osm_id === id);
    expect(await has('bridges', 284824410)).toBe(true);
    expect(await has('roads', 1074461062)).toBe(true);
    expect(await has('places', 10692764768)).toBe(true);
    expect((await loadGeoLayer('shelters')).features.some((f) => f.properties?.shelter_id === 'MJ-SH-009')).toBe(true);
  });

  it('exposes S1-S5 as synthetic with notes', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    for (const s of SCENARIOS) { expect(s.synthetic).toBe(true); expect(s.note).toMatch(/Synthetic/i); }
    expect(SCENARIOS[0]?.targets).toMatchObject({ bridgeId: '284824410', waterLevelM: 85.3 });
    expect(SCENARIOS[1]?.targets).toMatchObject({ roadId: '1074461062', shelterId: 'MJ-SH-009' });
    expect(SCENARIOS[3]?.targets).toMatchObject({ settlementId: '10692764768', waterLevelM: 83.8 });
  });

  it('records provenance for every bundled layer', () => {
    expect(GEO_PROVENANCE.source.branch).toBe('data/karthik');
    expect(GEO_PROVENANCE.source.commit).toMatch(/^[0-9a-f]{40}$/);
    for (const name of GEO_LAYER_NAMES) expect(GEO_PROVENANCE.layers[name]?.licence, name).toBeTruthy();
    expect(GEO_PROVENANCE.layers.scenarios?.synthetic).toBe(true);
  });

  it('keeps the bundle within 3 MB and hillshade within 1 MB', () => {
    let total = 0;
    for (const f of readdirSync(dataDir)) if (f.endsWith('.geojson')) total += statSync(fileURLToPath(new URL(f, dataDir))).size;
    expect(total).toBeLessThanOrEqual(3 * 1024 * 1024);
    try { expect(statSync(fileURLToPath(new URL('hillshade.png', dataDir))).size).toBeLessThanOrEqual(1024 * 1024); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  });

  it('lists precache URLs', () => {
    expect(geoLayerUrls()).toHaveLength(GEO_LAYER_NAMES.length);
  });
});
