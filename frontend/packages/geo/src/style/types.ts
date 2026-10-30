// Minimal structural types so the style code needs no runtime/type dependency on maplibre-gl.
// They are assignable to maplibregl.StyleSpecification / Map for the members used here.
import type { GeoLayerName } from '../types.js';

export type LngLat = [number, number];

export interface StyleSourceSpec {
  type: 'geojson' | 'image';
  [k: string]: unknown;
}

export interface StyleLayerSpec {
  id: string;
  type: 'background' | 'fill' | 'line' | 'raster';
  source?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown[];
  minzoom?: number;
  maxzoom?: number;
}

export interface OfflineStyleSpec {
  version: 8;
  name: string;
  sources: Record<string, StyleSourceSpec>;
  layers: StyleLayerSpec[];
}

export interface OfflineStyleOptions {
  /** Add the hillshade image source + raster layer. Default false. */
  terrain?: boolean;
  /** Override the bundled hillshade URL (must be same-origin / bundled). */
  hillshadeUrl?: string;
}

export interface MapLike {
  addSource(id: string, source: StyleSourceSpec): unknown;
  addLayer(layer: StyleLayerSpec, before?: string): unknown;
  getSource(id: string): unknown;
  getLayer(id: string): unknown;
}

export type GeoLoader = (name: GeoLayerName) => Promise<{ type: 'FeatureCollection'; features: unknown[] }>;
