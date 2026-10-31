import { describe, expect, it } from 'vitest';
import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import { criticalAlerts, overviewCounts, triggeredScenario, type ScenarioMeta } from './model';

const fc = (features: object[]) => ({ type: 'FeatureCollection', version: 7, generatedAt: '2026-10-30T10:00:00Z', features: features.map((properties) => ({ type: 'Feature', geometry: null, properties })) });
const snap = (o: { roads?: object[]; settlements?: object[]; routes?: object[] }): ProjectionSnapshot =>
  ({ version: 7, generatedAt: '2026-10-30T10:00:00Z', flood: fc([]), roads: fc(o.roads ?? []), settlements: fc(o.settlements ?? []), routes: fc(o.routes ?? []), shelters: fc([]) }) as unknown as ProjectionSnapshot;

const BRIDGE = { roadId: '284824410', name: 'Majuli bridge', status: 'blocked', kind: 'bridge', passability: 'impassable', reason: 'submerged' };
const AUN = { settlementId: '10692764768', name: 'Auniati', accessibility: 'cut_off', evacuationDeadline: '2026-10-30T18:00:00Z', cutOffReason: { summary: 'all exits flooded', blockingFeatureIds: ['284824410'] } };
const LIM = { settlementId: 'X', name: 'Limited', accessibility: 'limited' };
const OK = { settlementId: 'Y', name: 'Fine', accessibility: 'accessible' };
const ev = (id: string, serverState: string, extra: object = {}, appliedAtVersion?: number): EventRecord =>
  ({ eventId: id, serverState, receivedAt: '2026-10-30T10:00:00Z', appliedAtVersion, event: { type: 'road_blockage', blockage: 'full', occurredAt: '2026-10-30T09:59:00Z', location: { lat: 1, lng: 2 }, ...extra } }) as unknown as EventRecord;

describe('overviewCounts', () => {
  it('counts straight from projections and event records', () => {
    const c = overviewCounts(snap({ roads: [BRIDGE, { roadId: 'r', status: 'open' }], settlements: [AUN, LIM, OK] }), [ev('a', 'accepted'), ev('b', 'applied', {}, 7), ev('c', 'applied', {}, 9)])!;
    expect(c).toEqual({ affectedSettlements: 2, disconnected: 1, impassableSegments: 1, unavailableRoutes: 0, pendingReports: 2, evacuationActions: 1 });
  });
  it('is undefined without a snapshot', () => expect(overviewCounts(undefined, [])).toBeUndefined());
});

describe('criticalAlerts', () => {
  const s = snap({ roads: [BRIDGE], settlements: [AUN, LIM, OK], routes: [{ routeId: 'E1', from: AUN.settlementId, to: 'MJ-SH-009', kind: 'evacuation', status: 'unavailable', refusal: { summary: 'bridge impassable', blockingFeatureIds: [] } }] });
  it('lists critical first, flags diff-seen items as new, and targets the feature', () => {
    const a = criticalAlerts(s, [{ version: 7, at: 0, changes: [{ kind: 'road', id: '284824410', text: '' }] }]);
    expect(a.map((x) => x.key)).toEqual(['road-284824410', 'settlement-10692764768', 'settlement-X', 'route-E1']);
    expect(a[0]).toMatchObject({ severity: 'critical', isNew: true, target: { kind: 'road', id: '284824410' } });
    expect(a[1]!.isNew).toBe(false);
  });
  it('is empty when nothing is wrong', () => expect(criticalAlerts(snap({ settlements: [OK] }), [])).toEqual([]));
  it('alerts on an unavailable evacuation route even when flood access is still accessible', () => {
    const route = { routeId: 'E-OK', from: OK.settlementId, to: 'MJ-SH-009', kind: 'evacuation', status: 'unavailable', refusal: { summary: 'outside evacuation window', blockingFeatureIds: [] } };
    const alerts = criticalAlerts(snap({ settlements: [OK], routes: [route] }), []);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ key: 'route-E-OK', target: { kind: 'route', id: 'E-OK' } });
  });
});

describe('triggeredScenario', () => {
  const S1: ScenarioMeta = { id: 'S1', name: 'Submerged bridge', note: 'n', synthetic: true, targets: { bridgeId: '284824410' } };
  const S4: ScenarioMeta = { id: 'S4', name: 'Settlement cut off', note: 'n', synthetic: true, targets: { settlementId: '10692764768' } };
  it('is undefined until an event targets a scenario (=> Not provided by backend)', () => {
    expect(triggeredScenario([S1, S4], [], snap({}))).toEqual([]);
    expect(triggeredScenario([], [ev('a', 'applied', { roadId: '284824410' })], snap({}))).toEqual([]);
  });
  it('matches S1 by bridge id and S4 by water report + cut-off settlement', () => {
    expect(triggeredScenario([S1, S4], [ev('a', 'applied', { roadId: '284824410' })], snap({})).map((x) => x.id)).toEqual(['S1']);
    const wl = { ...ev('w', 'applied'), event: { type: 'water_level', levelCm: 1, trend: 'rising', occurredAt: '', location: { lat: 0, lng: 0 } } } as unknown as EventRecord;
    expect(triggeredScenario([S1, S4], [wl], snap({ settlements: [AUN] })).map((x) => x.id)).toEqual(['S4']);
    expect(triggeredScenario([S1, S4], [wl], snap({ settlements: [OK] }))).toEqual([]);
  });
});
