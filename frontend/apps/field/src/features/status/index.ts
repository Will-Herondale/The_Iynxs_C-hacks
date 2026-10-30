export { ConnectivityStatus, LastSyncedLine, DataAsOf, StaleWarning, OriginBadge, LocalOnlyNotice } from './StatusComponents.js';
export { deriveConnectivity, probeBackend, reportBackendResult, useBackendReachable, HEALTH_PATH } from './connectivity.js';
export type { ConnectivityState } from './connectivity.js';
export { STALE_AMBER_MS, STALE_RED_MS, staleLevel, formatRelative, formatIst } from './staleness.js';
export { ORIGIN_SHAPE, originLabel } from './origin.js';
export type { Origin } from './origin.js';
