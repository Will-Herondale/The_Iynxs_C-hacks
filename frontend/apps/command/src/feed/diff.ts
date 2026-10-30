import type { ProjectionSnapshot } from '@setu/contract';
import type { FeatureKind } from '../app';

export interface SnapshotChange {
  kind: FeatureKind;
  id: string;
  text: string;
}

function index<P>(fc: { features: { properties: P }[] }, key: (p: P) => string): Map<string, P> {
  return new Map(fc.features.map((f) => [key(f.properties), f.properties]));
}

/**
 * Display-only diff of two SERVER snapshots. It reports what the server changed;
 * it never derives projection state.
 */
export function diffSnapshots(prev: ProjectionSnapshot, next: ProjectionSnapshot): SnapshotChange[] {
  const out: SnapshotChange[] = [];

  const roads = index(prev.roads, (p) => p.roadId);
  for (const f of next.roads.features) {
    const p = f.properties;
    const before = roads.get(p.roadId);
    if (before && before.status !== p.status) out.push({ kind: 'road', id: p.roadId, text: `${p.roadId} → ${p.status}` });
  }

  const setts = index(prev.settlements, (p) => p.settlementId);
  for (const f of next.settlements.features) {
    const p = f.properties;
    const before = setts.get(p.settlementId);
    if (before && before.accessibility !== p.accessibility)
      out.push({ kind: 'settlement', id: p.settlementId, text: `${p.settlementId} → ${p.accessibility}` });
  }

  const routes = index(prev.routes, (p) => p.routeId);
  for (const f of next.routes.features) {
    const p = f.properties;
    const before = routes.get(p.routeId);
    if (!before) {
      out.push({
        kind: 'route',
        id: p.routeId,
        text: p.status === 'recalculated' ? `${p.routeId} recalculated` : `${p.routeId} added (${p.status})`,
      });
    } else if (before.status !== p.status) {
      out.push({ kind: 'route', id: p.routeId, text: `${p.routeId} → ${p.status}` });
    }
  }

  const shelters = index(prev.shelters, (p) => p.shelterId);
  for (const f of next.shelters.features) {
    const p = f.properties;
    const before = shelters.get(p.shelterId);
    if (before && before.open !== p.open)
      out.push({ kind: 'shelter', id: p.shelterId, text: `${p.shelterId} → ${p.open ? 'open' : 'closed'}` });
  }

  const flood = index(prev.flood, (p) => p.areaId);
  for (const f of next.flood.features) {
    const p = f.properties;
    const before = flood.get(p.areaId);
    if (!before) out.push({ kind: 'flood', id: p.areaId, text: `${p.areaId} flooded (severity ${p.severity})` });
    else if (before.severity !== p.severity)
      out.push({ kind: 'flood', id: p.areaId, text: `${p.areaId} severity ${before.severity} → ${p.severity}` });
  }

  return out;
}
