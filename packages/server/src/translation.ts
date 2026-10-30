// Translation layer — wire format (FieldEvent) → internal envelope (Envelope).
//
// The wire format comes from @setu/contract (frontend). The internal envelope
// is used by the fold and sync protocol. Translation happens at the API
// boundary, never in the fold.

import {
  type FieldEvent,
  type FloodReport,
  type RoadBlockage,
  type RoadCleared,
  type WaterLevel,
  type HouseholdRegistration,
} from './contract-types';
import {
  type EnvelopeInput,
  hlcInitial,
} from '../../core/src/index';

/**
 * Client-side idempotency key stored separately from the internal ULID id.
 * The server maps clientEventId → eventId for duplicate detection.
 */
/**
 * Translate a wire-format FieldEvent to an internal Envelope.
 *
 * Transformations:
 * - clientEventId (UUID) → separate idempotency key; internal id = new ULID
 * - occurredAt (ISO datetime) → at (epoch ms integer)
 * - lat/lng (floats) → microdegrees (integers)
 * - depthCm/levelCm (floats) → decimetres (integers, ×10)
 * - photoRefs → pass through (strings)
 * - reporterId → actor.id; deviceId preserved
 * - role defaulted to 'volunteer'
 */
export function translateEvent(
  event: FieldEvent,
): EnvelopeInput {
  const s = hlcInitial();
  const now = s.l;

  const base = {
    clientEventId: event.clientEventId,
    occurredAt: event.occurredAt,
    reporterId: event.reporterId,
    deviceId: event.deviceId,
    location: event.location,
  };

  const payload: Record<string, unknown> = {};

  switch (event.type) {
    case 'flood_report': {
      const e = event as FloodReport;
      const loc = locationToMicrodegrees(e.location);
      payload.type = 'obs.water';
      payload.point_id = e.areaId ?? `point-${e.clientEventId}`;
      payload.depth_dm = e.depthCm !== undefined ? Math.round(e.depthCm * 10) : 0;
      payload.ref_kind = 'bridge_deck';
      payload.confidence = 80;
      payload.area_id = e.areaId;
      payload.severity = e.severity;
      payload.lat = loc.lat;
      payload.lng = loc.lng;
      break;
    }
    case 'road_blockage': {
      const e = event as RoadBlockage;
      payload.type = 'obs.road';
      payload.edge_id = e.roadId ?? `edge-${e.clientEventId}`;
      payload.state = e.blockage === 'full' ? 'blocked' : 'partial';
      payload.cause = 'water';
      payload.depth_dm = null;
      payload.valid_from = toEpochMs(e.occurredAt);
      payload.valid_until = null;
      payload.confidence = 80;
      payload.passable_by = e.passableBy;
      break;
    }
    case 'road_cleared': {
      const e = event as RoadCleared;
      payload.type = 'obs.road';
      payload.edge_id = e.roadId;
      payload.state = 'open';
      payload.cause = 'water';
      payload.depth_dm = null;
      payload.valid_from = toEpochMs(e.occurredAt);
      payload.valid_until = null;
      payload.confidence = 100;
      break;
    }
    case 'water_level': {
      const e = event as WaterLevel;
      payload.type = 'obs.water';
      payload.point_id = e.gaugeId ?? `gauge-${e.clientEventId}`;
      payload.depth_dm = Math.round(e.levelCm * 10);
      payload.ref_kind = 'gauge_zero';
      payload.confidence = 60;
      payload.trend = e.trend;
      // OQ-03: raw gauge levelCm requires datum calibration before inundation use
      break;
    }
    case 'household_registration': {
      const e = event as HouseholdRegistration;
      payload.type = 'person.register';
      payload.person_id = e.householdId;
      payload.names = [{ script: 'latn', text: e.headName }];
      payload.age_band = '18-59';
      payload.sex = 'u';
      payload.village_id = e.settlementId;
      payload.camp_id = null;
      payload.household_id = e.householdId;
      payload.reporter_confidence = 90;
      payload.needs = e.needs;
      break;
    }
    default:
      throw new Error(`Unknown event type: ${(event as { type: string }).type}`);
  }

  const envInput: EnvelopeInput = {
    origin: base.deviceId,
    seq: 1, // assigned by the log on append
    hlc: { l: now, c: 0 },
    vv: {},
    type: payload.type as string,
    actor: { id: base.reporterId, role: 'volunteer' },
    subject: `${payload.type}:${payload.person_id || payload.edge_id || payload.point_id}`,
    at: toEpochMs(base.occurredAt),
    payload: stripUndefined(payload),
  };

  return envInput;
}

/**
 * Remove keys with undefined values from an object.
 * Prevents validateNoFloats from rejecting undefined as an unsupported type.
 */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}

/**
 * Parse an ISO-8601 datetime string to epoch ms.
 * Falls back to Date.now() if parsing fails.
 */
export function toEpochMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Date.now() : ms;
}

/**
 * Convert a wire-format location (floats) to integer microdegrees.
 */
export function locationToMicrodegrees(
  loc: { lat: number; lng: number },
): { lat: number; lng: number } {
  return {
    lat: Math.round(loc.lat * 1_000_000),
    lng: Math.round(loc.lng * 1_000_000),
  };
}
