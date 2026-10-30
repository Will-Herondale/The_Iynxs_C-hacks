import type { FeatureCollection } from 'geojson';

export type GeoLayerName = 'island' | 'waterbodies' | 'waterways' | 'roads' | 'bridges' | 'places' | 'shelters' | 'ferries';
/** Optional extra layers that are bundled only when small. */
export type OptionalGeoLayerName = 'roads-minor';

export type GeoFeatureCollection = FeatureCollection;

export interface LayerProvenance {
  branch: string;
  commit: string;
  file: string;
  licence: string;
  synthetic: boolean;
  note?: string;
}

export interface GeoProvenance {
  generatedBy: string;
  source: { repo: string; branch: string; pr: number; commit: string };
  processing: string;
  layers: Record<string, LayerProvenance>;
  counts: Record<string, number>;
  bounds: [number, number, number, number];
}

export interface Scenario {
  id: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  name: string;
  slug: string;
  note: string;
  synthetic: true;
  /** Target ids from Karthik's config (roadId/settlementId = String(osm_id), shelterId = shelter_id). */
  targets: Record<string, string | number | number[]>;
  expectedEffects: string[];
}
