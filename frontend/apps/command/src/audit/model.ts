import type { EventRecord, FieldEventType, ProjectionSnapshot } from '@setu/contract';
import { EVENT_META, feedStatus, type FeedStatus } from '../feed/status';
import type { Selection } from '../app';

/** Audit status vocabulary (strict mapping from the server record, never from HTTP 2xx). */
export const AUDIT_STATUS_LABEL: Record<FeedStatus, string> = {
  synced: 'Accepted',
  accepted: 'Synchronising',
  conflict: 'Requires review',
  rejected: 'Rejected',
};

/** applied + version reached => synced (Accepted); applied but not yet visible => accepted. */
export function auditStatus(rec: EventRecord, snapshotVersion: number | undefined): FeedStatus {
  return feedStatus(rec, snapshotVersion);
}

/** eventId / clientEventId -> features whose sourceEventIds reference it. Pure lookup, no projection logic. */
export type AffectedIndex = Map<string, Selection[]>;

export function affectedIndex(snapshot: ProjectionSnapshot | undefined): AffectedIndex {
  const index: AffectedIndex = new Map();
  if (!snapshot) return index;
  const add = (ids: string[] | undefined, sel: Selection) => {
    for (const id of new Set(ids ?? [])) {
      const list = index.get(id) ?? [];
      if (!list.some((s) => s.kind === sel.kind && s.id === sel.id)) list.push(sel);
      index.set(id, list);
    }
  };
  for (const f of snapshot.roads.features) add(f.properties.sourceEventIds, { kind: 'road', id: f.properties.roadId });
  for (const f of snapshot.settlements.features)
    add(f.properties.cutOffReason?.sourceEventIds, { kind: 'settlement', id: f.properties.settlementId });
  for (const f of snapshot.routes.features)
    add(f.properties.refusal?.sourceEventIds, { kind: 'route', id: f.properties.routeId });
  return index;
}

export function featuresAffectedBy(rec: EventRecord, index: AffectedIndex): Selection[] {
  const out: Selection[] = [];
  for (const key of [rec.eventId, rec.event.clientEventId]) {
    for (const s of index.get(key) ?? []) if (!out.some((o) => o.kind === s.kind && o.id === s.id)) out.push(s);
  }
  return out;
}

/** "reported offline, arrived 12 min later" from occurredAt vs receivedAt. */
export function delayLabel(rec: EventRecord): string {
  const ms = Date.parse(rec.receivedAt) - Date.parse(rec.event.occurredAt);
  if (Number.isNaN(ms)) return '';
  if (ms < -60_000) return 'device clock ahead of server';
  const min = Math.round(ms / 60_000);
  if (min < 2) return 'sent right away';
  if (min < 60) return `reported offline, arrived ${min} min later`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `reported offline, arrived ${h} h${m ? ` ${m} min` : ''} later`;
}

/** Type-specific cause, e.g. "full, submerged" for a road blockage. */
export function eventCause(rec: EventRecord): string {
  const e = rec.event;
  if (e.type === 'road_blockage') return [e.blockage, e.cause].filter(Boolean).join(', ');
  return '';
}

export function eventTypeLabel(type: FieldEventType): string {
  return EVENT_META[type].label;
}

export interface AuditFilter {
  type?: FieldEventType;
  status?: FeedStatus;
  /** Case-insensitive substring over settlement/feature ids the event names or affects. */
  location?: string;
  /** Inclusive bounds on receivedAt (ISO strings). */
  from?: string;
  to?: string;
}

export interface AuditRow {
  rec: EventRecord;
  status: FeedStatus;
  affected: Selection[];
}

/** Feature/settlement ids an event names itself (payload), for the location filter. */
export function eventLocationIds(rec: EventRecord): string[] {
  const e = rec.event;
  switch (e.type) {
    case 'road_blockage':
      return e.roadId ? [e.roadId] : [];
    case 'road_cleared':
      return [e.roadId];
    case 'flood_report':
      return e.areaId ? [e.areaId] : [];
    case 'household_registration':
      return [e.settlementId, e.shelterId].filter((x): x is string => !!x);
    case 'person_checkin':
      return [e.settlementId, e.campId, e.householdId].filter((x): x is string => !!x);
    case 'water_level':
      return e.gaugeId ? [e.gaugeId] : [];
  }
}

export function matchesFilter(row: AuditRow, filter: AuditFilter): boolean {
  const { rec } = row;
  if (filter.type && rec.event.type !== filter.type) return false;
  if (filter.status && row.status !== filter.status) return false;
  if (filter.location) {
    const q = filter.location.trim().toLowerCase();
    const ids = [...eventLocationIds(rec), ...row.affected.map((a) => a.id)];
    if (q && !ids.some((id) => id.toLowerCase().includes(q))) return false;
  }
  const t = Date.parse(rec.receivedAt);
  if (filter.from && t < Date.parse(filter.from)) return false;
  if (filter.to && t > Date.parse(filter.to)) return false;
  return true;
}

/** Newest first (by receivedAt), filtered. */
export function buildAuditRows(
  events: EventRecord[],
  snapshot: ProjectionSnapshot | undefined,
  filter: AuditFilter = {},
): AuditRow[] {
  const index = affectedIndex(snapshot);
  return [...events]
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .map((rec) => ({ rec, status: auditStatus(rec, snapshot?.version), affected: featuresAffectedBy(rec, index) }))
    .filter((r) => matchesFilter(r, filter));
}
