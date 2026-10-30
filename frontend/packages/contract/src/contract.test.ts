import { describe, expect, it } from 'vitest';
import {
  FieldEventSchema, SubmitAckSchema, ProjectionSnapshotSchema, newClientEventId, isRetryable,
  NetworkError, ServerError, TimeoutError, NotImplementedError, isConfirmedSynced, ClientSyncStatusSchema,
} from './index.js';

const common = () => ({
  clientEventId: newClientEventId(),
  occurredAt: '2026-10-30T10:00:00Z',
  reporterId: 'r1',
  deviceId: 'd1',
  location: { lat: 26.14, lng: 91.73, accuracyM: 8 },
});
const fc = (geom: unknown, props: unknown) => ({
  type: 'FeatureCollection', version: 1, generatedAt: '2026-10-30T10:00:00Z',
  features: [{ type: 'Feature', geometry: geom, properties: props }],
});

describe('FieldEvent', () => {
  it('parses every variant', () => {
    const evs = [
      { ...common(), type: 'flood_report', severity: 3, depthCm: 40 },
      { ...common(), type: 'road_blockage', roadId: 'R7', blockage: 'full', passableBy: ['foot'] },
      { ...common(), type: 'road_cleared', roadId: 'R7' },
      { ...common(), type: 'water_level', levelCm: 120, trend: 'rising' },
      { ...common(), type: 'household_registration', householdId: newClientEventId(), headName: 'A', members: 4,
        vulnerable: { elderly: true, children: false, disabled: false, medical: false }, needs: ['water'] },
    ];
    for (const e of evs) expect(FieldEventSchema.safeParse(e).success).toBe(true);
  });
  it('rejects invalid input', () => {
    expect(FieldEventSchema.safeParse({ ...common(), type: 'flood_report', severity: 9 }).success).toBe(false);
    expect(FieldEventSchema.safeParse({ ...common(), type: 'road_blockage', blockage: 'cleared' }).success).toBe(false);
    expect(FieldEventSchema.safeParse({ ...common(), type: 'nope' }).success).toBe(false);
    expect(FieldEventSchema.safeParse({ ...common(), clientEventId: 'x', type: 'road_cleared', roadId: 'a' }).success).toBe(false);
  });
});

describe('SubmitAck', () => {
  it('parses all variants', () => {
    const id = newClientEventId();
    for (const a of [
      { clientEventId: id, result: 'accepted', eventId: 'e1', acceptedAtVersion: 3 },
      { clientEventId: id, result: 'duplicate', eventId: 'e1' },
      { clientEventId: id, result: 'conflict', reason: 'x', serverState: { a: 1 } },
      { clientEventId: id, result: 'rejected', errors: [{ path: 'severity', message: 'bad' }] },
    ]) expect(SubmitAckSchema.safeParse(a).success).toBe(true);
    expect(SubmitAckSchema.safeParse({ clientEventId: id, result: 'accepted', eventId: 'e1' }).success).toBe(false);
  });
});

describe('projections', () => {
  it('parses a snapshot', () => {
    const snap = {
      version: 1, generatedAt: '2026-10-30T10:00:00Z',
      flood: fc({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, { areaId: 'a', depthCm: 10, severity: 2 }),
      roads: fc({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, { roadId: 'R1', name: 'x', status: 'open', updatedAt: '2026-10-30T10:00:00Z', sourceEventIds: [] }),
      settlements: fc({ type: 'Point', coordinates: [0, 0] }, { settlementId: 'S1', name: 'x', population: 1, accessibility: 'cut_off', households: 1, needs: [] }),
      routes: fc({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, { routeId: 'E1', from: 'S1', to: 'SH1', kind: 'evacuation', status: 'recalculated', etaMin: 5, replacesRouteId: 'E0' }),
      shelters: fc({ type: 'Point', coordinates: [0, 0] }, { shelterId: 'SH1', name: 'x', capacity: 10, occupancy: 1, open: true }),
    };
    expect(ProjectionSnapshotSchema.safeParse(snap).success).toBe(true);
    snap.roads.features[0]!.properties.status = 'weird';
    expect(ProjectionSnapshotSchema.safeParse(snap).success).toBe(false);
  });
});

describe('misc', () => {
  it('errors carry retryable flags', () => {
    expect(isRetryable(new NetworkError())).toBe(true);
    expect(isRetryable(new ServerError(503))).toBe(true);
    expect(new ServerError(503).status).toBe(503);
    expect(isRetryable(new TimeoutError())).toBe(true);
    expect(isRetryable(new NotImplementedError('x'))).toBe(false);
  });
  it('uuid + sync helpers', () => {
    expect(newClientEventId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(isConfirmedSynced(5, 4)).toBe(false);
    expect(isConfirmedSynced(5, 5)).toBe(true);
    expect(ClientSyncStatusSchema.options).toHaveLength(7);
  });
});
