export * from './errors.js';
export * from './events.js';
export * from './sync.js';
export * from './projections.js';
export * from './api.js';

import type { ClientSyncStatus } from './sync.js';

/** True once an event is confirmed in the feed (never true for a mere ack). */
export function isTerminalSyncStatus(s: ClientSyncStatus): boolean {
  return s === 'synced' || s === 'conflict' || s === 'rejected';
}

/**
 * Two-step confirmation: an event is synced only when the feed/projection version
 * has reached the version at which the server accepted it.
 */
export function isConfirmedSynced(acceptedAtVersion: number, feedVersion: number): boolean {
  return feedVersion >= acceptedAtVersion;
}
