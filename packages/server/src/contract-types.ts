// Contract type definitions — minimal subset needed by the server.
// These mirror @setu/contract from the frontend. When the frontend branch
// is checked out locally, these should be replaced with an import from
// @setu/contract.

export type FieldEventType =
  | 'flood_report'
  | 'road_blockage'
  | 'road_cleared'
  | 'water_level'
  | 'household_registration'
  | 'person_checkin';

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
  /** Camp/shelter where the household was registered (wire field). */
  shelterId?: string;
  needs: string[];
}

export type AgeBand = '0-4' | '5-12' | '13-17' | '18-59' | '60+';

/**
 * One person checking in at a camp. Distinct from a household registration:
 * a household is a declared group with a member count, a person is one human.
 */
export interface PersonCheckin extends BaseFieldEvent {
  type: 'person_checkin';
  /** Present when this is a repeat check-in of an already-known person. */
  personId?: string;
  name: string;
  ageBand?: AgeBand;
  sex?: 'f' | 'm' | 'o' | 'u';
  /** Camp/shelter where the person is physically present. */
  campId: string;
  settlementId?: string;
  householdId?: string;
  vulnerable?: VulnerableFlags;
  needs?: string[];
}

export type FieldEvent =
  | FloodReport
  | RoadBlockage
  | RoadCleared
  | WaterLevel
  | HouseholdRegistration
  | PersonCheckin;

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
  cutOffReason?: Explanation;
}

export type RouteKind = 'evacuation' | 'supply';

export type RouteStatus = 'active' | 'recalculated' | 'unavailable';

/** Structured explanation shared by cut-off settlements and refused routes. */
export interface Explanation {
  summary: string;
  /** IDs of the features that block the route (road/bridge IDs). */
  blockingFeatureIds: string[];
  sourceEventIds?: string[];
}

/**
 * Provenance of a route's geometry and ETA. Present only when the backend
 * actually computed the route; fixture routes omit it.
 */
export interface RouteComputation {
  /** `road_graph` means the path was traced over road segments, not drawn. */
  method: 'road_graph';
  /**
   * True when the route was computed on the loaded road graph and fits inside
   * the evacuation window. Only then may a client call it "calculated".
   */
  verified: boolean;
  /** Along-road distance in metres (not straight-line). */
  distanceM: number;
  /** Number of road segments traversed. */
  segmentCount: number;
  /** Segments with no passability observation (treated as open). */
  unknownSegmentCount: number;
  /** Planning speed used for the ETA. */
  speedMps: number;
  /** Evacuation window used to accept/refuse the route. */
  windowMin: number;
}

export interface RouteProps {
  routeId: string;
  from: string;
  to: string;
  kind: RouteKind;
  status: RouteStatus;
  etaMin: number;
  replacesRouteId?: string;
  synthetic?: boolean;
  computation?: RouteComputation;
  /**
   * Structured reason when status is unavailable. The Command Centre renders
   * this as "Why this route is refused" with links to the blocking features.
   */
  refusal?: Explanation;
  /** Plain-text mirror for older clients. */
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
