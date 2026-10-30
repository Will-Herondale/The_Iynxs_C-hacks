import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import { shelterCounts, shelterStatus } from './honesty.js';
import type { FloodProps, ProjectionSnapshot, RoadProps, SettlementProps } from '@setu/contract';

/** Source ids/layers are namespaced so they never clash with @setu/geo base layers. */
export const PROJ = {
  floodSrc: 'setu-proj-flood',
  roadsSrc: 'setu-proj-roads',
  floodFill: 'setu-proj-flood-fill',
  floodLine: 'setu-proj-flood-line',
  floodLineModelled: 'setu-proj-flood-line-modelled',
  roadLine: 'setu-proj-road-line',
  roadLinePartial: 'setu-proj-road-line-partial',
} as const;

export const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export function floodLabel(p: FloodProps): string {
  if (p.confidence === 'observed') return 'Observed';
  if (p.confidence === 'uncertain') return 'Modelled · uncertain · EXPERIMENTAL';
  return 'Modelled · EXPERIMENTAL';
}

export interface ProjectionView {
  version: number;
  generatedAt: string;
  blockedRoads: { id: string; name: string; status: RoadProps['status']; kind: 'road' | 'bridge'; reason?: string }[];
  shelters: { id: string; name: string; status: string; label: string; counts: string; lng: number; lat: number }[];
  flood: { id: string; label: string; depthCm: number; observed: boolean }[];
  cutOff: { id: string; name: string; accessibility: SettlementProps['accessibility']; reason?: string; lat: number; lng: number }[];
}

/** Pure read of the cached server snapshot; nothing here is computed beyond filtering what the server sent. */
export function projectionView(s: ProjectionSnapshot): ProjectionView {
  return {
    version: s.version,
    generatedAt: s.generatedAt,
    blockedRoads: s.roads.features
      .filter((f) => f.properties.status === 'blocked' || f.properties.status === 'partial')
      .map((f) => ({
        id: f.properties.roadId,
        name: f.properties.name,
        status: f.properties.status,
        kind: f.properties.kind ?? 'road',
        reason: f.properties.reason,
      })),
    shelters: s.shelters.features.map((f) => {
      const st = shelterStatus(f.properties);
      return {
        id: f.properties.shelterId,
        name: f.properties.name,
        status: st.status,
        label: st.label,
        counts: shelterCounts(f.properties),
        lng: f.geometry.coordinates[0] ?? 0,
        lat: f.geometry.coordinates[1] ?? 0,
      };
    }),
    flood: s.flood.features.map((f) => ({
      id: f.properties.areaId,
      label: floodLabel(f.properties),
      depthCm: f.properties.depthCm,
      observed: f.properties.confidence === 'observed',
    })),
    cutOff: s.settlements.features
      .filter((f) => f.properties.accessibility !== 'accessible')
      .map((f) => ({
        id: f.properties.settlementId,
        name: f.properties.name,
        accessibility: f.properties.accessibility,
        reason: f.properties.cutOffReason?.summary,
        lng: f.geometry.coordinates[0] ?? 0,
        lat: f.geometry.coordinates[1] ?? 0,
      })),
  };
}

export function roadsGeoJson(s: ProjectionSnapshot): FeatureCollection<LineString> {
  const features = s.roads.features
    .filter((f) => f.properties.status === 'blocked' || f.properties.status === 'partial')
    .map((f): Feature<LineString> => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: f.geometry.coordinates.map((c) => [c[0] ?? 0, c[1] ?? 0]) },
      properties: { roadId: f.properties.roadId, status: f.properties.status },
    }));
  return { type: 'FeatureCollection', features };
}

export function floodGeoJson(s: ProjectionSnapshot): FeatureCollection<Polygon> {
  const features = s.flood.features.map((f): Feature<Polygon> => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: f.geometry.coordinates.map((r) => r.map((c) => [c[0] ?? 0, c[1] ?? 0])) },
    properties: { areaId: f.properties.areaId, observed: f.properties.confidence === 'observed' },
  }));
  return { type: 'FeatureCollection', features };
}

