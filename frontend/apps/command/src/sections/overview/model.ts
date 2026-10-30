import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import type { Selection } from '../../app';
import type { ChangeBatch } from '../../feed';
import { feedStatus } from '../../feed/status';

/** Scenario metadata as published by @setu/geo (SYNTHETIC, Karthik's configs). Structural subset. */
export interface ScenarioMeta {
  id: string;
  name: string;
  note: string;
  synthetic: true;
  targets: Record<string, string | number | number[]>;
}

export interface OverviewCounts {
  affectedSettlements: number;
  disconnected: number;
  impassableSegments: number;
  pendingReports: number;
  evacuationActions: number;
}

/** Every number is a straight count over server projections / event records. Nothing is derived. */
export function overviewCounts(snap: ProjectionSnapshot | undefined, events: EventRecord[]): OverviewCounts | undefined {
  if (!snap) return undefined;
  const s = snap.settlements.features.map((f) => f.properties);
  return {
    affectedSettlements: s.filter((p) => p.accessibility !== 'accessible').length,
    disconnected: s.filter((p) => p.accessibility === 'cut_off').length,
    impassableSegments: snap.roads.features.filter((f) => (f.properties.passability ?? (f.properties.status === 'blocked' ? 'impassable' : 'passable')) === 'impassable').length,
    pendingReports: events.filter((e) => feedStatus(e, snap.version) === 'accepted').length,
    evacuationActions: s.filter((p) => !!p.evacuationDeadline).length,
  };
}

export type AlertSeverity = 'critical' | 'warning' | 'review';
export interface Alert {
  key: string;
  severity: AlertSeverity;
  icon: string;
  label: string;
  text: string;
  target: Selection;
  /** Seen changing during this session (from the server snapshot diff), not just present. */
  isNew: boolean;
}

/**
 * Critical alerts: the current server state that needs an operator (cut-off settlements, impassable
 * roads/bridges, refused routes), flagged `isNew` when the snapshot diff saw it change this session.
 */
export function criticalAlerts(snap: ProjectionSnapshot | undefined, batches: ChangeBatch[]): Alert[] {
  if (!snap) return [];
  const changed = new Set(batches.flatMap((b) => b.changes.map((c) => `${c.kind}:${c.id}`)));
  const out: Alert[] = [];
  for (const f of snap.settlements.features) {
    const p = f.properties;
    if (p.accessibility === 'accessible') continue;
    const cut = p.accessibility === 'cut_off';
    out.push({
      key: `settlement-${p.settlementId}`,
      severity: cut ? 'critical' : 'warning',
      icon: cut ? '⛔' : '⚠',
      label: cut ? 'Cut off' : 'Limited access',
      text: `${p.name}${p.cutOffReason ? ` — ${p.cutOffReason.summary}` : ''}`,
      target: { kind: 'settlement', id: p.settlementId },
      isNew: changed.has(`settlement:${p.settlementId}`),
    });
  }
  for (const f of snap.roads.features) {
    const p = f.properties;
    const impassable = p.passability === 'impassable' || (p.passability === undefined && p.status === 'blocked');
    if (!impassable) continue;
    out.push({
      key: `road-${p.roadId}`,
      severity: 'critical',
      icon: '⛔',
      label: p.kind === 'bridge' ? 'Bridge impassable' : 'Road impassable',
      text: `${p.name} (${p.roadId})${p.reason ? ` — ${p.reason}` : ''}`,
      target: { kind: 'road', id: p.roadId },
      isNew: changed.has(`road:${p.roadId}`),
    });
  }
  const evacSettlements = new Set(snap.settlements.features.filter((f) => f.properties.accessibility !== 'accessible').map((f) => f.properties.settlementId));
  for (const f of snap.routes.features) {
    const p = f.properties;
    if (p.status !== 'unavailable' || p.kind !== 'evacuation' || !evacSettlements.has(p.from)) continue;
    out.push({
      key: `route-${p.routeId}`,
      severity: 'warning',
      icon: '⚠',
      label: 'Route refused',
      text: `${p.routeId}: ${p.refusal?.summary ?? 'unavailable'}`,
      target: { kind: 'route', id: p.routeId },
      isNew: changed.has(`route:${p.routeId}`),
    });
  }
  const rank = { critical: 0, warning: 1, review: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || Number(b.isNew) - Number(a.isNew));
}

/**
 * The scripted scenarios that the visible events/state correspond to. Only reported when an event
 * actually targets the scenario's road/bridge, or its target settlement is cut off in the server
 * snapshot AND a water_level report exists. Otherwise empty => "Not provided by backend".
 */
export function triggeredScenario(
  scenarios: readonly ScenarioMeta[],
  events: EventRecord[],
  snap: ProjectionSnapshot | undefined,
): ScenarioMeta[] {
  const roadIds = new Set(events.flatMap((e) => (e.event.type === 'road_blockage' || e.event.type === 'road_cleared') && e.event.roadId ? [e.event.roadId] : []));
  const hasWater = events.some((e) => e.event.type === 'water_level');
  const cutOff = new Set(snap?.settlements.features.filter((f) => f.properties.accessibility === 'cut_off').map((f) => f.properties.settlementId));
  const hit = (s: ScenarioMeta) => {
    const t = s.targets;
    const road = String(t.bridgeId ?? t.roadId ?? '');
    if (road && roadIds.has(road)) return true;
    return !!t.settlementId && hasWater && cutOff.has(String(t.settlementId));
  };
  return scenarios.filter(hit);
}
