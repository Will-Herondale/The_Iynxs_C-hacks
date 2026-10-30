/**
 * Scripted scenario rules for Majuli: a LOOKUP TABLE from known event patterns to precomputed projection changes.
 * This is deliberately not a routing, flood or accessibility engine; unknown patterns change nothing.
 * All scenarios follow Karthik's geo/SCENARIOS.md and are SYNTHETIC.
 *
 *  S1  road_blockage(full) / water_level near bridge 284824410 -> bridge impassable ("water 85.3 m above deck 84.8 m"),
 *      routes crossing it refused, precomputed alternates added (`recalculated`), far-side settlements `limited`,
 *      flood switches to the 85.3 m DEM-threshold polygons.
 *  S2  road_blockage(full) on road 1074461062 -> road blocked, routes using it (incl. the one to MJ-SH-009) refused, alternate added.
 *  S4  water_level near Auniati (10692764768) with levelCm >= S4_TRIGGER_CM -> flood = 83.8 m polygons, Auniati `cut_off`,
 *      deadline + priority critical, EVERY route from Auniati `unavailable` (no alternate exists).
 *      Field depth mapping: scenario level = 82.3 m (Auniati DEM) + levelCm / 100, i.e. `levelCm` is read as water depth
 *      above local ground at the report location. 150 cm reaches 83.8 m. A lower reading reverts S4.
 *  road_cleared reverts the road, its settlements, routes and (if no scenario still holds it) the flood.
 */
import type { FieldEvent, ProjectionSnapshot, RoadProps } from '@setu/contract';
import { distToLineM, haversineM, pointInPolygon, type Pos } from './geo.js';
import {
  AFFECTED_SETTLEMENTS, ALTERNATES, FLOOD_LEVELS, floodFeatures, ROUTE_VIA, S1_BRIDGE_ID, S1_DECK_M, S1_LEVEL_M,
  S4_GROUND_M, S4_LEVEL_M, S4_SETTLEMENT_ID, S4_TRIGGER_CM, type FloodLevelKey,
} from './data.js';

export const ROAD_MATCH_RADIUS_M = 300;
const SETTLEMENT_MATCH_RADIUS_M = 1500;
/** Evacuation deadline = event time + this many hours (deterministic from occurredAt). */
export const EVACUATION_WINDOW_H = 3;

export interface ApplyOptions {
  /** Timestamp for updatedAt/generatedAt; defaults to now. */
  now?: string;
}

export interface ApplyResult {
  /** New snapshot object (input is never mutated). version is prev+1 iff changed. */
  snapshot: ProjectionSnapshot;
  changed: boolean;
  /** Human-readable list of scripted changes, for logs/tests/UI toasts. */
  effects: string[];
}

const CAUSE_NOUN: Record<string, string> = { submerged: 'Submerged', debris: 'Debris', collapse: 'Collapsed', damage: 'Damaged', other: 'Blocked' };
const CAUSE_VERB: Record<string, string> = { submerged: 'submerged', debris: 'blocked by debris', collapse: 'collapsed', damage: 'damaged', other: 'blocked' };

/** HH:MM in India Standard Time (UTC+5:30), labelled. */
const hhmm = (iso: string) => `${new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(11, 16)} IST`;
const deadlineOf = (occurredAt: string) => new Date(new Date(occurredAt).getTime() + EVACUATION_WINDOW_H * 3600_000).toISOString();

const findRoad = (s: ProjectionSnapshot, id: string) => s.roads.features.find((f) => f.properties.roadId === id);
const findSettlement = (s: ProjectionSnapshot, id: string) => s.settlements.features.find((f) => f.properties.settlementId === id);
const findRoute = (s: ProjectionSnapshot, id: string) => s.routes.features.find((f) => f.properties.routeId === id);

function nearestRoad(s: ProjectionSnapshot, p: Pos): string | undefined {
  let best: { id: string; d: number } | undefined;
  for (const f of s.roads.features) {
    const d = distToLineM(p, f.geometry.coordinates);
    if (d <= ROAD_MATCH_RADIUS_M && (!best || d < best.d)) best = { id: f.properties.roadId, d };
  }
  return best?.id;
}

function resolveRoadId(s: ProjectionSnapshot, e: { roadId?: string; location: { lat: number; lng: number } }): string | undefined {
  if (e.roadId && findRoad(s, e.roadId)) return e.roadId;
  return nearestRoad(s, [e.location.lng, e.location.lat]);
}

/** Flood level currently shown, from the area ids in the snapshot (`M-83.8-…`). */
function activeLevel(s: ProjectionSnapshot): FloodLevelKey | undefined {
  for (const k of ['85.3', '83.8'] as const) if (s.flood.features.some((f) => f.properties.areaId.startsWith(FLOOD_LEVELS[k].areaPrefix))) return k;
  return undefined;
}

