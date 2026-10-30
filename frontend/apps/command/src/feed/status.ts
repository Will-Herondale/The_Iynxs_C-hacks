import { isConfirmedSynced, type ClientSyncStatus, type EventRecord } from '@setu/contract';
import type { Selection } from '../app';

export type FeedStatus = Extract<ClientSyncStatus, 'accepted' | 'synced' | 'conflict' | 'rejected'>;

/**
 * Feed status for a server event record. 'synced' requires server confirmation:
 * serverState 'applied' AND an appliedAtVersion that the current snapshot has reached.
 * Anything merely received/accepted (or applied but not yet visible) stays 'accepted'.
 */
export function feedStatus(rec: EventRecord, snapshotVersion: number | undefined): FeedStatus {
  switch (rec.serverState) {
    case 'conflict':
      return 'conflict';
    case 'rejected':
      return 'rejected';
    case 'applied':
      return rec.appliedAtVersion !== undefined &&
        snapshotVersion !== undefined &&
        isConfirmedSynced(rec.appliedAtVersion, snapshotVersion)
        ? 'synced'
        : 'accepted';
    default:
      return 'accepted';
  }
}

export const EVENT_META: Record<EventRecord['event']['type'], { icon: string; label: string }> = {
  flood_report: { icon: '🌊', label: 'Flood report' },
  road_blockage: { icon: '🚧', label: 'Road blockage' },
  road_cleared: { icon: '✅', label: 'Road cleared' },
  water_level: { icon: '📏', label: 'Water level' },
  household_registration: { icon: '🏠', label: 'Household registered' },
};

/** Short human summary of the event payload. */
export function eventSummary(rec: EventRecord): string {
  const e = rec.event;
  switch (e.type) {
    case 'flood_report':
      return `severity ${e.severity}${e.depthCm !== undefined ? `, ${e.depthCm} cm` : ''}`;
    case 'road_blockage':
      return `${e.roadId ?? 'unknown road'} ${e.blockage}`;
    case 'road_cleared':
      return `${e.roadId}`;
    case 'water_level':
      return `${e.levelCm} cm, ${e.trend}`;
    case 'household_registration':
      return `${e.headName}, ${e.members} members`;
  }
}

/** Features an event refers to, for linking into the selection. */
export function affectedFeatures(rec: EventRecord): Selection[] {
  const e = rec.event;
  switch (e.type) {
    case 'road_blockage':
      return e.roadId ? [{ kind: 'road', id: e.roadId }] : [];
    case 'road_cleared':
      return [{ kind: 'road', id: e.roadId }];
    case 'flood_report':
      return e.areaId ? [{ kind: 'flood', id: e.areaId }] : [];
    case 'household_registration':
      return e.settlementId ? [{ kind: 'settlement', id: e.settlementId }] : [];
    default:
      return [];
  }
}
