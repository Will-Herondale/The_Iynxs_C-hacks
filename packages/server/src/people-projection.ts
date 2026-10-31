// People projection for the Command "Camps & People" view.
//
// The fold in core (projectPeople) is the entity-resolution engine. This module
// adapts its output to the question the command centre actually asks:
// "who is registered where, and which registrations might be the same person?"
//
// It deliberately stays OUTSIDE ProjectionSnapshot so the frozen map-layer
// contract (flood/roads/settlements/routes/shelters) does not change shape.
// The snapshot is exposed at GET /api/v1/people instead.

import {
  type Envelope,
  type MatchProposal,
  projectPeople,
  totalOrder,
} from '../../core/src/index';

export type PeopleKind = 'person' | 'household';

export interface CampPeopleSummary {
  campId: string;
  name: string;
  open: boolean;
  capacity: number;
  /** Shelter-reported occupancy; separate from field check-ins. */
  occupancy: number;
  synthetic?: boolean;
  /** Number of check-in events recorded at this camp. */
  checkins: number;
  /** Number of household registrations at this camp. */
  households: number;
  /**
   * People counted from field check-ins: each household registration counts its
   * reported member count, each individual check-in counts one person.
   */
  people: number;
  needs: Record<string, number>;
  lastCheckinAt: string | null;
}

export interface PeopleCheckinRecord {
  eventId: string;
  clientEventId: string | null;
  kind: PeopleKind;
  personId: string;
  /** Canonical personId this record was merged into (set when auto-merged). */
  mergedInto: string | null;
  displayName: string;
  campId: string | null;
  campName: string | null;
  settlementId: string | null;
  householdId: string | null;
  members: number;
  ageBand: string | null;
  sex: string | null;
  needs: string[];
  vulnerable: Record<string, boolean> | null;
  occurredAt: string;
  reporterId: string;
}

export interface DuplicateSuggestionParty {
  personId: string;
  name: string;
  campId: string | null;
  campName: string | null;
  kind: PeopleKind;
}

export interface DuplicateSuggestion {
  proposalId: string;
  scoreBp: number;
  a: DuplicateSuggestionParty;
  b: DuplicateSuggestionParty;
}

export interface PeopleSnapshot {
  version: number;
  generatedAt: string;
  totals: {
    checkins: number;
    individuals: number;
    households: number;
    campsWithCheckins: number;
  };
  camps: CampPeopleSummary[];
  /** Newest first. */
  checkins: PeopleCheckinRecord[];
  /** Unaccepted match proposals between individual check-ins. */
  duplicateSuggestions: DuplicateSuggestion[];
  /** Number of records auto-merged into a canonical record (high-confidence matches). */
  autoMergedCount: number;
}

type Campaign = {
  shelterId: string;
  name: string;
  capacity: number;
  occupancy: number;
  open: boolean;
  synthetic?: boolean;
};

