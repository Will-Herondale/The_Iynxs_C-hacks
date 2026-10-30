import type { ProjectionSnapshot } from '@setu/contract';

export interface RoadOption { id: string; label: string; kind: 'road' | 'bridge' }

/** Seed fallback used when no cached snapshot exists (first launch offline). */
export const FALLBACK_ROADS: RoadOption[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `R${i + 1}`, label: `R${i + 1}`, kind: 'road' as const })),
  { id: 'B1', label: 'Bridge: B1', kind: 'bridge' },
];

/** Roads and bridges from the cached snapshot (bridges labelled "Bridge: <name>"); seed ids otherwise. */
export function roadOptions(snapshot?: ProjectionSnapshot | null): RoadOption[] {
  const features = snapshot?.roads?.features;
  if (!features || features.length === 0) return FALLBACK_ROADS;
  return features.map((f) => {
    const p = f.properties;
    const bridge = p.kind === 'bridge';
    return {
      id: p.roadId,
      kind: bridge ? 'bridge' : 'road',
      label: bridge ? `Bridge: ${p.name} (${p.roadId})` : `${p.roadId} — ${p.name}`,
    } as RoadOption;
  });
}

/** Restricts the list to roads or bridges; undefined keeps everything. */
export function filterRoadOptions(options: RoadOption[], kind?: 'road' | 'bridge'): RoadOption[] {
  return kind ? options.filter((o) => o.kind === kind) : options;
}

/** Bridges from the bundled `@setu/geo` bridges layer (osm_id as id); merged after the snapshot's own list. */
export function geoBridgeOptions(fc: { features: { properties?: Record<string, unknown> | null }[] } | undefined): RoadOption[] {
  return (fc?.features ?? []).flatMap((f) => {
    const p = f.properties ?? {};
    if (p.osm_id === undefined || p.osm_id === null) return [];
    const id = String(p.osm_id);
    const name = typeof p.name === 'string' && p.name ? p.name : 'unnamed';
    return [{ id, kind: 'bridge' as const, label: `Bridge: ${name} (${id})` }];
  });
}

/** Adds geo bridges whose id is not already listed. */
export function withGeoBridges(options: RoadOption[], bridges: RoadOption[]): RoadOption[] {
  const have = new Set(options.map((o) => o.id));
  return [...options, ...bridges.filter((b) => !have.has(b.id))];
}
