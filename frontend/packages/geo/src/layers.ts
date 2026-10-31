import type { GeoFeatureCollection, GeoLayerName, OptionalGeoLayerName } from './types.js';

// Bundled-asset strategy: `new URL('../data/x.geojson', import.meta.url)` + fetch.
//  - Vite apps: each literal below is emitted as a hashed static asset (lazy fetch, not inlined in JS).
//  - Field PWA: the same URLs can be added to the service-worker precache (see GEO_LAYER_URLS()).
//  - Node/vitest (file: URLs): read from disk, since Node's fetch rejects file:.
// The literals must stay `new URL('<literal>', import.meta.url)` so bundlers can statically analyse them.
const URLS: Record<GeoLayerName | OptionalGeoLayerName, () => URL> = {
  island: () => new URL('../data/island.geojson', import.meta.url),
  waterbodies: () => new URL('../data/waterbodies.geojson', import.meta.url),
  waterways: () => new URL('../data/waterways.geojson', import.meta.url),
  roads: () => new URL('../data/roads.geojson', import.meta.url),
  bridges: () => new URL('../data/bridges.geojson', import.meta.url),
  places: () => new URL('../data/places.geojson', import.meta.url),
  shelters: () => new URL('../data/shelters.geojson', import.meta.url),
  ferries: () => new URL('../data/ferries.geojson', import.meta.url),
  'roads-minor': () => new URL('../data/roads-minor.geojson', import.meta.url),
};

export const GEO_LAYER_NAMES = ['island', 'waterbodies', 'waterways', 'roads', 'bridges', 'places', 'shelters', 'ferries'] as const satisfies readonly GeoLayerName[];

/** Resolved asset URLs, for service-worker precache lists. */
export function geoLayerUrls(opts?: { includeOptional?: boolean }): string[] {
  const names: (GeoLayerName | OptionalGeoLayerName)[] = [...GEO_LAYER_NAMES, ...(opts?.includeOptional ? (['roads-minor'] as const) : [])];
  return names.map((n) => URLS[n]().href);
}

const cache = new Map<string, Promise<GeoFeatureCollection>>();

async function read(url: URL): Promise<GeoFeatureCollection> {
  if (url.protocol === 'file:') {
    const spec = 'node:fs/promises';
    const { readFile } = (await import(/* @vite-ignore */ spec)) as typeof import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8')) as GeoFeatureCollection;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geo layer fetch failed: ${url.pathname} (${res.status})`);
  return (await res.json()) as GeoFeatureCollection;
}

type Position = number[];
type Ring = Position[];

const validRing = (r: unknown): r is Ring => Array.isArray(r) && r.length >= 4;

/** A polygon is kept when its outer ring is valid; invalid holes are dropped. */
function cleanPolygon(p: unknown): Ring[] | undefined {
  if (!Array.isArray(p) || !validRing(p[0])) return undefined;
  return (p as unknown[]).filter(validRing);
}

/**
 * Drop empty polygons and rings with fewer than 4 positions. Simplifying a source can leave them behind,
 * and MapLibre's GeoJSON tiler throws on them ("Cannot read properties of undefined (reading 'points')").
 * No coordinate is ever changed; only degenerate parts are left out.
 */
export function sanitizeCollection(fc: GeoFeatureCollection): GeoFeatureCollection {
  type Feature = GeoFeatureCollection['features'][number];
  const features = fc.features.flatMap((f): Feature[] => {
    const g = f.geometry as { type: string; coordinates?: unknown } | null;
    if (!g) return [];
    if (g.type === 'Polygon') {
      const poly = cleanPolygon(g.coordinates);
      return poly ? [{ ...f, geometry: { ...g, coordinates: poly } } as Feature] : [];
    }
    if (g.type === 'MultiPolygon') {
      const polys = (Array.isArray(g.coordinates) ? g.coordinates : []).map(cleanPolygon).filter((p): p is Ring[] => !!p);
      return polys.length ? [{ ...f, geometry: { ...g, coordinates: polys } } as Feature] : [];
    }
    return [f];
  });
  return { ...fc, features };
}

/** Load a bundled GeoJSON layer. Works offline; results are cached per page. */
export function loadGeoLayer(name: GeoLayerName | OptionalGeoLayerName): Promise<GeoFeatureCollection> {
  const make = URLS[name];
  if (!make) return Promise.reject(new Error(`unknown geo layer: ${String(name)}`));
  let p = cache.get(name);
  if (!p) {
    p = read(make()).then(sanitizeCollection);
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}
