import type { ProjectionSnapshot } from '@setu/contract';

type Bounds = [[number, number], [number, number]];
const COLLECTIONS = ['roads', 'settlements', 'routes', 'shelters'] as const;

function walk(c: unknown, visit: (lng: number, lat: number) => void): void {
  if (!Array.isArray(c)) return;
  if (typeof c[0] === 'number' && typeof c[1] === 'number') visit(c[0], c[1]);
  else for (const x of c) walk(x, visit);
}

/**
 * Bounding box of the features the backend flags `synthetic: true` (the demo scenario), or null when there are none.
 * Display only: it reads server-provided geometry and never changes real geographic data.
 */
export function syntheticBounds(snapshot: ProjectionSnapshot | undefined): Bounds | null {
  if (!snapshot) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const key of COLLECTIONS) {
    for (const f of snapshot[key].features) {
      if (!(f.properties as { synthetic?: boolean }).synthetic) continue;
      walk((f.geometry as { coordinates: unknown }).coordinates, (lng, lat) => {
        w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
      });
    }
  }
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}
