import type { EventRecord, ServerEventState } from '@setu/contract';
import { COLORS, OBS_ICON_PREFIX } from './layers';

export interface ObservationFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    eventId: string;
    type: string;
    serverState: ServerEventState;
    occurredAt: string;
    receivedAt: string;
  };
}
export interface ObservationCollection {
  type: 'FeatureCollection';
  features: ObservationFeature[];
}

/**
 * Report locations from listEvents -> GeoJSON points. Rendered as-is: the location the
 * reporter's device recorded, the server state, nothing derived. Events without a usable
 * location are skipped rather than placed anywhere.
 */
export function observationsToGeoJSON(events: readonly EventRecord[]): ObservationCollection {
  const features: ObservationFeature[] = [];
  for (const r of events) {
    const { lat, lng } = r.event.location;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    features.push({
      type: 'Feature',
      id: r.eventId,
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        eventId: r.eventId,
        type: r.event.type,
        serverState: r.serverState,
        occurredAt: r.event.occurredAt,
        receivedAt: r.receivedAt,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** State -> colour + shape (colour is never the only signal). */
export const OBSERVATION_STATES: Record<ServerEventState, { label: string; color: string; shape: 'dot' | 'ring' | 'diamond' | 'cross' }> = {
  applied: { label: 'Applied', color: COLORS.observation, shape: 'dot' },
  accepted: { label: 'Accepted, not yet applied', color: COLORS.warning, shape: 'ring' },
  conflict: { label: 'Requires review', color: COLORS.review, shape: 'diamond' },
  rejected: { label: 'Rejected', color: COLORS.grey, shape: 'cross' },
};

const SIZE = 22;

/** Draw one observation icon into a 2D context (SIZE x SIZE). */
export function drawObservationIcon(ctx: CanvasRenderingContext2D, state: ServerEventState): void {
  const { color, shape } = OBSERVATION_STATES[state];
  const c = SIZE / 2;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (shape === 'dot') ctx.arc(c, c, 6, 0, Math.PI * 2);
  else if (shape === 'ring') ctx.arc(c, c, 6, 0, Math.PI * 2);
  else if (shape === 'diamond') { ctx.moveTo(c, c - 8); ctx.lineTo(c + 8, c); ctx.lineTo(c, c + 8); ctx.lineTo(c - 8, c); ctx.closePath(); }
  if (shape !== 'cross') { ctx.stroke(); }
  if (shape === 'ring') {
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else if (shape !== 'cross') {
    ctx.fill();
  } else {
    for (const [w, style] of [[6, '#ffffff'], [3, color]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(c - 5, c - 5); ctx.lineTo(c + 5, c + 5);
      ctx.moveTo(c + 5, c - 5); ctx.lineTo(c - 5, c + 5);
      ctx.stroke();
    }
  }
}

/** Register the four state icons on a map. No-op when canvas 2D is unavailable (jsdom). */
export function registerObservationIcons(map: { addImage(id: string, img: ImageData, opts?: { pixelRatio?: number }): void; hasImage(id: string): boolean }): void {
  for (const state of Object.keys(OBSERVATION_STATES) as ServerEventState[]) {
    const id = `${OBS_ICON_PREFIX}${state}`;
    if (map.hasImage(id)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawObservationIcon(ctx, state);
    map.addImage(id, ctx.getImageData(0, 0, SIZE, SIZE), { pixelRatio: 1 });
  }
}
