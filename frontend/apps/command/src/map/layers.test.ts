import { describe, expect, it } from 'vitest';
import {
  ALWAYS_LAYERS, COLORS, ID_PROPERTY, INTERACTIVE_LAYERS, MAP_LAYERS, MINOR_ROAD_MIN_ZOOM, SOURCE_IDS, TOGGLE_IDS, TOGGLE_LAYERS,
  featureToSelection, selectionFilter,
} from './layers';

describe('route honesty styling', () => {
  it('draws non-refused routes dashed amber, never solid green', () => {
    const l = MAP_LAYERS.find((x) => x.id === 'routes-line') as { paint: Record<string, unknown> };
    expect(l.paint['line-color']).toBe(COLORS.unverified);
    expect(l.paint['line-dasharray']).toBeTruthy();
    expect(JSON.stringify(MAP_LAYERS.filter((x) => x.id.startsWith('routes-')))).not.toContain(COLORS.safe);
  });
});

describe('map layers', () => {
  it('maps clicked features to selections', () => {
    expect(featureToSelection('roads-line', { roadId: 'R7' })).toEqual({ kind: 'road', id: 'R7' });
    expect(featureToSelection('roads-line-minor', { roadId: 'R8' })).toEqual({ kind: 'road', id: 'R8' });
    expect(featureToSelection('roads-blocked', { roadId: '284824410' })).toEqual({ kind: 'road', id: '284824410' });
    expect(featureToSelection('settlements-circle', { settlementId: 'S3' })).toEqual({ kind: 'settlement', id: 'S3' });
    expect(featureToSelection('routes-line', { routeId: 'EVAC-2b' })).toEqual({ kind: 'route', id: 'EVAC-2b' });
    expect(featureToSelection('shelters-circle', { shelterId: 'MJ-SH-009' })).toEqual({ kind: 'shelter', id: 'MJ-SH-009' });
    expect(featureToSelection('flood-fill', { areaId: 'F1' })).toEqual({ kind: 'flood', id: 'F1' });
    expect(featureToSelection('observations-symbol', { eventId: 'ev-1' })).toEqual({ kind: 'report', id: 'ev-1' });
  });
  it('ignores unknown layers or missing ids', () => {
    expect(featureToSelection('osm', { roadId: 'R7' })).toBeUndefined();
    expect(featureToSelection('roads-line', {})).toBeUndefined();
    expect(featureToSelection('roads-line', null)).toBeUndefined();
  });
  it('every overlay layer is controlled by exactly one toggle or is an always-on highlight, on a known source', () => {
    const grouped = [...Object.values(TOGGLE_LAYERS).flat(), ...ALWAYS_LAYERS];
    expect([...grouped].sort()).toEqual(MAP_LAYERS.map((l) => l.id).sort());
    const sources = new Set<string>(Object.values(SOURCE_IDS));
    for (const l of MAP_LAYERS) expect(sources.has((l as { source: string }).source)).toBe(true);
  });
  it('exposes the ten spec toggles', () => {
    expect([...TOGGLE_IDS]).toEqual(['terrain', 'rivers', 'roads', 'settlements', 'shelters', 'flood', 'blocked', 'cutoff', 'observations', 'routes']);
  });
  it('interactive layers exist', () => {
    const ids = new Set(MAP_LAYERS.map((l) => l.id));
    for (const id of INTERACTIVE_LAYERS) expect(ids.has(id)).toBe(true);
  });
  it('keeps routine roads zoom-gated so the large layer stays light', () => {
    const minor = MAP_LAYERS.find((l) => l.id === 'roads-line-minor');
    expect(minor?.minzoom).toBe(MINOR_ROAD_MIN_ZOOM);
  });
  it('styles observed and modelled flood differently', () => {
    const ids = MAP_LAYERS.map((l) => l.id);
    expect(ids).toContain('flood-outline');
    expect(ids).toContain('flood-outline-modelled');
    const modelled = MAP_LAYERS.find((l) => l.id === 'flood-outline-modelled') as { paint: Record<string, unknown> };
    expect(modelled.paint['line-dasharray']).toBeDefined();
  });
  it('uses no external URLs', () => {
    expect(JSON.stringify(MAP_LAYERS)).not.toMatch(/https?:/);
  });
  it('selection filter targets the id property', () => {
    expect(selectionFilter('roads', 'R7')).toEqual(['==', ['get', ID_PROPERTY.roads], 'R7']);
    expect(selectionFilter('observations', 'e1')).toEqual(['==', ['get', 'eventId'], 'e1']);
  });
});
