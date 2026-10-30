import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FieldEventSchema, ProjectionSnapshotSchema, type FieldEvent, type ProjectionSnapshot } from '@setu/contract';
import {
  applyEvent, initialSnapshot, scenarioRules, FIXTURES, S1_BRIDGE_ID, S2_ROAD_ID, S2_SHELTER_ID, S4_SETTLEMENT_ID, S4_TRIGGER_CM, ROUTES, ALTERNATES, ROUTE_VIA,
} from './index.js';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const NOW = '2026-06-01T07:00:01.000Z';
const T = '2026-06-01T07:05:00.000Z';
const DEADLINE = '2026-06-01T10:05:00.000Z';
const geo = (name: string): { features: { properties: Record<string, unknown> }[] } =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../geo/data/${name}.geojson`, import.meta.url)), 'utf8'));

const road = (s: ProjectionSnapshot, rid: string) => s.roads.features.find((f) => f.properties.roadId === rid)!;
const sett = (s: ProjectionSnapshot, sid: string) => s.settlements.features.find((f) => f.properties.settlementId === sid)!;
const route = (s: ProjectionSnapshot, rid: string) => s.routes.features.find((f) => f.properties.routeId === rid);
const mid = (coords: readonly (readonly number[])[]) => coords[Math.floor(coords.length / 2)]!;
const at = (coords: readonly number[]) => ({ clientEventId: id(), occurredAt: T, reporterId: 'v1', deviceId: 'd1', location: { lat: coords[1]!, lng: coords[0]! } });
const block = (s: ProjectionSnapshot, roadId: string, blockage: 'full' | 'partial' = 'full', cause: 'submerged' | 'debris' = 'debris'): FieldEvent =>
  FieldEventSchema.parse({ ...at(mid(road(s, roadId).geometry.coordinates)), type: 'road_blockage', roadId, blockage, cause });
const clear = (s: ProjectionSnapshot, roadId: string): FieldEvent => FieldEventSchema.parse({ ...at(mid(road(s, roadId).geometry.coordinates)), type: 'road_cleared', roadId });
const level = (s: ProjectionSnapshot, settlementId: string, levelCm: number): FieldEvent =>
  FieldEventSchema.parse({ ...at(sett(s, settlementId).geometry.coordinates), type: 'water_level', gaugeId: 'field', levelCm, trend: 'rising' });

describe('Majuli seed', () => {
  const s = initialSnapshot();
  it('validates against the contract schema', () => {
    expect(() => ProjectionSnapshotSchema.parse(s)).not.toThrow();
  });
  it('has the expected shape: curated roads, 23 shelters, settlements, no baseline flood', () => {
    expect(s.roads.features.length).toBeGreaterThanOrEqual(50);
    expect(s.roads.features.length).toBeLessThanOrEqual(300);
    expect(s.shelters.features).toHaveLength(23);
    expect(s.settlements.features.length).toBeGreaterThanOrEqual(8);
    expect(s.flood.features).toHaveLength(0);
    expect(s.routes.features.length).toBeGreaterThanOrEqual(3);
    expect(s.routes.features.every((f) => f.properties.status === 'active')).toBe(true);
  });
  it('sits on Majuli', () => {
    for (const f of s.settlements.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(lat).toBeGreaterThan(26.6); expect(lat).toBeLessThan(27.2);
      expect(lng).toBeGreaterThan(93.9); expect(lng).toBeLessThan(94.8);
    }
  });
  it('seed ids resolve in the bundled @setu/geo data (osm_id / shelter_id)', () => {
    const osm = (names: string[]) => new Set(names.flatMap((nm) => geo(nm).features.map((f) => String(f.properties.osm_id))));
    const roadIds = osm(['roads', 'bridges']);
    for (const f of s.roads.features) expect(roadIds.has(f.properties.roadId), `road ${f.properties.roadId}`).toBe(true);
    const placeIds = osm(['places']);
    for (const f of s.settlements.features) expect(placeIds.has(f.properties.settlementId), `place ${f.properties.settlementId}`).toBe(true);
    const shelterIds = new Set(geo('shelters').features.map((f) => String(f.properties.shelter_id)));
    expect(shelterIds.size).toBe(23);
    for (const f of s.shelters.features) expect(shelterIds.has(f.properties.shelterId)).toBe(true);
    for (const rid of [S1_BRIDGE_ID, S2_ROAD_ID]) expect(road(s, rid)).toBeDefined();
    expect(sett(s, S4_SETTLEMENT_ID).properties.name).toMatch(/Auniati/i);
    expect(s.shelters.features.some((f) => f.properties.shelterId === S2_SHELTER_ID)).toBe(true);
    for (const r of FIXTURES.routes.features) {
      expect(s.settlements.features.some((f) => f.properties.settlementId === r.properties.from)).toBe(true);
      expect(s.shelters.features.some((f) => f.properties.shelterId === r.properties.to)).toBe(true);
      for (const v of r.properties.viaRoadIds) expect(road(s, v), `via ${v}`).toBeDefined();
    }
  });
  it('does not invent shelter capacity or occupancy; flags unconfirmed camps', () => {
    for (const f of s.shelters.features) expect(f.properties).toMatchObject({ capacity: 0, occupancy: 0, open: false });
  });
  it('S1 bridge is a bridge; baseline routes use curated roads only', () => {
    expect(road(s, S1_BRIDGE_ID).properties.kind).toBe('bridge');
    expect(ROUTES.every((r) => (ROUTE_VIA[r.id] ?? []).length > 0)).toBe(true);
  });
  it('returns independent copies and exposes scenarioRules', () => {
    const a = initialSnapshot();
    a.roads.features[0]!.properties.status = 'blocked';
    expect(initialSnapshot().roads.features[0]!.properties.status).toBe('open');
    expect(scenarioRules.apply).toBe(applyEvent);
  });
});

describe('S1 — submerged bridge (synthetic)', () => {
  const s0 = initialSnapshot();
  const crossing = ROUTES.filter((r) => (ROUTE_VIA[r.id] ?? []).includes(S1_BRIDGE_ID));
  it('has a precomputed baseline crossing the bridge, with an alternate', () => {
    expect(crossing.length).toBeGreaterThan(0);
    expect(crossing.some((r) => (ALTERNATES[r.id] ?? []).length > 0)).toBe(true);
  });
  it('road_blockage on the bridge: impassable + reason, routes refused, alternates recalculated, far side limited, 85.3 m flood', () => {
    const e = block(s0, S1_BRIDGE_ID, 'full', 'submerged');
    const r = applyEvent(e, s0, { now: NOW });
    expect(r.changed).toBe(true);
    const b = road(r.snapshot, S1_BRIDGE_ID).properties;
    expect(b).toMatchObject({ status: 'blocked', passability: 'impassable', kind: 'bridge', sourceEventIds: [e.clientEventId] });
    expect(b.reason).toBe('Submerged — water level 85.3 m above deck ≈84.8 m (synthetic S1), reported at 12:35 IST');
    for (const c of crossing) {
      const p = route(r.snapshot, c.id)!.properties;
      expect(p.status).toBe('unavailable');
      expect(p.refusal?.blockingFeatureIds).toEqual([S1_BRIDGE_ID]);
      for (const a of ALTERNATES[c.id] ?? []) {
        const crossesBlocked = (ROUTE_VIA[a.id] ?? []).includes(S1_BRIDGE_ID);
        // an alternate that itself crosses the blocked bridge is not offered
        if (crossesBlocked) expect(route(r.snapshot, a.id)).toBeUndefined();
        else expect(route(r.snapshot, a.id)!.properties).toMatchObject({ status: 'recalculated', replacesRouteId: c.id });
      }
    }
    expect([...ALTERNATES[crossing.find((c) => c.id.includes('2885248524'))!.id] ?? []].some((a) => route(r.snapshot, a.id)?.properties.status === 'recalculated')).toBe(true);
    const far = FIXTURES.notes.affectedSettlements[S1_BRIDGE_ID] ?? [];
    expect(far.length).toBeGreaterThan(0);
    for (const sid of far) {
      const st = sett(r.snapshot, sid).properties;
      expect(st.accessibility).toBe('limited');
      expect(st.cutOffReason?.blockingFeatureIds).toEqual([S1_BRIDGE_ID]);
    }
    expect(r.snapshot.flood.features.length).toBeGreaterThan(0);
    expect(r.snapshot.flood.features.every((f) => f.properties.areaId.startsWith('flood-s1-') && f.properties.confidence === 'modelled')).toBe(true);
    expect(ProjectionSnapshotSchema.safeParse(r.snapshot).success).toBe(true);
    expect(road(s0, S1_BRIDGE_ID).properties.status).toBe('open'); // input untouched
    // idempotent: no duplicate alternates
    const again = applyEvent(e, r.snapshot, { now: NOW });
    for (const c of crossing) for (const a of ALTERNATES[c.id] ?? []) expect(again.snapshot.routes.features.filter((f) => f.properties.routeId === a.id).length).toBe(route(r.snapshot, a.id) ? 1 : 0);
  });
  it('water_level near the bridge triggers the same script', () => {
    const e = FieldEventSchema.parse({ ...at(mid(road(s0, S1_BRIDGE_ID).geometry.coordinates)), type: 'water_level', gaugeId: 'g', levelCm: 30, trend: 'rising' });
    const r = applyEvent(e, s0, { now: NOW });
    expect(road(r.snapshot, S1_BRIDGE_ID).properties.status).toBe('blocked');
    expect(road(r.snapshot, S1_BRIDGE_ID).properties.reason).toContain('85.3 m above deck ≈84.8 m');
  });
  it('road_cleared reverts everything', () => {
    const blocked = applyEvent(block(s0, S1_BRIDGE_ID, 'full', 'submerged'), s0).snapshot;
    const r = applyEvent(clear(s0, S1_BRIDGE_ID), blocked).snapshot;
    expect(road(r, S1_BRIDGE_ID).properties).toMatchObject({ status: 'open', passability: 'passable' });
    for (const c of crossing) {
      expect(route(r, c.id)!.properties.status).toBe('active');
      expect(route(r, c.id)!.properties.refusal).toBeUndefined();
      for (const a of ALTERNATES[c.id] ?? []) expect(route(r, a.id)?.properties.status ?? 'unavailable').toBe('unavailable');
    }
    for (const sid of FIXTURES.notes.affectedSettlements[S1_BRIDGE_ID] ?? []) {
      expect(sett(r, sid).properties.accessibility).toBe('accessible');
      expect(sett(r, sid).properties.cutOffReason).toBeUndefined();
    }
    expect(r.flood.features).toHaveLength(0);
    expect(applyEvent(clear(s0, S1_BRIDGE_ID), r).changed).toBe(false);
  });
  it('partial blockage only limits the road', () => {
    const r = applyEvent(block(s0, S1_BRIDGE_ID, 'partial'), s0).snapshot;
    expect(road(r, S1_BRIDGE_ID).properties.passability).toBe('limited');
    for (const c of crossing) expect(route(r, c.id)!.properties.status).toBe('active');
  });
});

describe('S2 — blocked road near the lowest camp (synthetic)', () => {
  const s0 = initialSnapshot();
  it('blocks the road, refuses the route to MJ-SH-009 and adds the alternative', () => {
    const toCamp = ROUTES.filter((r) => r.properties.to === S2_SHELTER_ID && (ROUTE_VIA[r.id] ?? []).includes(S2_ROAD_ID));
    expect(toCamp.length).toBeGreaterThan(0);
    const e = block(s0, S2_ROAD_ID);
    const r = applyEvent(e, s0, { now: NOW });
    expect(road(r.snapshot, S2_ROAD_ID).properties).toMatchObject({ status: 'blocked', passability: 'impassable' });
    for (const c of toCamp) {
      expect(route(r.snapshot, c.id)!.properties).toMatchObject({ status: 'unavailable' });
      expect(route(r.snapshot, c.id)!.properties.refusal?.blockingFeatureIds).toEqual([S2_ROAD_ID]);
      expect((ALTERNATES[c.id] ?? []).length).toBeGreaterThan(0);
      for (const a of ALTERNATES[c.id] ?? []) expect(route(r.snapshot, a.id)?.properties.status ?? 'recalculated').toBe('recalculated');
    }
    expect(ProjectionSnapshotSchema.safeParse(r.snapshot).success).toBe(true);
  });
  it('resolves the road by nearest-road lookup (<=300 m) when roadId is missing', () => {
    const p = mid(road(s0, S2_ROAD_ID).geometry.coordinates);
    const e = FieldEventSchema.parse({ ...at(p), type: 'road_blockage', blockage: 'full' });
    const r = applyEvent(e, s0);
    expect(r.changed).toBe(true);
    expect([...r.snapshot.roads.features].some((f) => f.properties.status === 'blocked')).toBe(true);
  });
  it('ignores blockages with no road within 300 m', () => {
    const e = FieldEventSchema.parse({ ...at([93.0, 25.0]), type: 'road_blockage', blockage: 'full' });
    const r = applyEvent(e, s0);
    expect(r.changed).toBe(false);
    expect(r.snapshot).toBe(s0);
  });
  it('road_cleared reverts', () => {
    const blocked = applyEvent(block(s0, S2_ROAD_ID), s0).snapshot;
    const r = applyEvent(clear(s0, S2_ROAD_ID), blocked).snapshot;
    expect(road(r, S2_ROAD_ID).properties.status).toBe('open');
    for (const c of ROUTES.filter((x) => (ROUTE_VIA[x.id] ?? []).includes(S2_ROAD_ID))) expect(route(r, c.id)!.properties.status).toBe('active');
  });
});

describe('S4 — Auniati disconnected (synthetic)', () => {
  const s0 = initialSnapshot();
  const auniatiRoutes = ROUTES.filter((r) => r.properties.from === S4_SETTLEMENT_ID);
  it('has Auniati baseline routes and no alternates for them', () => {
    expect(auniatiRoutes.length).toBeGreaterThan(0);
    for (const r of auniatiRoutes) expect(ALTERNATES[r.id] ?? []).toHaveLength(0);
  });
  it(`a depth reading >= ${S4_TRIGGER_CM} cm (82.3 m ground + depth >= 83.8 m) cuts Auniati off with NO safe route`, () => {
    const e = level(s0, S4_SETTLEMENT_ID, S4_TRIGGER_CM);
    const r = applyEvent(e, s0, { now: NOW });
    expect(r.changed).toBe(true);
    const a = sett(r.snapshot, S4_SETTLEMENT_ID).properties;
    expect(a).toMatchObject({ accessibility: 'cut_off', evacuationPriority: 'critical', evacuationDeadline: DEADLINE });
    expect(a.cutOffReason?.sourceEventIds).toEqual([e.clientEventId]);
    expect(a.cutOffReason?.summary).toContain('synthetic');
    expect(r.snapshot.flood.features.length).toBeGreaterThan(0);
    expect(r.snapshot.flood.features.every((f) => f.properties.areaId.startsWith('flood-s4-') && f.properties.confidence === 'modelled')).toBe(true);
    const fromAuniati = r.snapshot.routes.features.filter((f) => f.properties.from === S4_SETTLEMENT_ID);
    expect(fromAuniati.length).toBeGreaterThan(0);
    for (const f of fromAuniati) {
      expect(f.properties.status).toBe('unavailable');
      expect(f.properties.refusal?.summary).toBeTruthy();
    }
    // no available (active/recalculated) route leaves Auniati
    expect(r.snapshot.routes.features.filter((f) => f.properties.from === S4_SETTLEMENT_ID && f.properties.status !== 'unavailable')).toHaveLength(0);
    expect(ProjectionSnapshotSchema.safeParse(r.snapshot).success).toBe(true);
  });
  it('a shallower reading does nothing; a later low reading reverts the script', () => {
    expect(applyEvent(level(s0, S4_SETTLEMENT_ID, S4_TRIGGER_CM - 1), s0).changed).toBe(false);
    const cut = applyEvent(level(s0, S4_SETTLEMENT_ID, S4_TRIGGER_CM + 20), s0).snapshot;
    const r = applyEvent(level(s0, S4_SETTLEMENT_ID, 10), cut).snapshot;
    expect(sett(r, S4_SETTLEMENT_ID).properties.accessibility).toBe('accessible');
    expect(sett(r, S4_SETTLEMENT_ID).properties.cutOffReason).toBeUndefined();
    expect(r.flood.features).toHaveLength(0);
    for (const f of r.routes.features.filter((x) => x.properties.from === S4_SETTLEMENT_ID)) expect(f.properties.status).toBe('active');
  });
  it('S1 flood outranks S4 flood and survives an S4 revert', () => {
    const s1 = applyEvent(block(s0, S1_BRIDGE_ID, 'full', 'submerged'), s0).snapshot;
    const both = applyEvent(level(s1, S4_SETTLEMENT_ID, S4_TRIGGER_CM), s1).snapshot;
    expect(both.flood.features[0]!.properties.areaId.startsWith('flood-s1-')).toBe(true);
    const back = applyEvent(level(both, S4_SETTLEMENT_ID, 0), both).snapshot;
    expect(back.flood.features[0]!.properties.areaId.startsWith('flood-s1-')).toBe(true);
  });
});

describe('other events', () => {
  it('household_registration increments households (explicit settlement id)', () => {
    const s0 = initialSnapshot();
    const sid = s0.settlements.features[0]!.properties.settlementId;
    const e = FieldEventSchema.parse({ ...at(s0.settlements.features[0]!.geometry.coordinates), type: 'household_registration', householdId: id(), headName: 'A', members: 4, vulnerable: { elderly: false, children: true, disabled: false, medical: false }, settlementId: sid, needs: ['food'] });
    const r = applyEvent(e, s0);
    expect(sett(r.snapshot, sid).properties.households).toBe(1);
    expect(sett(r.snapshot, sid).properties.needs).toContain('food');
  });
  it('unknown events leave projections unchanged', () => {
    const s0 = initialSnapshot();
    const odd = { ...at([94.2, 26.9]), type: 'sighting' } as unknown as FieldEvent;
    const r = applyEvent(odd, s0);
    expect(r.changed).toBe(false);
    expect(r.snapshot).toBe(s0);
  });
});
