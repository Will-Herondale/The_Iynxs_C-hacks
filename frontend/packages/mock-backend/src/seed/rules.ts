/**
 * Scripted scenario rules: a LOOKUP TABLE from known event patterns to precomputed projection changes.
 * This is deliberately not a routing, flood or accessibility engine; unknown patterns change nothing.
 */
import type { FieldEvent, ProjectionSnapshot, RoadProps, RouteProps, SettlementProps } from '@setu/contract';
import { distToLineM, haversineM, pointInPolygon, type Pos } from './geo.js';
import { EVAC_1B_GEOMETRY, EVAC_2B_GEOMETRY, FLOOD_A2_GROWN, GAUGES } from './data.js';

export const ROAD_MATCH_RADIUS_M = 300;
const SETTLEMENT_MATCH_RADIUS_M = 1500;

/** What a *full* blockage on a road does. Partial blockage only degrades `limited` settlements. */
export interface BlockageScript {
  settlements: string[];
  /** Route made unavailable and the precomputed replacement. */
  reroute?: { routeId: string; replacementId: string; geometry: Pos[]; etaMin: number };
  /** Routes that cross this road and are refused (unavailable, with a `refusal`) when it is blocked. */
  refuses?: string[];
  /** The blocked road was the settlement's only road access (changes the cut-off wording). */
  onlyAccess?: boolean;
  /** A full blockage floods the bridge approach: grow flood area A2 (confidence observed). */
  growFlood?: boolean;
  /** Evacuation priority the settlements return to when the road is cleared. */
  baselinePriority?: SettlementProps['evacuationPriority'];
}

/** Evacuation deadline = event time + this many hours (deterministic from occurredAt). */
export const EVACUATION_WINDOW_H = 3;

export const BLOCKAGE_SCRIPTS: Record<string, BlockageScript> = {
  // Scenario 1: Beltola-Basistha Road blocked -> Beltola cut off, EVAC-2 replaced by EVAC-2b
  R7: { settlements: ['S3'], reroute: { routeId: 'EVAC-2', replacementId: 'EVAC-2b', geometry: EVAC_2B_GEOMETRY, etaMin: 41 } },
  // Scenario 2: Lokhra Road blocked -> Kahilipara cut off (no reroute scripted)
  R3: { settlements: ['S5'] },
  // Scenario 3: Bharalu Embankment Road blocked -> Bharalumukh cut off, EVAC-1 replaced by EVAC-1b
  R4: { settlements: ['S1'], reroute: { routeId: 'EVAC-1', replacementId: 'EVAC-1b', geometry: EVAC_1B_GEOMETRY, etaMin: 47 } },
  // Garchuk-Maligaon Road
  R10: { settlements: ['S6'] },
  // Demo: Bharalu Bridge (B1) submerged -> Hatigaon (S4) cut off, EVAC-3 refused, flood A2 grows over the bridge
  B1: { settlements: ['S4'], refuses: ['EVAC-3'], onlyAccess: true, growFlood: true, baselinePriority: 'high' },
};

const CAUSE_NOUN: Record<string, string> = { submerged: 'Submerged', debris: 'Debris', collapse: 'Collapsed', damage: 'Damaged', other: 'Blocked' };
const CAUSE_VERB: Record<string, string> = { submerged: 'submerged', debris: 'blocked by debris', collapse: 'collapsed', damage: 'damaged', other: 'blocked' };

const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
const deadlineOf = (occurredAt: string) => new Date(new Date(occurredAt).getTime() + EVACUATION_WINDOW_H * 3600_000).toISOString();

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

function clone(s: ProjectionSnapshot): ProjectionSnapshot {
  return structuredClone(s);
}

function nearestRoad(s: ProjectionSnapshot, p: Pos): string | undefined {
  let best: { id: string; d: number } | undefined;
  for (const f of s.roads.features) {
    const d = distToLineM(p, f.geometry.coordinates);
    if (d <= ROAD_MATCH_RADIUS_M && (!best || d < best.d)) best = { id: f.properties.roadId, d };
  }
  return best?.id;
}

function findRoad(s: ProjectionSnapshot, id: string) {
  return s.roads.features.find((f) => f.properties.roadId === id);
}
function findSettlement(s: ProjectionSnapshot, id: string) {
  return s.settlements.features.find((f) => f.properties.settlementId === id);
}
function findRoute(s: ProjectionSnapshot, id: string) {
  return s.routes.features.find((f) => f.properties.routeId === id);
}

