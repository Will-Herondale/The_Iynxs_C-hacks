import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot } from '@setu/contract';
import { blockingByGroup, blockingIds, buildMarkers } from './markers';
import { idsFilter, MAP_LAYERS, TOGGLE_LAYERS } from './layers';

const snap = {
  version: 3,
  generatedAt: '2026-01-01T00:00:00Z',
  flood: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { areaId: 'A2', depthCm: 40, severity: 3, confidence: 'observed' } }] },
  roads: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2], [3, 3]] }, properties: { roadId: 'B1', name: 'Bharalu Bridge', status: 'blocked', updatedAt: '2026-01-01T00:00:00Z', sourceEventIds: [], kind: 'bridge', passability: 'impassable' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] }, properties: { roadId: 'R1', name: 'Road 1', status: 'open', updatedAt: '2026-01-01T00:00:00Z', sourceEventIds: [] } },
    ],
  },
  settlements: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 6] }, properties: { settlementId: 'S4', name: 'Kalapahar', population: 1, accessibility: 'cut_off', households: 1, needs: [], cutOffReason: { summary: 'x', blockingFeatureIds: ['B1', 'A2', 'ZZ'] } } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [7, 8] }, properties: { settlementId: 'S1', name: 'Ok', population: 1, accessibility: 'accessible', households: 1, needs: [] } },
    ],
  },
  routes: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeId: 'EVAC-3', from: 'S4', to: 'SH1', kind: 'evacuation', status: 'unavailable', etaMin: 1, refusal: { summary: 'B1', blockingFeatureIds: ['B1'] } } }] },
  shelters: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [9, 9] }, properties: { shelterId: 'SH1', name: 'Camp', capacity: 100, occupancy: 10, open: true } }] },
} as unknown as ProjectionSnapshot;

describe('map markers', () => {
  it('labels bridges (impassable flagged), cut-off settlements and shelters only', () => {
    const m = buildMarkers(snap);
    expect(m.map((x) => x.key)).toEqual(['bridge-B1', 'settlement-S4', 'shelter-SH1']);
    expect(m[0]).toMatchObject({ label: 'Bharalu Bridge (B1) — IMPASSABLE', impassable: true, toggle: 'blocked', lng: 2, lat: 2 });
    expect(m[1]?.label).toContain('CUT OFF');
    expect(m[1]?.toggle).toBe('cutoff');
    expect(m[2]?.toggle).toBe('shelters');
    expect(m[2]?.label).toBe('Camp 10/100');
  });
  it('does not invent 0/0 capacity when the seed has none', () => {
    const s2 = structuredClone(snap);
    s2.shelters.features[0]!.properties.capacity = 0;
    s2.shelters.features[0]!.properties.occupancy = 0;
    expect(buildMarkers(s2).find((x) => x.kind === 'shelter')?.label).toBe('Camp');
  });
  it('does not label healthy bridges', () => {
    const ok = { ...snap, roads: { ...snap.roads, features: [{ ...snap.roads.features[0], properties: { ...snap.roads.features[0]!.properties, status: 'open', passability: 'passable' } }] } } as ProjectionSnapshot;
    expect(buildMarkers(ok).some((x) => x.kind === 'bridge')).toBe(false);
  });
  it('degrades without PROPOSED fields (plain road, no bridge marker)', () => {
    const plain = { ...snap, roads: { ...snap.roads, features: [snap.roads.features[1]] } } as ProjectionSnapshot;
    expect(buildMarkers(plain).some((x) => x.kind === 'bridge')).toBe(false);
  });
});

describe('blocking highlight', () => {
  it('reads blockingFeatureIds from the selected settlement or route', () => {
    expect(blockingIds(snap, { kind: 'settlement', id: 'S4' })).toEqual(['B1', 'A2', 'ZZ']);
    expect(blockingIds(snap, { kind: 'route', id: 'EVAC-3' })).toEqual(['B1']);
    expect(blockingIds(snap, { kind: 'settlement', id: 'S1' })).toEqual([]);
    expect(blockingIds(snap, { kind: 'road', id: 'B1' })).toEqual([]);
    expect(blockingIds(undefined, { kind: 'route', id: 'x' })).toEqual([]);
  });
  it('splits ids by layer group and drops unknown ids', () => {
    expect(blockingByGroup(snap, ['B1', 'A2', 'ZZ'])).toEqual({ roads: ['B1'], flood: ['A2'] });
  });
  it('builds an ids filter', () => {
    expect(idsFilter('roads', ['B1'])).toEqual(['in', ['get', 'roadId'], ['literal', ['B1']]]);
    expect(idsFilter('roads', [])).toEqual(['==', ['get', 'none'], '__none__']);
  });
  it('has highlight layers registered in toggle groups', () => {
    const ids = MAP_LAYERS.map((l) => l.id);
    expect(ids).toContain('roads-blocking');
    expect(TOGGLE_LAYERS.blocked).toContain('flood-blocking');
  });
});
