import type { ProjectionSnapshot } from '@setu/contract';
import { formatClock } from './time';

/** Plain-language situation lines built ONLY from server fields (names, reasons, deadlines). No derivation. */
export interface SituationLine {
  key: string;
  text: string;
  kind: 'cutoff' | 'bridge' | 'road';
}
export interface Situation {
  lines: SituationLine[];
  /** Soonest evacuationDeadline among cut-off settlements (server field), if any. */
  soonest?: { settlementId: string; name: string; deadline: string };
  allClear: boolean;
}

const defaultFmt = formatClock;

export function buildSituation(snap: ProjectionSnapshot | undefined, fmt: (iso: string) => string = defaultFmt): Situation {
  if (!snap) return { lines: [], allClear: false };
  const roadById = new Map(snap.roads.features.map((f) => [f.properties.roadId, f.properties]));
  const lines: SituationLine[] = [];
  const explained = new Set<string>();
  const cut = snap.settlements.features.map((f) => f.properties).filter((p) => p.accessibility === 'cut_off');
  let soonest: Situation['soonest'];

  for (const s of cut) {
    const blockers = (s.cutOffReason?.blockingFeatureIds ?? []).map((id) => roadById.get(id)).filter((r) => !!r);
    blockers.forEach((r) => explained.add(r.roadId));
    const cause = blockers.length
      ? blockers.map((r) => `${r.name} (${r.roadId}) ${r.reason ?? (r.passability === 'impassable' ? 'impassable' : 'blocked')}`).join(' + ')
      : s.cutOffReason?.summary;
    const parts = [cause, `${s.name} cut off`];
    if (s.evacuationDeadline) parts.push(`evacuate by ${fmt(s.evacuationDeadline)}`);
    lines.push({ key: `cutoff-${s.settlementId}`, kind: 'cutoff', text: parts.filter(Boolean).join(' → ') });
    if (s.evacuationDeadline && (!soonest || s.evacuationDeadline < soonest.deadline))
      soonest = { settlementId: s.settlementId, name: s.name, deadline: s.evacuationDeadline };
  }
  for (const r of roadById.values()) {
    if (r.status !== 'blocked' || explained.has(r.roadId)) continue;
    const isBridge = r.kind === 'bridge';
    lines.push({
      key: `${isBridge ? 'bridge' : 'road'}-${r.roadId}`,
      kind: isBridge ? 'bridge' : 'road',
      text: `${isBridge ? 'Bridge' : 'Road'} ${r.name} (${r.roadId}) ${r.reason ?? 'blocked'}`,
    });
  }
  // Bridges first, then cut-off chains keep their order; stable sort on kind rank.
  const rank = { cutoff: 0, bridge: 1, road: 2 } as const;
  lines.sort((a, b) => rank[a.kind] - rank[b.kind]);
  return { lines, soonest, allClear: lines.length === 0 };
}
