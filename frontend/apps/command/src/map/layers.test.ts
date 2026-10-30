import { describe, expect, it } from 'vitest';
import { GROUP_LAYERS, ID_PROPERTY, MAP_LAYERS, SOURCE_IDS, featureToSelection, selectionFilter } from './layers';

describe('map layers', () => {
  it('maps clicked features to selections', () => {
    expect(featureToSelection('roads-line', { roadId: 'R7' })).toEqual({ kind: 'road', id: 'R7' });
    expect(featureToSelection('settlements-circle', { settlementId: 'S3' })).toEqual({ kind: 'settlement', id: 'S3' });
    expect(featureToSelection('routes-line', { routeId: 'EVAC-2b' })).toEqual({ kind: 'route', id: 'EVAC-2b' });
    expect(featureToSelection('shelters-circle', { shelterId: 'SH1' })).toEqual({ kind: 'shelter', id: 'SH1' });
    expect(featureToSelection('flood-fill', { areaId: 'F1' })).toEqual({ kind: 'flood', id: 'F1' });
  });
  it('ignores unknown layers or missing ids', () => {
    expect(featureToSelection('osm', { roadId: 'R7' })).toBeUndefined();
    expect(featureToSelection('roads-line', {})).toBeUndefined();
    expect(featureToSelection('roads-line', null)).toBeUndefined();
  });
  it('every layer is in exactly one toggle group and uses a known source', () => {
    const grouped = Object.values(GROUP_LAYERS).flat();
    expect([...grouped].sort()).toEqual(MAP_LAYERS.map((l) => l.id).sort());
    const sources = new Set<string>(Object.values(SOURCE_IDS));
    for (const l of MAP_LAYERS) expect(sources.has((l as { source: string }).source)).toBe(true);
  });
  it('selection filter targets the id property', () => {
    expect(selectionFilter('roads', 'R7')).toEqual(['==', ['get', ID_PROPERTY.roads], 'R7']);
  });
});
