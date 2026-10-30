export { ulid, ulidTimestamp, ulidIsValid, type UlidOptions } from './ulid.js';
export { hlcNow, hlcUpdate, hlcCompare, hlcInitial, type HLC, type HLCState } from './hlc.js';
export { canonicalJson, validateNoFloats, type HashableEnvelope } from './canonical.js';
export { contentHash } from './content-hash.js';
export {
  type Envelope,
  type EnvelopeInput,
  createEnvelope,
  envelopeIsValid,
  envelopeEqual,
  happensBefore,
  totalOrder,
} from './envelope.js';
export {
  vvEmpty,
  vvGet,
  vvSet,
  vvMerge,
  vvEqual,
  vvClone,
  vvToSortedEntries,
  type VersionVector,
} from './sync/version-vector.js';
export { type SyncRequest, type SyncResponse, type SyncState, syncStateEmpty } from './sync/types.js';

export {
  type EdgePassability,
  type RoadObservation,
  type RoadState,
  projectNetwork,
  selectRoadState,
} from './project/network.js';
export {
  type FloodPoint,
  type WaterObservation,
  type InundationCell,
  type FloodProjection,
  projectFlood,
  selectWaterObservation,
  computeHydraulicDepth,
} from './project/flood.js';
export {
  type PersonName,
  type PersonRecord,
  type MatchProposal,
  type PersonCluster,
  type PeopleProjection,
  projectPeople,
  normalizeName,
  phoneticKey,
} from './project/people.js';
export {
  type RouteEdge,
  type Passability,
  type ExpandedNode,
  type ExpandedArc,
  type RouteResult,
  buildExpandedGraph,
  earliestArrivalFrom,
  findFastestPath,
} from './route/dag.js';
export {
  type LatestDepartureResult,
  latestSafeDeparture,
  type Slot,
} from './route/latest-departure.js';
export {
  type SettlementReachability,
  type CutoffResult,
  projectReachability,
} from './route/cutoff.js';
