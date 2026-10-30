import type { StyleSpecification } from 'maplibre-gl';
import { createOfflineStyle } from '@setu/geo';

/** Offline district basemap style for the report location picker (no external URLs). */
export function plainOfflineStyle(): StyleSpecification {
  return createOfflineStyle({ terrain: false }) as unknown as StyleSpecification;
}
