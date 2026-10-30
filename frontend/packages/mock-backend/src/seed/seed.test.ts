import { describe, expect, it } from 'vitest';
import { FieldEventSchema, ProjectionSnapshotSchema, type FieldEvent, type ProjectionSnapshot } from '@setu/contract';
import { applyEvent, initialSnapshot, scenarioRules, FLOOD_A2_GROWN } from './index.js';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const base = (lat: number, lng: number) => ({ clientEventId: id(), occurredAt: '2026-06-01T07:00:00.000Z', reporterId: 'v1', deviceId: 'd1', location: { lat, lng } });
const NOW = '2026-06-01T07:00:01.000Z';
const road = (s: ProjectionSnapshot, rid: string) => s.roads.features.find((f) => f.properties.roadId === rid)!.properties;
const sett = (s: ProjectionSnapshot, sid: string) => s.settlements.features.find((f) => f.properties.settlementId === sid)!.properties;
const route = (s: ProjectionSnapshot, rid: string) => s.routes.features.find((f) => f.properties.routeId === rid);
const flood = (s: ProjectionSnapshot, a: string) => s.flood.features.find((f) => f.properties.areaId === a)!;

describe('seed snapshot', () => {
  it('validates against the contract schema', () => {
    expect(() => ProjectionSnapshotSchema.parse(initialSnapshot())).not.toThrow();
  });
  it('has the expected sizes and sits near Guwahati', () => {
    const s = initialSnapshot();
    expect([s.flood.features.length, s.roads.features.length, s.settlements.features.length, s.shelters.features.length, s.routes.features.length]).toEqual([2, 10, 6, 3, 3]);
    for (const f of s.settlements.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(lat).toBeGreaterThan(26.05); expect(lat).toBeLessThan(26.2);
      expect(lng).toBeGreaterThan(91.65); expect(lng).toBeLessThan(91.85);
    }
  });
  it('returns independent copies', () => {
    const a = initialSnapshot();
    a.roads.features[0]!.properties.status = 'blocked';
    expect(initialSnapshot().roads.features[0]!.properties.status).toBe('open');
  });
  it('exposes scenarioRules', () => {
    expect(scenarioRules.apply).toBe(applyEvent);
  });
});

