/** Tiny geometry helpers for scripted lookups (nearest road, point-in-polygon). Not a routing engine. */
export type Pos = [number, number]; // [lng, lat]
type P = readonly number[];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: P, b: P): number {
  const dLat = rad(b[1]! - a[1]!);
  const dLng = rad(b[0]! - a[0]!);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1]!)) * Math.cos(rad(b[1]!)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance in metres from point p to segment ab, using a local equirectangular projection. */
function distToSegmentM(p: P, a: P, b: P): number {
  const k = Math.cos(rad(p[1]!));
  const proj = (q: P): [number, number] => [rad(q[0]! - p[0]!) * k * R, rad(q[1]! - p[1]!) * R];
  const [ax, ay] = proj(a);
  const [bx, by] = proj(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function distToLineM(p: P, line: readonly P[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, distToSegmentM(p, line[i]!, line[i + 1]!));
  return best;
}

/** Ray-casting point-in-polygon on the outer ring. */
export function pointInPolygon(p: P, rings: readonly (readonly P[])[]): boolean {
  const ring = rings[0];
  if (!ring) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > p[1]! !== yj! > p[1]! && p[0]! < ((xj! - xi!) * (p[1]! - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}