/** Set the flood to `level` (or none). Returns true if the displayed extent changed. */
function setFlood(s: ProjectionSnapshot, level: FloodLevelKey | undefined, effects: string[]): boolean {
  if (activeLevel(s) === level) return false;
  s.flood.features = level ? floodFeatures(level).map((f) => ({ type: 'Feature' as const, ...f })) : [];
  effects.push(level ? `flood -> synthetic ${FLOOD_LEVELS[level].levelM} m DEM-threshold extent` : 'flood extent cleared');
  return true;
}

const s1Active = (s: ProjectionSnapshot) => findRoad(s, S1_BRIDGE_ID)?.properties.status === 'blocked';
const s4Active = (s: ProjectionSnapshot) => findSettlement(s, S4_SETTLEMENT_ID)?.properties.accessibility === 'cut_off';

/** The flood a still-active scenario holds: S1 (85.3 m) over S4 (83.8 m). */
function floodFromScenarios(s: ProjectionSnapshot): FloodLevelKey | undefined {
  return s1Active(s) ? '85.3' : s4Active(s) ? '83.8' : undefined;
}

function refusalFor(roadName: string, roadId: string, cause?: string) {
  return { summary: `Refused: crosses ${roadName} (${roadId}), which is impassable${cause ? ` (${cause})` : ''}.`, blockingFeatureIds: [roadId] };
}

function addAlternates(s: ProjectionSnapshot, routeId: string, effects: string[]): void {
  for (const alt of ALTERNATES[routeId] ?? []) {
    // an alternate that itself crosses a currently-blocked road is not offered
    if ((ROUTE_VIA[alt.id] ?? []).some((rid) => findRoad(s, rid)?.properties.status === 'blocked')) continue;
    const existing = findRoute(s, alt.id);
    if (existing) { existing.properties.status = 'recalculated'; continue; }
    s.routes.features.push({ type: 'Feature', id: alt.id, geometry: structuredClone(alt.geometry), properties: structuredClone(alt.properties) });
    effects.push(`route ${alt.id} added (recalculated, replaces ${routeId})`);
  }
}

function blockRoad(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'road_blockage' }>, now: string, effects: string[]): boolean {
  const roadId = resolveRoadId(s, e);
  const road = roadId ? findRoad(s, roadId) : undefined;
  if (!roadId || !road) return false;
  const status: RoadProps['status'] = e.blockage === 'full' ? 'blocked' : 'partial';
  // never downgrade an already-blocked road to partial
  if (!(road.properties.status === 'blocked' && status === 'partial')) road.properties.status = status;
  road.properties.updatedAt = now;
  if (!road.properties.sourceEventIds.includes(e.clientEventId)) road.properties.sourceEventIds.push(e.clientEventId);
  const isBlocked = road.properties.status === 'blocked';
  road.properties.passability = isBlocked ? 'impassable' : 'limited';
  const noun = CAUSE_NOUN[e.cause ?? 'other'] ?? 'Blocked';
  road.properties.reason = roadId === S1_BRIDGE_ID && isBlocked
    ? `Submerged — water level ${S1_LEVEL_M} m above deck ≈${S1_DECK_M} m (synthetic S1), reported at ${hhmm(e.occurredAt)}`
    : `${isBlocked ? noun : 'Partly ' + noun.toLowerCase()} — volunteer report at ${hhmm(e.occurredAt)}${e.cause ? ` (cause: ${e.cause})` : ''}`;
  effects.push(`road ${roadId} -> ${road.properties.status}`);

  for (const sid of AFFECTED_SETTLEMENTS[roadId] ?? []) {
    const st = findSettlement(s, sid);
    if (!st) continue;
    if (status === 'blocked') {
      st.properties.accessibility = st.properties.accessibility === 'cut_off' ? 'cut_off' : 'limited';
      const verb = roadId === S1_BRIDGE_ID ? 'submerged' : (CAUSE_VERB[e.cause ?? 'other'] ?? 'blocked');
      st.properties.cutOffReason = {
        summary: `${st.properties.name} (${sid}) has limited access: ${road.properties.name} (${roadId}) is ${verb}; its precomputed route crossing it is refused (synthetic fixture).`,
        blockingFeatureIds: [roadId],
        sourceEventIds: [e.clientEventId],
      };
    } else if (st.properties.accessibility === 'accessible') st.properties.accessibility = 'limited';
    effects.push(`settlement ${sid} -> ${st.properties.accessibility}`);
  }
  if (status === 'blocked') {
    for (const rt of [...s.routes.features]) {
      if (rt.properties.status === 'unavailable' || !(ROUTE_VIA[rt.properties.routeId] ?? []).includes(roadId)) continue;
      rt.properties.status = 'unavailable';
      rt.properties.refusal = refusalFor(road.properties.name, roadId, e.cause);
      effects.push(`route ${rt.properties.routeId} -> unavailable`);
      addAlternates(s, rt.properties.routeId, effects);
    }
    if (roadId === S1_BRIDGE_ID) setFlood(s, '85.3', effects);
  }
  return true;
}

