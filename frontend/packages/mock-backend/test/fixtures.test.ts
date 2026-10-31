/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON fixtures */
import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(here(p), 'utf8'));
const FIX = '../src/seed/fixtures/';
const GEO = '../../geo/data/';

const roads = json(`${FIX}roads.json`);
const routes = json(`${FIX}routes.json`);
const notes = json(`${FIX}NOTES.json`);
const settlements = json(`${FIX}settlements.json`);
const shelters = json(`${FIX}shelters.json`);
const geoPlaces = json(`${GEO}places.geojson`);
const geoShelters = json(`${GEO}shelters.geojson`);
const geoRoads = [...json(`${GEO}roads.geojson`).features, ...json(`${GEO}roads-minor.geojson`).features, ...json(`${GEO}bridges.geojson`).features];

const S1 = '284824410';
const S2 = '1074461062';
const AUNIATI = '10692764768';
const roadIds = new Set(roads.features.map((f: any) => f.properties.roadId));

describe('DEM-derived build-time fixtures (synthetic)', () => {
  it('hillshade is ≤ 1 MB and its bounds match the DEM', () => {
    expect(statSync(here(`${GEO}hillshade.png`)).size).toBeLessThanOrEqual(1024 * 1024);
    const meta = json(`${GEO}hillshade.json`);
    expect(meta.width).toBeLessThanOrEqual(2048);
    expect(meta.bounds[0][0]).toBeLessThan(meta.bounds[1][0]);
    expect(meta.coordinates).toHaveLength(4);
  });

  for (const level of ['83.8', '85.3']) {
    it(`flood ${level} m is Polygon-only, modelled, labelled synthetic`, () => {
      const fc = json(`${FIX}flood-${level}.json`);
      expect(fc.properties.synthetic).toBe(true);
      expect(fc.properties.note).toMatch(/not a hydraulic simulation/i);
      expect(fc.features.length).toBeGreaterThan(10);
      for (const f of fc.features) {
        expect(f.geometry.type).toBe('Polygon');
        expect(f.properties.confidence).toBe('modelled');
        expect(f.properties.areaId).toBeTruthy();
      }
      expect(statSync(here(`${FIX}flood-${level}.json`)).size).toBeLessThan(400 * 1024);
    });
  }

  it('the 85.3 m mask is larger than the 83.8 m mask', () => {
    const n = (l: string) => json(`${FIX}flood-${l}.json`).features.length;
    expect(n('85.3')).toBeGreaterThanOrEqual(n('83.8'));
  });

  it('seed ids resolve in the geo data', () => {
    const placeIds = new Set(geoPlaces.features.map((f: any) => String(f.properties.osm_id)));
    for (const f of settlements.features) expect(placeIds.has(f.properties.settlementId)).toBe(true);
    expect(settlements.features.some((f: any) => f.properties.settlementId === AUNIATI)).toBe(true);
    const shelterIds = new Set(geoShelters.features.map((f: any) => f.properties.shelter_id));
    expect(shelters.features).toHaveLength(23);
    for (const f of shelters.features) expect(shelterIds.has(f.properties.shelterId)).toBe(true);
    const wayIds = new Set(geoRoads.map((f: any) => String(f.properties.osm_id)));
    for (const id of roadIds) expect(wayIds.has(id)).toBe(true);
    expect(roadIds.has(S1) && roadIds.has(S2)).toBe(true);
    expect(roads.features.length).toBeLessThanOrEqual(300);
  });

  it('routes are static LineStrings between known endpoints over known roads', () => {
    const sIds = new Set(settlements.features.map((f: any) => f.properties.settlementId));
    const hIds = new Set(shelters.features.map((f: any) => f.properties.shelterId));
    expect(notes.synthetic).toBe(true);
    for (const f of routes.features) {
      expect(f.geometry.type).toBe('LineString');
      expect(sIds.has(f.properties.from)).toBe(true);
      expect(hIds.has(f.properties.to)).toBe(true);
      expect(f.properties.etaMin).toBeGreaterThan(0);
      for (const id of f.properties.viaRoadIds) expect(roadIds.has(id)).toBe(true);
    }
  });

  it('S1/S2: baselines cross the blocked feature, alternates avoid it and are no faster', () => {
    const byId = new Map(routes.features.map((f: any) => [f.properties.routeId, f.properties]));
    for (const [scenario, blocked] of [['S1', S1], ['S2', S2]] as const) {
      const base = routes.features.find((f: any) => f.properties.scenario === scenario && f.properties.role === 'baseline')!.properties;
      const alt = routes.features.find((f: any) => f.properties.scenario === scenario && f.properties.role === 'alternate')!.properties;
      expect(base.viaRoadIds).toContain(blocked);
      expect(alt.viaRoadIds).not.toContain(blocked);
      expect(alt.replacesRouteId).toBe(base.routeId);
      expect(byId.get(alt.replacesRouteId)).toBeDefined();
      if (scenario === 'S1') expect(alt.etaMin).toBeGreaterThanOrEqual(base.etaMin);
    }
    expect(notes.affectedSettlements[S1].length).toBeGreaterThan(0);
  });

  it('S4: Auniati has baseline routes but no safe route once the 83.8 m mask and closures apply', () => {
    const au = routes.features.filter((f: any) => f.properties.from === AUNIATI);
    expect(au.length).toBeGreaterThan(0);
    expect(au.every((f: any) => f.properties.role === 'baseline' && f.properties.scenario === 'S4')).toBe(true); // no alternate exists
    expect(notes.s4Check.checked).toBe(true);
    expect(notes.s4Check.noSafeRoute).toBe(true);
    expect(notes.s4Check.safeReachableShelters).toEqual([]);
  });
});
