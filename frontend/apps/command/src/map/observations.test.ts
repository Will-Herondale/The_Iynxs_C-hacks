import { describe, expect, it } from 'vitest';
import type { EventRecord } from '@setu/contract';
import { OBSERVATION_STATES, observationsToGeoJSON } from './observations';
import { selectionBounds } from './bounds';

const rec = (eventId: string, serverState: EventRecord['serverState'], lat: number, lng: number): EventRecord => ({
  eventId,
  serverState,
  receivedAt: '2026-10-30T10:05:00+05:30',
  event: {
    type: 'road_blockage', clientEventId: '8b0e8f56-7a3a-4c4e-9f0e-1c2d3e4f5a6b', occurredAt: '2026-10-30T10:00:00+05:30',
    reporterId: 'r1', deviceId: 'd1', location: { lat, lng }, roadId: '284824410', blockage: 'full',
  },
});

describe('observationsToGeoJSON', () => {
  it('maps report locations to [lng, lat] points with server state and times', () => {
    const fc = observationsToGeoJSON([rec('e1', 'applied', 26.95, 94.17), rec('e2', 'accepted', 26.9, 94.2)]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]).toMatchObject({
      id: 'e1',
      geometry: { type: 'Point', coordinates: [94.17, 26.95] },
      properties: { eventId: 'e1', type: 'road_blockage', serverState: 'applied', occurredAt: '2026-10-30T10:00:00+05:30', receivedAt: '2026-10-30T10:05:00+05:30' },
    });
  });
  it('skips events without a finite location instead of inventing one', () => {
    expect(observationsToGeoJSON([rec('bad', 'applied', Number.NaN, 94)]).features).toEqual([]);
    expect(observationsToGeoJSON([]).features).toEqual([]);
  });
  it('gives every server state a distinct label and shape (colour is not the only signal)', () => {
    const shapes = Object.values(OBSERVATION_STATES).map((s) => s.shape);
    expect(new Set(shapes).size).toBe(4);
    expect(OBSERVATION_STATES.conflict.label).toBe('Requires review');
  });
});

describe('selectionBounds', () => {
  const snap = {
    flood: { features: [{ geometry: { coordinates: [[[1, 1], [3, 1], [3, 4], [1, 1]]] }, properties: { areaId: 'F1' } }] },
    roads: { features: [{ geometry: { coordinates: [[94.1, 26.9], [94.2, 26.95]] }, properties: { roadId: '284824410' } }] },
    settlements: { features: [{ geometry: { coordinates: [94.3, 26.8] }, properties: { settlementId: '77' } }] },
    routes: { features: [] },
    shelters: { features: [] },
  } as never;
  it('computes extents for lines, points, polygons and events', () => {
    expect(selectionBounds(snap, [], { kind: 'road', id: '284824410' })).toEqual([[94.1, 26.9], [94.2, 26.95]]);
    expect(selectionBounds(snap, [], { kind: 'settlement', id: '77' })).toEqual([[94.3, 26.8], [94.3, 26.8]]);
    expect(selectionBounds(snap, [], { kind: 'flood', id: 'F1' })).toEqual([[1, 1], [3, 4]]);
    expect(selectionBounds(undefined, [rec('e1', 'applied', 26.95, 94.17)], { kind: 'report', id: 'e1' })).toEqual([[94.17, 26.95], [94.17, 26.95]]);
  });
  it('is undefined for unknown ids and no selection', () => {
    expect(selectionBounds(snap, [], { kind: 'route', id: 'nope' })).toBeUndefined();
    expect(selectionBounds(snap, [], undefined)).toBeUndefined();
    expect(selectionBounds(undefined, [], { kind: 'road', id: 'x' })).toBeUndefined();
  });
});