function clearRoad(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'road_cleared' }>, now: string, effects: string[]): boolean {
  const road = findRoad(s, e.roadId);
  if (!road || road.properties.status === 'open') return false;
  road.properties.status = 'open';
  road.properties.passability = 'passable';
  road.properties.reason = `Cleared — volunteer report at ${hhmm(e.occurredAt)}`;
  road.properties.updatedAt = now;
  if (!road.properties.sourceEventIds.includes(e.clientEventId)) road.properties.sourceEventIds.push(e.clientEventId);
  effects.push(`road ${e.roadId} -> open`);
  for (const sid of AFFECTED_SETTLEMENTS[e.roadId] ?? []) {
    const st = findSettlement(s, sid);
    if (st && st.properties.accessibility !== 'accessible') {
      st.properties.accessibility = 'accessible';
      delete st.properties.cutOffReason;
      delete st.properties.evacuationDeadline;
      delete st.properties.evacuationPriority;
      effects.push(`settlement ${sid} -> accessible`);
    }
  }
  for (const rt of s.routes.features) {
    const refusedBy = rt.properties.refusal?.blockingFeatureIds ?? [];
    if (rt.properties.status === 'unavailable' && refusedBy.includes(e.roadId)) {
      const replaced = rt.properties.replacesRouteId;
      // an alternate comes back only while the route it replaces is still refused; baselines come back as active
      const status = replaced ? (findRoute(s, replaced)?.properties.status === 'unavailable' ? 'recalculated' : 'unavailable') : 'active';
      rt.properties.status = status;
      if (status !== 'unavailable') delete rt.properties.refusal;
      effects.push(`route ${rt.properties.routeId} -> ${status}`);
      for (const alt of ALTERNATES[rt.properties.routeId] ?? []) {
        const a = findRoute(s, alt.id);
        if (a) { a.properties.status = 'unavailable'; effects.push(`route ${alt.id} -> unavailable`); }
      }
    }
  }
  if (e.roadId === S1_BRIDGE_ID) setFlood(s, floodFromScenarios(s), effects);
  return true;
}

function floodReport(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'flood_report' }>, effects: string[]): boolean {
  const p: Pos = [e.location.lng, e.location.lat];
  const area = s.flood.features.find((f) => (e.areaId ? f.properties.areaId === e.areaId : pointInPolygon(p, f.geometry.coordinates)));
  if (!area) return false;
  let changed = false;
  if (e.severity > area.properties.severity) { area.properties.severity = e.severity; effects.push(`flood ${area.properties.areaId} severity -> ${e.severity}`); changed = true; }
  if (e.depthCm !== undefined && e.depthCm > area.properties.depthCm) { area.properties.depthCm = e.depthCm; effects.push(`flood ${area.properties.areaId} depth -> ${e.depthCm}cm`); changed = true; }
  return changed;
}

/** Scenario level (m) implied by a field depth reading at Auniati: local ground 82.3 m + depth. */
export const scenarioLevelM = (levelCm: number) => S4_GROUND_M + levelCm / 100;