describe('scripted scenarios', () => {
  const block = (roadId: string | undefined, blockage: 'full' | 'partial', lat = 26.125, lng = 91.76): FieldEvent =>
    FieldEventSchema.parse({ ...base(lat, lng), type: 'road_blockage', roadId, blockage });

  it('scenario 1: full blockage on R7 -> R7 blocked, S3 cut_off, EVAC-2 unavailable, EVAC-2b recalculated', () => {
    const s0 = initialSnapshot();
    const e = block('R7', 'full');
    const r = applyEvent(e, s0, { now: NOW });
    expect(r.changed).toBe(true);
    expect(r.snapshot.version).toBe(s0.version + 1);
    expect(s0.version).toBe(1); // input untouched
    expect(road(r.snapshot, 'R7')).toMatchObject({ status: 'blocked', sourceEventIds: [e.clientEventId], updatedAt: NOW });
    expect(sett(r.snapshot, 'S3').accessibility).toBe('cut_off');
    expect(route(r.snapshot, 'EVAC-2')!.properties.status).toBe('unavailable');
    const b = route(r.snapshot, 'EVAC-2b')!;
    expect(b.properties).toMatchObject({ status: 'recalculated', replacesRouteId: 'EVAC-2' });
    expect(b.geometry.coordinates.length).toBeGreaterThan(2);
    expect(ProjectionSnapshotSchema.safeParse(r.snapshot).success).toBe(true);
    // idempotent for the same event: no duplicate route
    const again = applyEvent(e, r.snapshot, { now: NOW });
    expect(again.snapshot.routes.features.filter((f) => f.properties.routeId === 'EVAC-2b')).toHaveLength(1);
    expect(road(again.snapshot, 'R7').sourceEventIds).toEqual([e.clientEventId]);
  });

  it('resolves the road by nearest-road lookup (<=300m) when roadId is missing', () => {
    // ~100m off the R7 midpoint (91.7700, 26.1250)
    const r = applyEvent(block(undefined, 'full', 26.1259, 91.77), initialSnapshot());
    expect(road(r.snapshot, 'R7').status).toBe('blocked');
  });

  it('ignores blockages with no road within 300m', () => {
    const s = initialSnapshot();
    const r = applyEvent(block(undefined, 'full', 26.19, 91.69), s);
    expect(r.changed).toBe(false);
    expect(r.snapshot).toBe(s);
  });

  it('scenario 2: full blockage on R4 -> S1 cut_off, EVAC-1 replaced by EVAC-1b', () => {
    const r = applyEvent(block('R4', 'full'), initialSnapshot());
    expect(sett(r.snapshot, 'S1').accessibility).toBe('cut_off');
    expect(route(r.snapshot, 'EVAC-1')!.properties.status).toBe('unavailable');
    expect(route(r.snapshot, 'EVAC-1b')!.properties.replacesRouteId).toBe('EVAC-1');
  });

  it('partial blockage only limits the settlement and keeps routes', () => {
    const r = applyEvent(block('R7', 'partial'), initialSnapshot());
    expect(road(r.snapshot, 'R7').status).toBe('partial');
    expect(sett(r.snapshot, 'S3').accessibility).toBe('limited');
    expect(route(r.snapshot, 'EVAC-2')!.properties.status).toBe('active');
    expect(route(r.snapshot, 'EVAC-2b')).toBeUndefined();
  });

  it('road_cleared restores road, settlement and route', () => {
    const blocked = applyEvent(block('R7', 'full'), initialSnapshot()).snapshot;
    const clear = FieldEventSchema.parse({ ...base(26.125, 91.76), type: 'road_cleared', roadId: 'R7' });
    const r = applyEvent(clear, blocked);
    expect(road(r.snapshot, 'R7').status).toBe('open');
    expect(sett(r.snapshot, 'S3').accessibility).toBe('accessible');
    expect(route(r.snapshot, 'EVAC-2')!.properties.status).toBe('active');
    expect(route(r.snapshot, 'EVAC-2b')!.properties.status).toBe('unavailable');
    expect(applyEvent(clear, r.snapshot).changed).toBe(false);
  });

  it('flood_report severity>=4 inside A2 grows the polygon', () => {
    const e = FieldEventSchema.parse({ ...base(26.100, 91.705), type: 'flood_report', severity: 4, depthCm: 90 });
    const r = applyEvent(e, initialSnapshot());
    expect(flood(r.snapshot, 'A2').geometry.coordinates).toEqual(FLOOD_A2_GROWN.coordinates);
    expect(flood(r.snapshot, 'A2').properties).toMatchObject({ severity: 4, depthCm: 90 });
    expect(ProjectionSnapshotSchema.safeParse(r.snapshot).success).toBe(true);
  });

  it('low-severity flood_report inside A2 does not grow the polygon', () => {
    const e = FieldEventSchema.parse({ ...base(26.100, 91.705), type: 'flood_report', severity: 2 });
    const r = applyEvent(e, initialSnapshot());
    expect(r.changed).toBe(false);
  });

  it('water_level updates the gauge area', () => {
    const e = FieldEventSchema.parse({ ...base(26.16, 91.72), type: 'water_level', gaugeId: 'G1', levelCm: 140, trend: 'rising' });
    const r = applyEvent(e, initialSnapshot());
    expect(flood(r.snapshot, 'A1').properties.depthCm).toBe(140);
  });

  it('household_registration increments households (explicit and nearest settlement)', () => {
    const mk = (settlementId?: string) =>
      FieldEventSchema.parse({ ...base(26.1245, 91.769), type: 'household_registration', householdId: id(), headName: 'A', members: 4, vulnerable: { elderly: false, children: true, disabled: false, medical: false }, settlementId, needs: ['food', 'medicine'] });
    const s0 = initialSnapshot();
    const explicit = applyEvent(mk('S5'), s0);
    expect(sett(explicit.snapshot, 'S5').households).toBe(sett(s0, 'S5').households + 1);
    expect(sett(explicit.snapshot, 'S5').population).toBe(sett(s0, 'S5').population + 4);
    const near = applyEvent(mk(), s0);
    expect(sett(near.snapshot, 'S3').households).toBe(sett(s0, 'S3').households + 1);
    expect(sett(near.snapshot, 'S3').needs).toContain('medicine');
  });

  it('unknown/unmatched events leave projections unchanged', () => {
    const s = initialSnapshot();
    const odd = { ...base(0, 0), type: 'sighting' } as unknown as FieldEvent;
    const r = applyEvent(odd, s);
    expect(r.changed).toBe(false);
    expect(r.snapshot).toBe(s);
  });
});
