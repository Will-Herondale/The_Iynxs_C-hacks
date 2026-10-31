import type { Accessibility, PeopleSnapshot, ProjectionSnapshot, SettlementProps } from '@setu/contract';
import { ACCESS_RANK } from '../../panels/model';
import { coverage, settlementRouteState, COVERAGE_LABEL, type RouteCoverage } from '../routes/model';

export interface SettlementRow {
  id: string;
  synthetic?: boolean;
  name: string;
  accessibility: Accessibility;
  /** cutOffReason.blockingFeatureIds, as served. */
  criticalSegments: string[];
  deadline?: string;
  priority?: SettlementProps['evacuationPriority'];
  status: RouteCoverage;
  statusLabel: string;
  routeState: string;
  fieldCheckins?: number;
  fieldHouseholds?: number;
  fieldPeople?: number;
}

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2 } as const;
export const priorityRank = (p?: SettlementRow['priority']) => (p ? PRIORITY_RANK[p] : 3);
export const accessRank = (a: Accessibility) => ACCESS_RANK[a];

export function settlementRows(s: ProjectionSnapshot, people?: PeopleSnapshot): SettlementRow[] {
  return s.settlements.features.map((f) => {
    const p = f.properties;
    const c = coverage(s, p);
    const state = settlementRouteState(s, p);
    const fieldRecords = people?.checkins.filter((r) => r.settlementId === p.settlementId);
    return {
      id: p.settlementId,
      ...(p.synthetic ? { synthetic: true } : {}),
      name: p.name,
      accessibility: p.accessibility,
      criticalSegments: p.cutOffReason?.blockingFeatureIds ?? [],
      ...(p.evacuationDeadline ? { deadline: p.evacuationDeadline } : {}),
      ...(p.evacuationPriority ? { priority: p.evacuationPriority } : {}),
      status: c,
      statusLabel: state === 'calculated' ? 'Route calculated' : COVERAGE_LABEL[c],
      routeState: state,
      ...(fieldRecords ? {
        fieldCheckins: fieldRecords.length,
        fieldHouseholds: fieldRecords.filter((r) => r.kind === 'household').length,
        fieldPeople: fieldRecords.reduce((n, r) => n + r.members, 0),
      } : {}),
    };
  });
}

export function matches(row: SettlementRow, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return [row.id, row.name, row.accessibility, row.statusLabel, row.priority ?? '', String(row.fieldPeople ?? ''), String(row.fieldHouseholds ?? ''), ...row.criticalSegments].some((v) => v.toLowerCase().includes(n));
}