function waterLevel(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'water_level' }>, now: string, effects: string[]): boolean {
  const p: Pos = [e.location.lng, e.location.lat];
  let changed = false;

  // S1: a water-level report at/near the bridge triggers the submerged-bridge script.
  const bridge = findRoad(s, S1_BRIDGE_ID);
  if (bridge && bridge.properties.status !== 'blocked' && distToLineM(p, bridge.geometry.coordinates) <= ROAD_MATCH_RADIUS_M) {
    const synthetic = { ...e, type: 'road_blockage' as const, roadId: S1_BRIDGE_ID, blockage: 'full' as const, cause: 'submerged' as const };
    changed = blockRoad(s, synthetic as Extract<FieldEvent, { type: 'road_blockage' }>, now, effects) || changed;
  }

  // S4: a deep-enough reading near Auniati cuts it off; a lower reading reverts the script.
  const st = findSettlement(s, S4_SETTLEMENT_ID);
  if (st && haversineM(p, st.geometry.coordinates) <= SETTLEMENT_MATCH_RADIUS_M) {
    if (e.levelCm >= S4_TRIGGER_CM && st.properties.accessibility !== 'cut_off') {
      const lvl = scenarioLevelM(e.levelCm).toFixed(1);
      if (!s1Active(s)) setFlood(s, '83.8', effects);
      const areas = s.flood.features.filter((f) => f.properties.areaId.startsWith(FLOOD_LEVELS['83.8'].areaPrefix) && pointInPolygon(st.geometry.coordinates, f.geometry.coordinates)).map((f) => f.properties.areaId);
      st.properties.accessibility = 'cut_off';
      st.properties.cutOffReason = {
        summary: `${st.properties.name} (${st.properties.settlementId}) is cut off: reported depth ${e.levelCm} cm puts the synthetic S4 water level at ${lvl} m (≥ ${S4_LEVEL_M} m); every precomputed route to a shelter is flooded and no safe route exists (synthetic DEM-threshold fixture, not a hydraulic simulation).`,
        blockingFeatureIds: areas.length ? areas : [FLOOD_LEVELS['83.8'].areaPrefix + 'all'],
        sourceEventIds: [e.clientEventId],
      };
      st.properties.evacuationDeadline = deadlineOf(e.occurredAt);
      st.properties.evacuationPriority = 'critical';
      effects.push(`settlement ${st.properties.settlementId} -> cut_off`);
      for (const rt of s.routes.features) {
        if (rt.properties.from !== S4_SETTLEMENT_ID || rt.properties.status === 'unavailable') continue;
        rt.properties.status = 'unavailable';
        rt.properties.refusal = { summary: `Refused: ${st.properties.name} is inside the synthetic ${S4_LEVEL_M} m flood extent; no safe route to any shelter.`, blockingFeatureIds: areas.length ? areas : [FLOOD_LEVELS['83.8'].areaPrefix + 'all'] };
        effects.push(`route ${rt.properties.routeId} -> unavailable`);
      }
      changed = true;
    } else if (e.levelCm < S4_TRIGGER_CM && st.properties.accessibility === 'cut_off' && st.properties.cutOffReason?.blockingFeatureIds.some((id) => id.startsWith(FLOOD_LEVELS['83.8'].areaPrefix))) {
      st.properties.accessibility = 'accessible';
      delete st.properties.cutOffReason;
      delete st.properties.evacuationDeadline;
      delete st.properties.evacuationPriority;
      effects.push(`settlement ${st.properties.settlementId} -> accessible`);
      for (const rt of s.routes.features) {
        if (rt.properties.from === S4_SETTLEMENT_ID && rt.properties.status === 'unavailable') {
          rt.properties.status = 'active';
          delete rt.properties.refusal;
          effects.push(`route ${rt.properties.routeId} -> active`);
        }
      }
      setFlood(s, floodFromScenarios(s), effects);
      changed = true;
    }
  }
  return changed;
}

function household(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'household_registration' }>, effects: string[]): boolean {
  let st = e.settlementId ? findSettlement(s, e.settlementId) : undefined;
  if (!st) {
    const p: Pos = [e.location.lng, e.location.lat];
    let best = Infinity;
    for (const f of s.settlements.features) {
      const d = haversineM(p, f.geometry.coordinates);
      if (d <= SETTLEMENT_MATCH_RADIUS_M && d < best) { best = d; st = f; }
    }
  }
  if (!st) return false;
  st.properties.households += 1;
  st.properties.population += e.members;
  for (const n of e.needs) if (!st.properties.needs.includes(n)) st.properties.needs.push(n);
  effects.push(`settlement ${st.properties.settlementId} households -> ${st.properties.households}`);
  return true;
}

export function applyEvent(event: FieldEvent, snapshot: ProjectionSnapshot, opts: ApplyOptions = {}): ApplyResult {
  const now = opts.now ?? new Date().toISOString();
  const next = structuredClone(snapshot);
  const effects: string[] = [];
  let changed = false;
  switch (event.type) {
    case 'road_blockage': changed = blockRoad(next, event, now, effects); break;
    case 'road_cleared': changed = clearRoad(next, event, now, effects); break;
    case 'flood_report': changed = floodReport(next, event, effects); break;
    case 'water_level': changed = waterLevel(next, event, now, effects); break;
    case 'household_registration': changed = household(next, event, effects); break;
    default: break; // unknown event types: recorded by the store, projections untouched
  }
  if (!changed) return { snapshot, changed: false, effects: [] };
  next.version = snapshot.version + 1;
  next.generatedAt = now;
  for (const c of [next.flood, next.roads, next.settlements, next.routes, next.shelters]) {
    c.version = next.version;
    c.generatedAt = now;
  }
  return { snapshot: next, changed: true, effects };
}
