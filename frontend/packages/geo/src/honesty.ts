// Data-honesty rules shared by Command and Field. Pure functions, no contract dependency.

export type DataClass = 'REAL' | 'SYNTHETIC' | 'EXPERIMENTAL';

/** Single source of truth: data class per map layer / list / legend key. */
export const LAYER_DATA_CLASS = {
  // sourced GIS
  island: 'REAL',
  waterbodies: 'REAL',
  waterways: 'REAL',
  roads: 'REAL',
  'roads-minor': 'REAL',
  bridges: 'REAL',
  places: 'REAL',
  ferries: 'REAL',
  hillshade: 'REAL',
  dem: 'REAL',
  // scenario / fixture-derived
  shelters: 'SYNTHETIC',
  settlements: 'SYNTHETIC',
  routes: 'SYNTHETIC',
  'road-status': 'SYNTHETIC',
  'flood-scenario': 'SYNTHETIC',
  // modelled
  'flood-dem': 'EXPERIMENTAL',
  'flood-modelled': 'EXPERIMENTAL',
  'flood-hand': 'EXPERIMENTAL',
  hand: 'EXPERIMENTAL',
} as const satisfies Record<string, DataClass>;

export type LayerKey = keyof typeof LAYER_DATA_CLASS;

export function dataClassOf(key: string): DataClass | undefined {
  return (LAYER_DATA_CLASS as Record<string, DataClass>)[key];
}

/* ---------------- shelters ---------------- */

export interface ShelterLike { open: boolean; capacity: number; occupancy: number }
export type ShelterStatus = 'open-reported' | 'closed-reported' | 'preidentified';
export interface ShelterStatusInfo {
  status: ShelterStatus;
  label: string;
  icon: string;
  /** Never 'critical': a pre-identified camp is not a closed camp. */
  tone: 'ok' | 'neutral';
  capacityText: string;
  occupancyText: string;
  confirmed: boolean;
}

export const NOT_PUBLISHED = 'not published';

/** open:false with capacity 0 / occupancy 0 means pre-identified, NOT confirmed. Never shows 0/0 as counts. */
export function shelterStatus(p: ShelterLike): ShelterStatusInfo {
  const hasCounts = p.capacity > 0;
  const capacityText = hasCounts ? String(p.capacity) : NOT_PUBLISHED;
  const occupancyText = hasCounts ? String(p.occupancy) : NOT_PUBLISHED;
  if (p.open === true) {
    return { status: 'open-reported', label: 'Open (reported)', icon: '●', tone: 'ok', capacityText, occupancyText, confirmed: true };
  }
  if (hasCounts || p.occupancy > 0) {
    return { status: 'closed-reported', label: 'Not open (reported)', icon: '○', tone: 'neutral', capacityText, occupancyText: hasCounts ? String(p.occupancy) : NOT_PUBLISHED, confirmed: true };
  }
  return { status: 'preidentified', label: 'Pre-identified · not confirmed', icon: '◌', tone: 'neutral', capacityText, occupancyText, confirmed: false };
}

/* ---------------- routes ---------------- */

export type RouteState = 'calculated' | 'not-verified' | 'no-safe-route' | 'unreachable' | 'no-route-data' | 'refused';
export type RouteTone = 'neutral' | 'warn' | 'critical';

export interface RouteComputationLike {
  method?: string;
  verified?: boolean;
}
export interface RouteLike {
  status: 'active' | 'recalculated' | 'unavailable';
  refusal?: unknown;
  /** Backend provenance. Only a verified road-graph computation counts. */
  computation?: RouteComputationLike;
}
export interface RouteContext {
  /** All routes of the settlement (any status). Empty/undefined = none. */
  settlementRoutes?: readonly RouteLike[];
  /** Reserved: only a future verified backend signal may set this. The frontend never does. */
  destinationUnreachable?: boolean;
}

export interface RouteStateMeta { label: string; icon: string; tone: RouteTone; explanation: string }

export const ROUTE_STATE_META: Record<RouteState, RouteStateMeta> = {
  calculated: { label: 'Route calculated', icon: '✓', tone: 'neutral', explanation: 'Reserved: shown only when the backend provides a verified computed-route signal.' },
  'not-verified': { label: 'Route not verified', icon: '?', tone: 'warn', explanation: 'The route and ETA come from scenario data. The frontend cannot confirm it was computed on the road network, so do not treat it as a safe evacuation route.' },
  'no-safe-route': { label: 'No safe route', icon: '✕', tone: 'critical', explanation: 'Every known route for this settlement is unavailable.' },
  unreachable: { label: 'Destination unreachable', icon: '⊘', tone: 'critical', explanation: 'The backend reported that the destination cannot be reached on the road network.' },
  'no-route-data': { label: 'No route data', icon: '–', tone: 'neutral', explanation: 'No route has been provided for this settlement. This is not the same as "no safe route".' },
  refused: { label: 'Route refused', icon: '✕', tone: 'critical', explanation: 'The system refused this route; see the stated reason.' },
};

export function routeState(route: RouteLike | null | undefined, context: RouteContext = {}): RouteState {
  const all = context.settlementRoutes ?? [];
  if (!route) {
    if (all.length === 0) return 'no-route-data';
    if (all.every((r) => r.status === 'unavailable')) return 'no-safe-route';
    return all.some((r) => r.status !== 'unavailable' && r.computation?.verified === true)
      ? 'calculated'
      : 'not-verified';
  }
  if (route.status === 'unavailable') return route.refusal ? 'refused' : 'no-safe-route';
  if (context.destinationUnreachable === true) return 'unreachable';
  // Only the backend's own road-graph provenance can promote a route to
  // 'calculated'. Geometry shape or an ETA alone is never enough.
  return route.computation?.verified === true ? 'calculated' : 'not-verified';
}

export const INDICATIVE_ETA_NOTE = 'indicative, source unconfirmed';
export const CALCULATED_ETA_NOTE = 'calculated on the road network';

function formatEta(etaMin: number | null | undefined, note: string, unavailable: string): string {
  if (etaMin == null || !Number.isFinite(etaMin) || etaMin < 0) return `ETA unavailable (${unavailable})`;
  const m = Math.round(etaMin);
  const t = m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
  return `~${t} (${note})`;
}

/** ETA wording when the route is not verified: always labelled indicative, never a bare "45 min". */
export function formatIndicativeEta(etaMin: number | null | undefined): string {
  return formatEta(etaMin, INDICATIVE_ETA_NOTE, INDICATIVE_ETA_NOTE);
}

/** ETA wording when the backend computed the route over real road segments. */
export function formatCalculatedEta(etaMin: number | null | undefined): string {
  return formatEta(etaMin, CALCULATED_ETA_NOTE, 'route distance not published');
}