function resolveRoadId(s: ProjectionSnapshot, e: { roadId?: string; location: { lat: number; lng: number } }): string | undefined {
  if (e.roadId && findRoad(s, e.roadId)) return e.roadId;
  return nearestRoad(s, [e.location.lng, e.location.lat]);
}

function eventKey(e: FieldEvent): string {
  return e.clientEventId;
}

function blockRoad(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'road_blockage' }>, now: string, effects: string[]): boolean {
  const roadId = resolveRoadId(s, e);
  const road = roadId ? findRoad(s, roadId) : undefined;
  if (!roadId || !road) return false;
  const status: RoadProps['status'] = e.blockage === 'full' ? 'blocked' : 'partial';
  // never downgrade an already-blocked road to partial
  if (!(road.properties.status === 'blocked' && status === 'partial')) road.properties.status = status;
  road.properties.updatedAt = now;
  if (!road.properties.sourceEventIds.includes(eventKey(e))) road.properties.sourceEventIds.push(eventKey(e));
  const isBlocked = road.properties.status === 'blocked';
  road.properties.passability = isBlocked ? 'impassable' : 'limited';
  const noun = CAUSE_NOUN[e.cause ?? 'other'] ?? 'Blocked';
  road.properties.reason = `${isBlocked ? noun : 'Partly ' + noun.toLowerCase()} — volunteer report at ${hhmm(e.occurredAt)}${e.cause ? ` (cause: ${e.cause})` : ''}`;
  effects.push(`road ${roadId} -> ${road.properties.status}`);

  const script = BLOCKAGE_SCRIPTS[roadId];
  if (!script) return true;
  for (const sid of script.settlements) {
    const st = findSettlement(s, sid);
    if (!st) continue;
    const target: SettlementProps['accessibility'] = status === 'blocked' ? 'cut_off' : 'limited';
    if (st.properties.accessibility !== 'cut_off') st.properties.accessibility = target;
    if (status === 'blocked') {
      const verb = CAUSE_VERB[e.cause ?? 'other'] ?? 'blocked';
      const access = script.onlyAccess ? `${script.refuses?.[0] ?? 'it'} was the only road access` : 'it was a main road access';
      st.properties.cutOffReason = {
        summary: `${st.properties.name} (${sid}) is cut off: ${road.properties.name} (${roadId}) is ${verb} and ${access}.`,
        blockingFeatureIds: [roadId],
        sourceEventIds: [eventKey(e)],
      };
      st.properties.evacuationDeadline = deadlineOf(e.occurredAt);
      st.properties.evacuationPriority = 'critical';
    }
    effects.push(`settlement ${sid} -> ${st.properties.accessibility}`);
  }
  if (status === 'blocked') {
    for (const rid of script.refuses ?? []) {
      const rt = findRoute(s, rid);
      if (!rt) continue;
      rt.properties.status = 'unavailable';
      rt.properties.refusal = refusalFor(road.properties.name, roadId, e.cause);
      effects.push(`route ${rid} -> unavailable`);
    }
    if (script.growFlood) growA2(s, effects);
  }
  if (status === 'blocked' && script.reroute) {
    const { routeId, replacementId, geometry, etaMin } = script.reroute;
    const old = findRoute(s, routeId);
    if (old) {
      old.properties.status = 'unavailable';
      old.properties.refusal = refusalFor(road.properties.name, roadId, e.cause);
      effects.push(`route ${routeId} -> unavailable`);
      if (!findRoute(s, replacementId)) {
        const p: RouteProps = { routeId: replacementId, from: old.properties.from, to: old.properties.to, kind: old.properties.kind, status: 'recalculated', etaMin, replacesRouteId: routeId };
        s.routes.features.push({ type: 'Feature', id: replacementId, geometry: { type: 'LineString', coordinates: geometry }, properties: p });
        effects.push(`route ${replacementId} added (recalculated, replaces ${routeId})`);
      } else {
        findRoute(s, replacementId)!.properties.status = 'recalculated';
      }
    }
  }
  return true;
}

function refusalFor(roadName: string, roadId: string, cause?: string) {
  return { summary: `Refused: crosses ${roadName} (${roadId}), which is impassable${cause ? ` (${cause})` : ''}.`, blockingFeatureIds: [roadId] };
}

