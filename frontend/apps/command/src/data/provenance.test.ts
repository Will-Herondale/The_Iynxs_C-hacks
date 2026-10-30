import { describe, expect, it } from 'vitest';
import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import { featureSourceEventIds, joinProvenance } from './useProvenance';

const fc = (features: unknown[]) => ({ type: 'FeatureCollection', version: 1, generatedAt: '', features });
const f = (properties: object) => ({ type: 'Feature', geometry: null, properties });
const snap = {
  version: 5, generatedAt: '', flood: fc([]), shelters: fc([]),
  roads: fc([f({ roadId: 'B1', sourceEventIds: ['ev1', 'ev-missing'] })]),
  settlements: fc([f({ settlementId: 'S4', cutOffReason: { summary: '', blockingFeatureIds: [], sourceEventIds: ['ev1'] } })]),
  routes: fc([f({ routeId: 'EVAC-3', refusal: { summary: '', blockingFeatureIds: [], sourceEventIds: ['ev2'] } })]),
} as unknown as ProjectionSnapshot;

const rec = (eventId: string, serverState: EventRecord['serverState'], appliedAtVersion?: number, occurredAt = '2026-01-01T10:00:00Z'): EventRecord =>
  ({
    eventId, serverState, receivedAt: occurredAt, appliedAtVersion,
    event: { type: 'road_blockage', clientEventId: `c-${eventId}`, occurredAt, reporterId: 'r', deviceId: 'd', location: { lat: 0, lng: 0 }, roadId: 'B1', blockage: 'full' },
  }) as EventRecord;

describe('provenance', () => {
  it('reads source ids per feature kind', () => {
    expect(featureSourceEventIds(snap, 'B1')).toEqual(['ev1', 'ev-missing']);
    expect(featureSourceEventIds(snap, 'S4')).toEqual(['ev1']);
    expect(featureSourceEventIds(snap, 'EVAC-3')).toEqual(['ev2']);
    expect(featureSourceEventIds(snap, 'nope')).toEqual([]);
  });
  it('joins records and keeps unknown ids as accepted', () => {
    const items = joinProvenance(['ev1', 'ev-missing'], [rec('ev1', 'applied', 4)], {}, 5);
    expect(items[0]!.record?.eventId).toBe('ev1');
    expect(items[0]!.status).toBe('synced');
    expect(items[1]).toMatchObject({ sourceId: 'ev-missing', status: 'accepted' });
  });
  it('does not call it synced before the snapshot reached the applied version, or if status disagrees', () => {
    expect(joinProvenance(['ev1'], [rec('ev1', 'applied', 9)], {}, 5)[0]!.status).toBe('accepted');
    const st = { 'c-ev1': { clientEventId: 'c-ev1', state: 'accepted' as const } };
    expect(joinProvenance(['ev1'], [rec('ev1', 'applied', 4)], st, 5)[0]!.status).toBe('accepted');
    expect(joinProvenance(['ev1'], [rec('ev1', 'conflict')], {}, 5)[0]!.status).toBe('conflict');
  });
  it('orders newest report first', () => {
    const items = joinProvenance(['a', 'b'], [rec('a', 'accepted', undefined, '2026-01-01T08:00:00Z'), rec('b', 'accepted', undefined, '2026-01-01T09:00:00Z')], {}, 1);
    expect(items.map((i) => i.sourceId)).toEqual(['b', 'a']);
  });
});
