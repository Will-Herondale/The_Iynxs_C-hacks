import type { ClientSyncStatus } from '@setu/contract';
import type { QueueItem } from '../../sync/index.js';
import type { EventRecord } from '@setu/contract';
import type { Origin } from '../status/origin.js';
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
  /** local = created on this device; remote = received from the server. */
  origin: Origin;
  /** Local report the server has applied ("Local · Accepted"). */
  accepted: boolean;
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
      origin: 'local',
      accepted: it.status === 'synced',
      title: it.type === 'road_blockage' && ev.cause === 'submerged' ? 'Submerged crossing' : (TITLE[it.type] ?? it.type),
    });
  }
  return out;
}

const REMOTE_STATE: Record<EventRecord['serverState'], { state: MarkerState; label: string }> = {
  accepted: { state: 'pending', label: 'Received by server' },
  applied: { state: 'accepted', label: 'Applied' },
  conflict: { state: 'review', label: 'Requires review' },
  rejected: { state: 'rejected', label: 'Rejected' },
};

/** Events received from the server with a location. Those this device created (same clientEventId) are shown as local instead. */
export function remoteMarkers(records: EventRecord[], localIds: ReadonlySet<string>): ReportMarker[] {
  const out: ReportMarker[] = [];
  for (const r of records) {
    const ev = r.event;
    if (ev.type === 'household_registration' || localIds.has(ev.clientEventId)) continue;
    const loc = ev.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    const s = REMOTE_STATE[r.serverState];
    out.push({
      clientEventId: ev.clientEventId,
      lat: loc.lat,
      lng: loc.lng,
      state: s.state,
      status: 'synced',
      statusLabel: s.label,
      origin: 'remote',
      accepted: false,
      title: TITLE[ev.type] ?? ev.type,
    });
  }
  return out;
}
