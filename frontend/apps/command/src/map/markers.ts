import type { ProjectionSnapshot } from '@setu/contract';
import type { Selection } from '../app';
import type { ToggleId } from './layers';

export type MarkerKind = 'bridge' | 'settlement' | 'shelter';
export interface MarkerSpec {
  key: string;
  kind: MarkerKind;
  featureKind: Selection['kind'];
  featureId: string;
  lng: number;
  lat: number;
  label: string;
  /** Bridges only: true -> big red cross. */
  impassable: boolean;
  passability?: string;
  cutOff: boolean;
  /** Layer toggle that shows/hides this marker. */
  toggle: ToggleId;
}

/** Display anchor for a line: its middle vertex (placement only, nothing is computed from it). */
function lineAnchor(coords: number[][]): [number, number] | undefined {
  const c = coords[Math.floor(coords.length / 2)];
  const [lng, lat] = c ?? [];
  return lng === undefined || lat === undefined ? undefined : [lng, lat];
}

/**
 * Labels and symbols drawn as HTML markers (no glyph server needed, so they work offline).
 * Bridges, cut-off settlements and shelters are labelled; everything is read from the snapshot.
 */
export function buildMarkers(s: ProjectionSnapshot): MarkerSpec[] {
  const out: MarkerSpec[] = [];
  for (const f of s.roads.features) {
    if (f.properties.kind !== 'bridge') continue;
    const at = lineAnchor(f.geometry.coordinates);
    if (!at) continue;
    const p = f.properties;
    const impassable = p.passability === 'impassable' || p.status === 'blocked';
    // Only bridges needing attention get a label; healthy bridges are drawn by the road layer.
    if (!impassable && p.passability !== 'limited' && p.status !== 'partial') continue;
    out.push({
      key: `bridge-${p.roadId}`, kind: 'bridge', featureKind: 'road', featureId: p.roadId,
      lng: at[0], lat: at[1], label: `${p.name} (${p.roadId}) — ${impassable ? 'IMPASSABLE' : 'LIMITED'}`,
      impassable,
      passability: p.passability, cutOff: false, toggle: 'blocked',
    });
  }
  for (const f of s.settlements.features) {
    const p = f.properties;
    if (p.accessibility !== 'cut_off') continue;
    const [lng, lat] = f.geometry.coordinates;
    out.push({
      key: `settlement-${p.settlementId}`, kind: 'settlement', featureKind: 'settlement', featureId: p.settlementId,
      lng, lat, label: `${p.name} — CUT OFF`, impassable: false, cutOff: true, toggle: 'cutoff',
    });
  }
  for (const f of s.shelters.features) {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    out.push({
      key: `shelter-${p.shelterId}`, kind: 'shelter', featureKind: 'shelter', featureId: p.shelterId,
      lng, lat, label: p.capacity > 0 ? `${p.name} ${p.occupancy}/${p.capacity}` : p.name, impassable: false, cutOff: false, toggle: 'shelters',
    });
  }
  return out;
}

/**
 * Ids of the features blocking the selected settlement/route, as stated by the server
 * (cutOffReason / refusal). Returns [] when the selection has no explanation.
 */
export function blockingIds(s: ProjectionSnapshot | undefined, sel: Selection | undefined): string[] {
  if (!s || !sel) return [];
  if (sel.kind === 'settlement') {
    return s.settlements.features.find((f) => f.properties.settlementId === sel.id)?.properties.cutOffReason?.blockingFeatureIds ?? [];
  }
  if (sel.kind === 'route') {
    return s.routes.features.find((f) => f.properties.routeId === sel.id)?.properties.refusal?.blockingFeatureIds ?? [];
  }
  return [];
}

/** Which layer group a blocking feature id belongs to (looked up in the snapshot). */
export function blockingByGroup(s: ProjectionSnapshot | undefined, ids: string[]): { roads: string[]; flood: string[] } {
  if (!s) return { roads: [], flood: [] };
  const roads = new Set(s.roads.features.map((f) => f.properties.roadId));
  const flood = new Set(s.flood.features.map((f) => f.properties.areaId));
  return { roads: ids.filter((i) => roads.has(i)), flood: ids.filter((i) => flood.has(i)) };
}
