import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import type { MapFeatureKind } from './layers';

export type LngLatBoundsTuple = [[number, number], [number, number]];

function extend(b: LngLatBoundsTuple | undefined, c: readonly number[]): LngLatBoundsTuple | undefined {
  const [x, y] = c;
  if (x === undefined || y === undefined) return b;
  if (!b) return [[x, y], [x, y]];
  return [[Math.min(b[0][0], x), Math.min(b[0][1], y)], [Math.max(b[1][0], x), Math.max(b[1][1], y)]];
}

function walk(b: LngLatBoundsTuple | undefined, coords: unknown): LngLatBoundsTuple | undefined {
  if (!Array.isArray(coords)) return b;
  if (typeof coords[0] === 'number') return extend(b, coords as number[]);
  for (const c of coords) b = walk(b, c);
  return b;
}

/**
 * Geographic extent of the selected feature as stated by the server snapshot / event list
 * (display placement only). Undefined when the id is unknown or has no geometry.
 */
export function selectionBounds(
  snapshot: ProjectionSnapshot | undefined,
  events: readonly EventRecord[],
  sel: { kind: MapFeatureKind; id: string } | undefined,
): LngLatBoundsTuple | undefined {
  if (!sel) return undefined;
  if (sel.kind === 'report') {
    const r = events.find((e) => e.eventId === sel.id);
    return r ? extend(undefined, [r.event.location.lng, r.event.location.lat]) : undefined;
  }
  if (!snapshot) return undefined;
  const find = <P, G extends { coordinates: unknown }>(fc: { features: { geometry: G; properties: P }[] }, pred: (p: P) => boolean) =>
    fc.features.find((f) => pred(f.properties))?.geometry.coordinates;
  switch (sel.kind) {
    case 'road': return walk(undefined, find(snapshot.roads, (p) => p.roadId === sel.id));
    case 'settlement': return walk(undefined, find(snapshot.settlements, (p) => p.settlementId === sel.id));
    case 'route': return walk(undefined, find(snapshot.routes, (p) => p.routeId === sel.id));
    case 'shelter': return walk(undefined, find(snapshot.shelters, (p) => p.shelterId === sel.id));
    case 'flood': return walk(undefined, find(snapshot.flood, (p) => p.areaId === sel.id));
  }
}
