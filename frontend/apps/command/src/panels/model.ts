import type {
  Accessibility, FloodProps, ProjectionSnapshot, RoadProps, RoadStatusValue, RouteProps, RouteStatus, SettlementProps, ShelterProps,
} from '@setu/contract';
import type { BadgeTone } from '@setu/ui';
import type { FeatureKind } from '../app';

/** Display-only lookups/sorting over a server snapshot. Nothing here derives projection state. */

export const ROAD_RANK: Record<RoadStatusValue, number> = { blocked: 0, partial: 1, unknown: 2, open: 3 };
export const ACCESS_RANK: Record<Accessibility, number> = { cut_off: 0, limited: 1, accessible: 2 };
export const ROUTE_RANK: Record<RouteStatus, number> = { unavailable: 0, recalculated: 1, active: 2 };

export const ROAD_TONE: Record<RoadStatusValue, { tone: BadgeTone; icon: string }> = {
  blocked: { tone: 'danger', icon: '⛔' },
  partial: { tone: 'warning', icon: '⚠' },
  unknown: { tone: 'neutral', icon: '?' },
  open: { tone: 'success', icon: '✓' },
};
export const ACCESS_TONE: Record<Accessibility, { tone: BadgeTone; icon: string }> = {
  cut_off: { tone: 'danger', icon: '⛔' },
  limited: { tone: 'warning', icon: '⚠' },
  accessible: { tone: 'success', icon: '✓' },
};
export const ROUTE_TONE: Record<RouteStatus, { tone: BadgeTone; icon: string }> = {
  unavailable: { tone: 'danger', icon: '✕' },
  recalculated: { tone: 'info', icon: '↻' },
  active: { tone: 'success', icon: '✓' },
};

export const label = (s: string) => s.replace(/_/g, ' ');

function sorted<T>(items: T[], rank: (t: T) => number, name: (t: T) => string): T[] {
  return [...items].sort((a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b), undefined, { numeric: true }));
}

/** Blocked bridges first, then by status. */
export const roads = (s: ProjectionSnapshot): RoadProps[] =>
  sorted(
    s.roads.features.map((f) => f.properties),
    (p) => (p.status === 'blocked' && p.kind === 'bridge' ? -1 : ROAD_RANK[p.status]),
    (p) => p.roadId,
  );
export const settlements = (s: ProjectionSnapshot): SettlementProps[] =>
  sorted(s.settlements.features.map((f) => f.properties), (p) => ACCESS_RANK[p.accessibility], (p) => p.settlementId);
export const routes = (s: ProjectionSnapshot): RouteProps[] =>
  sorted(s.routes.features.map((f) => f.properties), (p) => ROUTE_RANK[p.status], (p) => p.routeId);
export const shelters = (s: ProjectionSnapshot): ShelterProps[] =>
  sorted(s.shelters.features.map((f) => f.properties), (p) => (p.open ? 1 : 0), (p) => p.shelterId);

export type AnyProps = RoadProps | SettlementProps | RouteProps | ShelterProps | FloodProps;

export function findFeature(s: ProjectionSnapshot, kind: FeatureKind, id: string): AnyProps | undefined {
  switch (kind) {
    case 'road': return s.roads.features.find((f) => f.properties.roadId === id)?.properties;
    case 'settlement': return s.settlements.features.find((f) => f.properties.settlementId === id)?.properties;
    case 'route': return s.routes.features.find((f) => f.properties.routeId === id)?.properties;
    case 'shelter': return s.shelters.features.find((f) => f.properties.shelterId === id)?.properties;
    case 'flood': return s.flood.features.find((f) => f.properties.areaId === id)?.properties;
  }
}

/** Settlements that carry a server-provided evacuationDeadline, soonest first. */
export function evacDeadlines(s: ProjectionSnapshot): SettlementProps[] {
  return s.settlements.features
    .map((f) => f.properties)
    .filter((p) => p.evacuationDeadline !== undefined)
    .sort((a, b) => Date.parse(a.evacuationDeadline!) - Date.parse(b.evacuationDeadline!) || a.settlementId.localeCompare(b.settlementId, undefined, { numeric: true }));
}

/** Which kind of feature an id refers to in the snapshot (display lookup only). */
export function featureKindOf(s: ProjectionSnapshot, id: string): FeatureKind | undefined {
  if (s.roads.features.some((f) => f.properties.roadId === id)) return 'road';
  if (s.settlements.features.some((f) => f.properties.settlementId === id)) return 'settlement';
  if (s.routes.features.some((f) => f.properties.routeId === id)) return 'route';
  if (s.shelters.features.some((f) => f.properties.shelterId === id)) return 'shelter';
  if (s.flood.features.some((f) => f.properties.areaId === id)) return 'flood';
  return undefined;
}

export const isBridge = (r: RoadProps) => r.kind === 'bridge';
