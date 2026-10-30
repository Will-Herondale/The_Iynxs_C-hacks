import type { ProjectionSnapshot, RouteProps, SettlementProps } from '@setu/contract';
import { ROUTE_RANK } from '../../panels/model';
import type { RouteState } from '@setu/geo';
import { routeState } from '@setu/geo';

/** Display grouping over server routes. No routing is computed; "no safe route" is read from server statuses. */

export interface RouteFilter {
  origin?: string;
  destination?: string;
}

export function allRoutes(s: ProjectionSnapshot): RouteProps[] {
  return s.routes.features.map((f) => f.properties);
}

export function filterRoutes(routes: RouteProps[], f: RouteFilter): RouteProps[] {
  return routes
    .filter((r) => (!f.origin || r.from === f.origin) && (!f.destination || r.to === f.destination))
    .sort((a, b) => ROUTE_RANK[a.status] - ROUTE_RANK[b.status] || a.routeId.localeCompare(b.routeId, undefined, { numeric: true }));
}

export const routesFrom = (s: ProjectionSnapshot, settlementId: string): RouteProps[] =>
  allRoutes(s).filter((r) => r.from === settlementId && r.kind === 'evacuation');

/**
 * True when the settlement has evacuation routes and every one is `unavailable`. A settlement with
 * no routes at all is "no route data", not "no safe route".
 */
export function hasNoSafeRoute(s: ProjectionSnapshot, p: SettlementProps): boolean {
  const rs = routesFrom(s, p.settlementId);
  return rs.length > 0 && rs.every((r) => r.status === 'unavailable');
}

export type RouteCoverage = 'no-safe-route' | 'rerouted' | 'route-available' | 'no-route-listed';
export function coverage(s: ProjectionSnapshot, p: SettlementProps): RouteCoverage {
  if (hasNoSafeRoute(s, p)) return 'no-safe-route';
  const rs = routesFrom(s, p.settlementId);
  if (rs.length === 0) return 'no-route-listed';
  return rs.some((r) => r.status === 'recalculated') ? 'rerouted' : 'route-available';
}

export const COVERAGE_LABEL: Record<RouteCoverage, string> = {
  'no-safe-route': 'No safe route',
  rerouted: 'Rerouted · not verified',
  'route-available': 'Route not verified',
  'no-route-listed': 'No route data',
};

/** Settlement-level route state from the shared rules (never `calculated`). */
export function settlementRouteState(s: ProjectionSnapshot, p: SettlementProps): RouteState {
  const rs = routesFrom(s, p.settlementId);
  return routeState(undefined, { settlementRoutes: rs });
}
