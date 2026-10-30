import type { ClientSyncStatus, HouseholdRegistration, ProjectionSnapshot } from '@setu/contract';
import type { QueueItem } from '../../sync/index.js';

export type HouseholdQueueItem = QueueItem & { event: HouseholdRegistration };

export interface HouseholdRecord {
  householdId: string;
  /** Newest registration event for this household (the one shown in lists). */
  current: HouseholdQueueItem;
  /** Every local queue item for this household, newest first. */
  history: HouseholdQueueItem[];
}

export const isHouseholdItem = (i: QueueItem): i is HouseholdQueueItem => i.event.type === 'household_registration';

/** Groups locally known registrations by `householdId`; newest first. Never merges different householdIds. */
export function householdsFromQueue(items: QueueItem[]): HouseholdRecord[] {
  const byId = new Map<string, HouseholdQueueItem[]>();
  for (const i of items) {
    if (!isHouseholdItem(i)) continue;
    const list = byId.get(i.event.householdId) ?? [];
    list.push(i);
    byId.set(i.event.householdId, list);
  }
  return [...byId.entries()]
    .map(([householdId, list]) => {
      const history = [...list].sort((a, b) => b.createdAt - a.createdAt);
      return { householdId, current: history[0]!, history };
    })
    .sort((a, b) => b.current.createdAt - a.current.createdAt);
}

export interface NameLookup {
  settlement: (id?: string) => string | undefined;
  shelter: (id?: string) => string | undefined;
}

export function nameLookup(snapshot?: ProjectionSnapshot): NameLookup {
  const settlements = new Map(snapshot?.settlements.features.map((f) => [f.properties.settlementId, f.properties.name]) ?? []);
  const shelters = new Map(snapshot?.shelters.features.map((f) => [f.properties.shelterId, f.properties.name]) ?? []);
  return { settlement: (id) => (id ? settlements.get(id) : undefined), shelter: (id) => (id ? shelters.get(id) : undefined) };
}

/** Case-insensitive substring search over head name, village (name or id) and camp (name or id). */
export function searchHouseholds(records: HouseholdRecord[], query: string, names: NameLookup): HouseholdRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  return records.filter(({ current: { event: e } }) =>
    [e.headName, e.settlementId, names.settlement(e.settlementId), e.shelterId, names.shelter(e.shelterId)]
      .filter((s): s is string => !!s)
      .some((s) => s.toLowerCase().includes(q)),
  );
}

export interface CampSummary {
  households: number;
  people: number;
  /** Not yet confirmed by the server: saved locally, waiting, synchronising, failed. */
  pending: number;
  /** Conflict: requires review. */
  awaitingReview: number;
  rejected: number;
}

const PENDING: ClientSyncStatus[] = ['queued', 'sending', 'accepted', 'failed'];

/** Summary of households registered from this device. `shelterId` undefined = all camps. */
export function campSummary(records: HouseholdRecord[], shelterId?: string): CampSummary {
  const rows = records.filter((r) => (shelterId === undefined ? true : r.current.event.shelterId === shelterId));
  return {
    households: rows.length,
    people: rows.reduce((n, r) => n + r.current.event.members, 0),
    pending: rows.filter((r) => PENDING.includes(r.current.status)).length,
    awaitingReview: rows.filter((r) => r.current.status === 'conflict').length,
    rejected: rows.filter((r) => r.current.status === 'rejected').length,
  };
}

/** Event note written by `resolveConflict('keep-mine')` / edit-resubmit references the replaced id. */
export function supersededId(note?: string): string | undefined {
  return note?.match(/supersedes ([0-9a-f-]{36})/i)?.[1];
}

export function vulnerableList(e: HouseholdRegistration): string[] {
  return (Object.keys(e.vulnerable) as (keyof HouseholdRegistration['vulnerable'])[]).filter((k) => e.vulnerable[k]);
}
