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
