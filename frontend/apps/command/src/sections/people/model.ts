import type { CampPeopleSummary, PeopleCheckinRecord, PeopleSnapshot } from '@setu/contract';

/** Camps with any field check-in, plus the camp list order from the server. */
export function campsWithPeople(s: PeopleSnapshot | undefined): CampPeopleSummary[] {
  return (s?.camps ?? []).filter((c) => c.checkins > 0);
}

export function matchesCheckin(r: PeopleCheckinRecord, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return [r.displayName, r.campName ?? '', r.campId ?? '', r.personId, r.householdId ?? '', ...r.needs]
    .some((v) => v.toLowerCase().includes(n));
}

export function filterCheckins(s: PeopleSnapshot | undefined, q: string): PeopleCheckinRecord[] {
  return (s?.checkins ?? []).filter((r) => matchesCheckin(r, q));
}

export interface SplitHousehold {
  householdId: string;
  camps: string[];
  names: string[];
}

/**
 * Households whose registrations appear at more than one camp. This is a real
 * data condition, not a merge: the command centre decides what it means.
 */
export function splitHouseholds(s: PeopleSnapshot | undefined): SplitHousehold[] {
  const byHousehold = new Map<string, { camps: Set<string>; names: Set<string> }>();
  for (const r of s?.checkins ?? []) {
    if (!r.householdId) continue;
    const entry = byHousehold.get(r.householdId) ?? { camps: new Set<string>(), names: new Set<string>() };
    if (r.campId) entry.camps.add(r.campId);
    if (r.displayName) entry.names.add(r.displayName);
    byHousehold.set(r.householdId, entry);
  }
  const out: SplitHousehold[] = [];
  for (const [householdId, entry] of byHousehold) {
    if (entry.camps.size <= 1) continue;
    out.push({
      householdId,
      camps: [...entry.camps].sort(),
      names: [...entry.names].sort(),
    });
  }
  return out.sort((a, b) => a.householdId.localeCompare(b.householdId));
}

export const KIND_LABEL: Record<PeopleCheckinRecord['kind'], string> = {
  person: 'Person',
  household: 'Household',
};

export function needsLabel(needs: Record<string, number>): string {
  const entries = Object.entries(needs).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.length === 0 ? '-' : entries.map(([k, v]) => `${k} ×${v}`).join(', ');
}
