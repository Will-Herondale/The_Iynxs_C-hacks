// Contract type definitions — minimal subset needed by the server.
// These mirror @setu/contract from the frontend. When the frontend branch
// is checked out locally, these should be replaced with an import from
// @setu/contract.

export type FieldEventType =
  | 'flood_report'
  | 'road_blockage'
  | 'road_cleared'
  | 'water_level'
  | 'household_registration';

export interface Location {
  lat: number;
  lng: number;
  accuracyM?: number;
}

export interface VulnerableFlags {
  elderly: boolean;
  children: boolean;
  disabled: boolean;
  medical: boolean;
}

export interface BaseFieldEvent {
  clientEventId: string;
  type: FieldEventType;
  occurredAt: string;
  reporterId: string;
  deviceId: string;
  location: Location;
  note?: string;
  photoRefs?: string[];
}

export interface FloodReport extends BaseFieldEvent {
  type: 'flood_report';
  severity: number;
  depthCm?: number;
  areaId?: string;
}

export type VehicleClass = 'foot' | 'bike' | 'car' | 'truck';

export interface RoadBlockage extends BaseFieldEvent {
  type: 'road_blockage';
  roadId?: string;
  blockage: 'partial' | 'full';
  passableBy?: VehicleClass[];
}

export interface RoadCleared extends BaseFieldEvent {
  type: 'road_cleared';
  roadId: string;
}

export interface WaterLevel extends BaseFieldEvent {
  type: 'water_level';
  gaugeId?: string;
  levelCm: number;
  trend: 'rising' | 'steady' | 'falling';
}

export interface HouseholdRegistration extends BaseFieldEvent {
  type: 'household_registration';
  householdId: string;
  headName: string;
  members: number;
  vulnerable: VulnerableFlags;
  settlementId?: string;
  needs: string[];
}

export type FieldEvent =
  | FloodReport
  | RoadBlockage
  | RoadCleared
  | WaterLevel
  | HouseholdRegistration;

export interface ValidationIssue {
  path: string;
  message: string;
}

export type SubmitAckResult = 'accepted' | 'duplicate' | 'conflict' | 'rejected';

export interface SubmitAckAccepted {
  clientEventId: string;
  result: 'accepted';
  eventId: string;
  acceptedAtVersion: number;
}

export interface SubmitAckDuplicate {
  clientEventId: string;
  result: 'duplicate';
  eventId: string;
}

export interface SubmitAckConflict {
  clientEventId: string;
  result: 'conflict';
  eventId?: string;
  reason: string;
  serverState?: unknown;
}

export interface SubmitAckRejected {
  clientEventId: string;
  result: 'rejected';
  errors: ValidationIssue[];
}

export type SubmitAck =
  | SubmitAckAccepted
  | SubmitAckDuplicate
  | SubmitAckConflict
  | SubmitAckRejected;

export type EventStatusState = 'unknown' | 'accepted' | 'applied' | 'conflict' | 'rejected';

export interface EventStatus {
  clientEventId: string;
  eventId?: string;
  state: EventStatusState;
  projectionVersion?: number;
}

export interface EventRecord {
  eventId: string;
  event: FieldEvent;
  serverState: EventStatusState;
  receivedAt: string;
  appliedAtVersion?: number;
}

export type Pos = number[];

export interface PointGeom {
  type: 'Point';
  coordinates: Pos;
}

export interface LineGeom {
  type: 'LineString';
  coordinates: Pos[];
}

export interface PolygonGeom {
  type: 'Polygon';
  coordinates: Pos[][];
}

export interface Feature<G, P> {
  type: 'Feature';
  id?: string;
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G, P> {
  type: 'FeatureCollection';
  version: number;
  generatedAt: string;
  features: Array<Feature<G, P>>;
}

export interface FloodProps {
  areaId: string;
  depthCm: number;
  severity: number;
  synthetic?: boolean;
}

export type RoadStatusValue = 'open' | 'partial' | 'blocked' | 'unknown' | 'disputed';

export interface RoadProps {
  roadId: string;
  name: string;
  status: RoadStatusValue;
  updatedAt: string;
  sourceEventIds: string[];
  synthetic?: boolean;
}

export type Accessibility = 'accessible' | 'limited' | 'cut_off';

export interface SettlementProps {
  settlementId: string;
  name: string;
  population: number;
  accessibility: Accessibility;
  households: number;
  needs: string[];
  synthetic?: boolean;
}

export type RouteKind = 'evacuation' | 'supply';

export type RouteStatus = 'active' | 'recalculated' | 'unavailable';

export interface RouteProps {
  routeId: string;
  from: string;
  to: string;
  kind: RouteKind;
  status: RouteStatus;
  etaMin: number;
  replacesRouteId?: string;
  synthetic?: boolean;
  /** Human-readable reason when route is unavailable or recalculated. */
  reason?: string;
}

export interface ShelterProps {
  shelterId: string;
  name: string;
  capacity: number;
  occupancy: number;
  open: boolean;
  synthetic?: boolean;
}

export type FloodExtent = FeatureCollection<PolygonGeom, FloodProps>;
export type RoadStatus = RoadStatusCollection;
export type Settlement = SettlementCollection;
export type Route = RouteCollection;
export type Shelter = ShelterCollection;
export type RoadStatusCollection = FeatureCollection<LineGeom, RoadProps>;
export type SettlementCollection = FeatureCollection<PointGeom, SettlementProps>;
export type RouteCollection = FeatureCollection<LineGeom, RouteProps>;
export type ShelterCollection = FeatureCollection<PointGeom, ShelterProps>;

export interface ProjectionSnapshot {
  version: number;
  generatedAt: string;
  flood: FloodExtent;
  roads: RoadStatusCollection;
  settlements: SettlementCollection;
  routes: RouteCollection;
  shelters: ShelterCollection;
}

export interface NetworkError extends Error {
  readonly retryable: true;
}
export interface ServerError extends Error {
  readonly retryable: true;
  readonly status: number;
}
export interface TimeoutError extends Error {
  readonly retryable: true;
}
export interface NotImplementedError extends Error {
  readonly retryable: false;
}

export type ApiError = NetworkError | ServerError | TimeoutError | NotImplementedError;

export interface ApiClient {
  submitEvents(events: FieldEvent[]): Promise<SubmitAck[]>;
  getEventStatus(clientEventIds: string[]): Promise<EventStatus[]>;
  getProjections(sinceVersion?: number): Promise<ProjectionSnapshot>;
  listEvents(params?: {
    sinceVersion?: number;
    limit?: number;
    type?: FieldEventType;
  }): Promise<EventRecord[]>;
  subscribe(onChange: (snapshotVersion: number) => void): () => void;
}
