import { LAYER_DATA_CLASS, shelterStatus as sharedShelterStatus, type DataClass } from '@setu/geo';
import type { ShelterProps } from '@setu/contract';

export type { DataClass };

/** Field Map key classes, read from the shared LAYER_DATA_CLASS (@setu/geo). */
export const FIELD_LAYER_CLASS = {
  basemap: LAYER_DATA_CLASS.island,
  roads: LAYER_DATA_CLASS.roads,
  floodModelled: LAYER_DATA_CLASS['flood-modelled'],
  floodObserved: LAYER_DATA_CLASS['flood-scenario'],
  blockedRoads: LAYER_DATA_CLASS['road-status'],
  settlements: LAYER_DATA_CLASS.settlements,
  shelters: LAYER_DATA_CLASS.shelters,
} as const satisfies Record<string, DataClass>;

export const CLASS_HINT: Record<DataClass, string> = {
  REAL: 'Sourced GIS data',
  SYNTHETIC: 'Scenario data, not a live field report',
  EXPERIMENTAL: 'Modelled, not validated',
};

export type ShelterStatus = 'open-reported' | 'closed-reported' | 'pre-identified';

type ShelterIn = Pick<ShelterProps, 'open' | 'capacity' | 'occupancy'>;

/** Status key uses the data-attribute spelling ('pre-identified'); rules live in @setu/geo. */
export function shelterStatus(p: ShelterIn): { status: ShelterStatus; label: string } {
  const info = sharedShelterStatus(p);
  return { status: info.status === 'preidentified' ? 'pre-identified' : info.status, label: info.label };
}

/** Capacity/occupancy as text; "not published" unless real counts exist. */
export function shelterCounts(p: ShelterIn): string {
  const info = sharedShelterStatus(p);
  return info.capacityText === 'not published' ? 'not published' : `${info.occupancyText} of ${info.capacityText}`;
}
