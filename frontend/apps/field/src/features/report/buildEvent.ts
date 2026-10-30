import { FieldEventSchema, newClientEventId } from '@setu/contract';
import type { FieldEvent } from '@setu/contract';
import { categoryDef } from './categories.js';
import type { ReportCategory } from './categories.js';

export type ReportKind = 'flood_report' | 'road_blockage' | 'road_cleared' | 'water_level';
export type LocationSource = 'gps' | 'map' | 'manual' | 'unknown';

export interface ReportValues {
  category: ReportCategory;
  /** Derived from `category`; kept as a field so the builder switch stays exhaustive. */
  type: ReportKind;
  /** Observation time as a local `datetime-local` string (YYYY-MM-DDTHH:mm); empty = now. */
  observedAt: string;
  accuracyM: string;
  locationSource: LocationSource;
  roadId: string;
  blockage: string;
  cause: string;
  severity: string;
  depthCm: string;
  areaId: string;
  levelCm: string;
  trend: string;
  gaugeId: string;
  lat: string;
  lng: string;
  note: string;
  photoName: string;
}

export const EMPTY_REPORT: ReportValues = {
  category: 'flooded_road', observedAt: '', accuracyM: '', locationSource: 'unknown',
  type: 'flood_report', roadId: '', blockage: 'full', cause: '', severity: '3', depthCm: '', areaId: '',
  levelCm: '', trend: 'rising', gaugeId: '', lat: '', lng: '', note: '', photoName: '',
};

export interface Identity { reporterId: string; deviceId: string }
export type BuildResult = { ok: true; event: FieldEvent } | { ok: false; errors: { path: string; message: string }[] };

const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));
const str = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim());

/** Converts raw form strings to a contract event and validates it with the shared zod schema. */
export function buildReportEvent(v: ReportValues, id: Identity, clientEventId: string, now = new Date()): BuildResult {
  const def = categoryDef(v.category);
  if (def.blocked || !def.eventType) return { ok: false, errors: [{ path: 'category', message: `${def.label} cannot be reported yet (${def.blocked}).` }] };
  const observed = v.observedAt.trim() === '' ? now : new Date(v.observedAt);
  if (Number.isNaN(observed.getTime())) return { ok: false, errors: [{ path: 'observedAt', message: 'Observation time is not a valid date and time.' }] };
  if (observed.getTime() > now.getTime() + 5 * 60_000) return { ok: false, errors: [{ path: 'observedAt', message: 'Observation time cannot be in the future.' }] };
  const occurredAt = observed.toISOString();
  const lat = num(v.lat);
  const lng = num(v.lng);
  const common = {
    clientEventId,
    occurredAt,
    reporterId: id.reporterId,
    deviceId: id.deviceId,
    location: { lat, lng, accuracyM: v.locationSource === 'gps' ? num(v.accuracyM) : undefined },
    note: str(v.note),
    photoRefs: str(v.photoName) ? [v.photoName.trim()] : undefined,
  };
  let raw: Record<string, unknown>;
  switch (v.type) {
    case 'flood_report':
      raw = { ...common, type: v.type, severity: num(v.severity), depthCm: num(v.depthCm), areaId: str(v.areaId) };
      break;
    case 'road_blockage':
      raw = { ...common, type: v.type, roadId: str(v.roadId), blockage: v.blockage, cause: v.category === 'submerged_bridge' ? 'submerged' : str(v.cause) };
      break;
    case 'road_cleared':
      raw = { ...common, type: v.type, roadId: str(v.roadId) };
      break;
    case 'water_level':
      raw = { ...common, type: v.type, levelCm: num(v.levelCm), trend: v.trend, gaugeId: str(v.gaugeId) };
      break;
  }
  const parsed = FieldEventSchema.safeParse(raw);
  if (parsed.success) return { ok: true, event: parsed.data };
  return { ok: false, errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
}

/** Prefills form values from an existing event (rejected item reopened for editing). */
export function valuesFromEvent(e: FieldEvent): ReportValues {
  const acc = e.location.accuracyM;
  const v: ReportValues = { ...EMPTY_REPORT, observedAt: toLocalInput(e.occurredAt), accuracyM: acc === undefined ? '' : String(acc), locationSource: acc === undefined ? 'manual' : 'gps', lat: String(e.location.lat), lng: String(e.location.lng), note: e.note ?? '', photoName: e.photoRefs?.[0] ?? '' };
  switch (e.type) {
    case 'flood_report':
      return { ...v, category: 'flooded_road', type: e.type, severity: String(e.severity), depthCm: e.depthCm?.toString() ?? '', areaId: e.areaId ?? '' };
    case 'road_blockage':
      return { ...v, category: e.cause === 'submerged' ? 'submerged_bridge' : 'blocked_road', type: e.type, roadId: e.roadId ?? '', blockage: e.blockage, cause: e.cause ?? '' };
    case 'road_cleared':
      return { ...v, category: 'road_cleared', type: e.type, roadId: e.roadId };
    case 'water_level':
      return { ...v, category: 'water_level', type: e.type, levelCm: String(e.levelCm), trend: e.trend, gaugeId: e.gaugeId ?? '' };
    default:
      return v;
  }
}

/** ISO instant → value for `<input type="datetime-local">` in the device's local zone. */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const freshId = newClientEventId;

/** Maps a zod issue path onto the visible form field key. */
export function fieldKeyForPath(path: string): string {
  if (path.startsWith('location.lat')) return 'lat';
  if (path.startsWith('location.lng')) return 'lng';
  if (path.startsWith('location')) return 'lat';
  return path.split('.')[0] ?? path;
}
