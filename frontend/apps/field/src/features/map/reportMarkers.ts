import type { ClientSyncStatus } from '@setu/contract';
import type { QueueItem } from '../../sync/index.js';
import { specStatusLabel } from '../queue/statusVocab.js';

/** pending = still only on this device / in flight; accepted = server confirmed applied. */
export type MarkerState = 'pending' | 'accepted' | 'review' | 'rejected';

/** Shape + glyph per state, so state is never carried by colour alone. */
export const MARKER_SHAPE: Record<MarkerState, { glyph: string; shape: string; name: string }> = {
  pending: { glyph: '○', shape: 'circle (hollow)', name: 'Pending' },
  accepted: { glyph: '■', shape: 'square (solid)', name: 'Accepted by server' },
  review: { glyph: '◆', shape: 'diamond', name: 'Requires review' },
  rejected: { glyph: '✕', shape: 'cross', name: 'Rejected' },
};

export function markerState(status: ClientSyncStatus): MarkerState {
  switch (status) {
    case 'synced':
      return 'accepted';
    case 'conflict':
      return 'review';
    case 'rejected':
      return 'rejected';
    default:
      return 'pending';
  }
}

export interface ReportMarker {
  clientEventId: string;
  lat: number;
  lng: number;
  state: MarkerState;
  status: ClientSyncStatus;
  /** Spec-vocabulary label, e.g. "Saved locally". */
  statusLabel: string;
  title: string;
}

const TITLE: Record<string, string> = {
  flood_report: 'Flooded road',
  road_blockage: 'Blocked road',
  road_cleared: 'Road cleared',
  water_level: 'Water level',
};

/** Local reports with a usable location. Household registrations are excluded (private, not map data). */
export function reportMarkers(items: QueueItem[], online: boolean): ReportMarker[] {
  const out: ReportMarker[] = [];
  for (const it of items) {
    if (it.type === 'household_registration') continue;
    const loc = it.event.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    const ev = it.event as { cause?: string };
    out.push({
      clientEventId: it.clientEventId,
      lat: loc.lat,
      lng: loc.lng,
      state: markerState(it.status),
      status: it.status,
      statusLabel: specStatusLabel(it.status, online),
      title: it.type === 'road_blockage' && ev.cause === 'submerged' ? 'Submerged crossing' : (TITLE[it.type] ?? it.type),
    });
  }
  return out;
}
