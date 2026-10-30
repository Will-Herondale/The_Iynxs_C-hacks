import type { ShelterProps } from '@setu/contract';

/** Data classes: REAL = sourced GIS, SYNTHETIC = scenario/fixture data, EXPERIMENTAL = modelled. */
export type DataClass = 'REAL' | 'SYNTHETIC' | 'EXPERIMENTAL';

/** Field-side single source for the Map key; mirrors the shared LAYER_DATA_CLASS. */
export const FIELD_LAYER_CLASS = {
  basemap: 'REAL',
  roads: 'REAL',
  floodModelled: 'EXPERIMENTAL',
  floodObserved: 'SYNTHETIC',
  blockedRoads: 'SYNTHETIC',
  settlements: 'SYNTHETIC',
  shelters: 'SYNTHETIC',
} as const satisfies Record<string, DataClass>;

export const CLASS_HINT: Record<DataClass, string> = {
  REAL: 'Sourced GIS data',
  SYNTHETIC: 'Scenario data, not a live field report',
  EXPERIMENTAL: 'Modelled, not validated',
};

export type ShelterStatus = 'open-reported' | 'pre-identified';

/** open:false with 0/0 is a pre-identified camp, never a confirmed closure. Only open===true is "Open (reported)". */
export function shelterStatus(p: Pick<ShelterProps, 'open'>): { status: ShelterStatus; label: string } {
  return p.open === true
    ? { status: 'open-reported', label: 'Open (reported)' }
    : { status: 'pre-identified', label: 'Pre-identified · not confirmed' };
}

/** Capacity/occupancy are only shown as numbers for a reported-open shelter with a real capacity. */
export function shelterCounts(p: Pick<ShelterProps, 'open' | 'capacity' | 'occupancy'>): string {
  return p.open === true && p.capacity > 0 ? `${p.occupancy} of ${p.capacity}` : 'not published';
}
