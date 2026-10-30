import type { Accessibility, ProjectionSnapshot, SettlementProps } from '@setu/contract';
import { ACCESS_RANK } from '../../panels/model';
import { coverage, settlementRouteState, COVERAGE_LABEL, type RouteCoverage } from '../routes/model';

export interface SettlementRow {
  id: string;
  name: string;
  accessibility: Accessibility;
  /** cutOffReason.blockingFeatureIds, as served. */
  criticalSegments: string[];
  deadline?: string;
  priority?: SettlementProps['evacuationPriority'];
  status: RouteCoverage;
  statusLabel: string;
  routeState: string;
}

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2 } as const;
export const priorityRank = (p?: SettlementRow['priority']) => (p ? PRIORITY_RANK[p] : 3);
export const accessRank = (a: Accessibility) => ACCESS_RANK[a];

export function settlementRows(s: ProjectionSnapshot): SettlementRow[] {
  return s.settlements.features.map((f) => {
    const p = f.properties;
    const c = coverage(s, p);
    return {
      id: p.settlementId,
      name: p.name,
      accessibility: p.accessibility,
      criticalSegments: p.cutOffReason?.blockingFeatureIds ?? [],
      ...(p.evacuationDeadline ? { deadline: p.evacuationDeadline } : {}),
      ...(p.evacuationPriority ? { priority: p.evacuationPriority } : {}),
      status: c,
      statusLabel: COVERAGE_LABEL[c],
      routeState: settlementRouteState(s, p),
    };
  });
}

export function matches(row: SettlementRow, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return [row.id, row.name, row.accessibility, row.statusLabel, row.priority ?? '', ...row.criticalSegments].some((v) => v.toLowerCase().includes(n));
}