function firstText(names: unknown): string {
  if (!Array.isArray(names)) return '';
  for (const n of names) {
    if (n && typeof n === 'object' && typeof (n as { text?: unknown }).text === 'string') {
      return (n as { text: string }).text;
    }
  }
  return '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

export function readRegistrationKind(payload: Record<string, unknown>): PeopleKind | null {
  const kind = payload.kind;
  if (kind === 'person' || kind === 'household') return kind;
  // Events written before the discriminator existed are household
  // registrations: that was the only person.register producer.
  if (kind === undefined) return 'household';
  return null;
}

function asRecord(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * Build the people snapshot from the same ordered event history the map fold
 * uses. Pure: same inputs → same output.
 */
export function buildPeopleSnapshot(
  events: Envelope[],
  camps: Campaign[],
  version: number,
  asOf: number,
): PeopleSnapshot {
  const ordered = [...events].sort(totalOrder);
  const campById = new Map(camps.map((c) => [c.shelterId, c]));

  const summaries = new Map<string, CampPeopleSummary>();
  for (const camp of camps) {
    summaries.set(camp.shelterId, {
      campId: camp.shelterId,
      name: camp.name,
      open: camp.open,
      capacity: camp.capacity,
      occupancy: camp.occupancy,
      ...(camp.synthetic ? { synthetic: true } : {}),
      checkins: 0,
      households: 0,
      people: 0,
      needs: {},
      lastCheckinAt: null,
    });
  }

  const checkins: PeopleCheckinRecord[] = [];
  const byPersonId = new Map<
    string,
    { kind: PeopleKind; name: string; campId: string | null; campName: string | null }
  >();

  for (const env of ordered) {
    if (env.type !== 'person.register') continue;
    const p = env.payload as Record<string, unknown>;
    const kind = readRegistrationKind(p);
    if (!kind) continue;

    const campId = typeof p.camp_id === 'string' && p.camp_id.length > 0 ? p.camp_id : null;
    const camp = campId ? campById.get(campId) : undefined;
    const campName = camp?.name ?? campId;
    const personId = typeof p.person_id === 'string' ? p.person_id : env.id;
    const displayName = firstText(p.names);
    const isHousehold = kind === 'household';
    const membersRaw = typeof p.members === 'number' ? p.members : 1;
    const members = Number.isFinite(membersRaw) ? Math.max(1, Math.round(membersRaw)) : 1;
    const count = isHousehold ? members : 1;
    const needs = stringArray(p.needs);

    const record: PeopleCheckinRecord = {
      eventId: env.id,
      clientEventId:
        typeof p.client_event_id === 'string' ? p.client_event_id : null,
      kind,
      personId,
      mergedInto: null,
      displayName,
      campId,
      campName,
      settlementId:
        typeof p.village_id === 'string' && p.village_id.length > 0 ? p.village_id : null,
      householdId:
        typeof p.household_id === 'string' && p.household_id.length > 0
          ? p.household_id
          : null,
      members: isHousehold ? members : 1,
      ageBand: typeof p.age_band === 'string' ? p.age_band : null,
      sex: typeof p.sex === 'string' ? p.sex : null,
      needs,
      vulnerable: asRecord(p.vulnerable),
      occurredAt: new Date(env.at).toISOString(),
      reporterId: env.actor.id,
    };
    checkins.push(record);

    if (!byPersonId.has(personId)) {
      byPersonId.set(personId, { kind, name: displayName, campId, campName });
    }

    const key = campId ?? '__unassigned__';
    let summary = summaries.get(key);
    if (!summary) {
      summary = {
        campId: key,
        name: campId ?? 'No camp recorded',
        open: false,
        capacity: 0,
        occupancy: 0,
        checkins: 0,
        households: 0,
        people: 0,
        needs: {},
        lastCheckinAt: null,
      };
      summaries.set(key, summary);
    }
    summary.checkins++;
    if (isHousehold) summary.households++;
    summary.people += count;
    for (const need of needs) {
      summary.needs[need] = (summary.needs[need] ?? 0) + 1;
    }
    const occurredAt = record.occurredAt;
    if (!summary.lastCheckinAt || occurredAt > summary.lastCheckinAt) {
      summary.lastCheckinAt = occurredAt;
    }
  }

  checkins.sort(
    (a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.eventId.localeCompare(b.eventId),
  );

  const allProposals: MatchProposal[] = projectPeople(ordered, asOf).proposals;

  // Auto-accept high-confidence matches (>= 85% = 8500 bp). Lower-confidence
  // matches stay as duplicate suggestions for a human to decide.
  const AUTO_ACCEPT_THRESHOLD_BP = 8500;
  const acceptedProposalIds = new Set<string>();
  for (const proposal of allProposals) {
    if (proposal.decidedBy === 'accepted') acceptedProposalIds.add(proposal.proposalId);
    else if (proposal.scoreBp >= AUTO_ACCEPT_THRESHOLD_BP) {
      acceptedProposalIds.add(proposal.proposalId);
    }
  }

  // Union-find over personIds to build merge clusters from accepted matches.
  const personById = new Map(
    [...byPersonId.entries()].filter(([, info]) => info.kind === 'person'),
  );
  const parent = new Map<string, string>();
  for (const personId of personById.keys()) parent.set(personId, personId);
  function find(x: string): string {
    let p = parent.get(x)!;
    while (p !== x) {
      parent.set(x, parent.get(p)!);
      x = p;
      p = parent.get(x)!;
    }
    return x;
  }
  function union(x: string, y: string): void {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx > ry ? rx : ry, rx < ry ? rx : ry);
  }
  for (const proposal of allProposals) {
    if (acceptedProposalIds.has(proposal.proposalId)) {
      union(proposal.a, proposal.b);
    }
  }

  // Annotate each check-in with its canonical personId (mergedInto when not
  // the cluster root).
  for (const record of checkins) {
    if (record.kind === 'person' && personById.has(record.personId)) {
      const root = find(record.personId);
      record.mergedInto = root === record.personId ? null : root;
    } else {
      record.mergedInto = null;
    }
  }

  const duplicateSuggestions: DuplicateSuggestion[] = [];
  for (const proposal of allProposals) {
    if (acceptedProposalIds.has(proposal.proposalId)) continue; // already merged
    const a = byPersonId.get(proposal.a);
    const b = byPersonId.get(proposal.b);
    // Households are declared groups, not accidental duplicates. Only propose
    // matches between individual check-ins.
    if (!a || !b || a.kind !== 'person' || b.kind !== 'person') continue;
    duplicateSuggestions.push({
      proposalId: proposal.proposalId,
      scoreBp: proposal.scoreBp,
      a: { personId: proposal.a, ...a },
      b: { personId: proposal.b, ...b },
    });
  }
  duplicateSuggestions.sort(
    (x, y) => y.scoreBp - x.scoreBp || x.proposalId.localeCompare(y.proposalId),
  );

  const campList = [...summaries.values()]
    .filter((c) => c.campId !== '__unassigned__')
    .sort((a, b) => a.name.localeCompare(b.name) || a.campId.localeCompare(b.campId));
  const unassigned = summaries.get('__unassigned__');
  if (unassigned) campList.push(unassigned);

  const individuals = new Set<string>();
  for (const c of checkins) {
    if (c.kind === 'person') {
      individuals.add(c.mergedInto ?? c.personId);
    }
  }
  const autoMergedCount = checkins.reduce(
    (sum, c) => sum + (c.kind === 'person' && c.mergedInto !== null ? 1 : 0),
    0,
  );
  const households = checkins.reduce(
    (sum, c) => sum + (c.kind === 'household' ? 1 : 0),
    0,
  );

  return {
    version,
    generatedAt: new Date(asOf).toISOString(),
    totals: {
      checkins: checkins.length,
      individuals: individuals.size,
      households,
      campsWithCheckins: campList.filter((c) => c.checkins > 0).length,
    },
    camps: campList,
    checkins,
    duplicateSuggestions,
    autoMergedCount,
  };
}