function growA2(s: ProjectionSnapshot, effects: string[]): void {
  const a2 = s.flood.features.find((f) => f.properties.areaId === 'A2');
  if (!a2) return;
  a2.properties.confidence = 'observed';
  if (JSON.stringify(a2.geometry.coordinates) !== JSON.stringify(FLOOD_A2_GROWN.coordinates)) {
    a2.geometry = structuredClone(FLOOD_A2_GROWN);
    effects.push('flood A2 extent grown');
  }
}

function clearRoad(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'road_cleared' }>, now: string, effects: string[]): boolean {
  const road = findRoad(s, e.roadId);
  if (!road || road.properties.status === 'open') return false;
  road.properties.status = 'open';
  road.properties.passability = 'passable';
  road.properties.reason = `Cleared — volunteer report at ${hhmm(e.occurredAt)}`;
  road.properties.updatedAt = now;
  if (!road.properties.sourceEventIds.includes(eventKey(e))) road.properties.sourceEventIds.push(eventKey(e));
  effects.push(`road ${e.roadId} -> open`);
  const script = BLOCKAGE_SCRIPTS[e.roadId];
  for (const sid of script?.settlements ?? []) {
    const st = findSettlement(s, sid);
    if (st && st.properties.accessibility !== 'accessible') {
      st.properties.accessibility = 'accessible';
      delete st.properties.cutOffReason;
      delete st.properties.evacuationDeadline;
      if (script?.baselinePriority) st.properties.evacuationPriority = script.baselinePriority;
      else delete st.properties.evacuationPriority;
      effects.push(`settlement ${sid} -> accessible`);
    }
  }
  for (const rid of script?.refuses ?? []) {
    const rt = findRoute(s, rid);
    if (rt) { rt.properties.status = 'active'; delete rt.properties.refusal; effects.push(`route ${rid} -> active`); }
  }
  if (script?.reroute) {
    const old = findRoute(s, script.reroute.routeId);
    if (old) { old.properties.status = 'active'; delete old.properties.refusal; effects.push(`route ${script.reroute.routeId} -> active`); }
    const repl = findRoute(s, script.reroute.replacementId);
    if (repl) { repl.properties.status = 'unavailable'; effects.push(`route ${script.reroute.replacementId} -> unavailable`); }
  }
  return true;
}

function floodReport(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'flood_report' }>, effects: string[]): boolean {
  const p: Pos = [e.location.lng, e.location.lat];
  const area = s.flood.features.find((f) => (e.areaId ? f.properties.areaId === e.areaId : pointInPolygon(p, f.geometry.coordinates)));
  if (!area) return false;
  let changed = false;
  if (e.severity >= 4 && area.properties.areaId === 'A2' && area.geometry !== undefined) {
    const grown = JSON.stringify(area.geometry.coordinates) !== JSON.stringify(FLOOD_A2_GROWN.coordinates);
    if (grown) {
      area.geometry = structuredClone(FLOOD_A2_GROWN);
      effects.push('flood A2 extent grown');
      changed = true;
    }
  }
  if (e.severity > area.properties.severity) { area.properties.severity = e.severity; effects.push(`flood ${area.properties.areaId} severity -> ${e.severity}`); changed = true; }
  if (e.depthCm !== undefined && e.depthCm > area.properties.depthCm) { area.properties.depthCm = e.depthCm; effects.push(`flood ${area.properties.areaId} depth -> ${e.depthCm}cm`); changed = true; }
  return changed;
}

function waterLevel(s: ProjectionSnapshot, e: Extract<FieldEvent, { type: 'water_level' }>, effects: string[]): boolean {
  const areaId = e.gaugeId ? GAUGES[e.gaugeId] : undefined;
  const area = areaId ? s.flood.features.find((f) => f.properties.areaId === areaId) : undefined;
  if (!area || area.properties.depthCm === e.levelCm) return false;
  area.properties.depthCm = Math.max(0, e.levelCm);
  effects.push(`gauge ${e.gaugeId} -> flood ${areaId} depth ${area.properties.depthCm}cm (${e.trend})`);
  return true;
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
  const next = clone(snapshot);
  const effects: string[] = [];
  let changed = false;
  switch (event.type) {
    case 'road_blockage': changed = blockRoad(next, event, now, effects); break;
    case 'road_cleared': changed = clearRoad(next, event, now, effects); break;
    case 'flood_report': changed = floodReport(next, event, effects); break;
    case 'water_level': changed = waterLevel(next, event, effects); break;
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
