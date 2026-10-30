import { FieldEventSchema, newClientEventId } from '@setu/contract';
import type { FieldEvent } from '@setu/contract';

export type ReportKind = 'flood_report' | 'road_blockage' | 'road_cleared' | 'water_level';
export const REPORT_KINDS: { type: ReportKind; label: string }[] = [
  { type: 'flood_report', label: 'Flooding' },
  { type: 'road_blockage', label: 'Road blocked' },
  { type: 'road_cleared', label: 'Road cleared' },
  { type: 'water_level', label: 'Water level' },
];

export interface ReportValues {
  type: ReportKind;
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
  type: 'flood_report', roadId: '', blockage: 'full', cause: '', severity: '3', depthCm: '', areaId: '',
  levelCm: '', trend: 'rising', gaugeId: '', lat: '', lng: '', note: '', photoName: '',
};

export interface Identity { reporterId: string; deviceId: string }
export type BuildResult = { ok: true; event: FieldEvent } | { ok: false; errors: { path: string; message: string }[] };

const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));
const str = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim());

/** Converts raw form strings to a contract event and validates it with the shared zod schema. */
export function buildReportEvent(v: ReportValues, id: Identity, clientEventId: string, occurredAt = new Date().toISOString()): BuildResult {
  const lat = num(v.lat);
  const lng = num(v.lng);
  const common = {
    clientEventId,
    occurredAt,
    reporterId: id.reporterId,
    deviceId: id.deviceId,
    location: { lat, lng },
    note: str(v.note),
    photoRefs: str(v.photoName) ? [v.photoName.trim()] : undefined,
  };
  let raw: Record<string, unknown>;
  switch (v.type) {
    case 'flood_report':
      raw = { ...common, type: v.type, severity: num(v.severity), depthCm: num(v.depthCm), areaId: str(v.areaId) };
      break;
    case 'road_blockage':
      raw = { ...common, type: v.type, roadId: str(v.roadId), blockage: v.blockage, cause: str(v.cause) };
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
  const v: ReportValues = { ...EMPTY_REPORT, lat: String(e.location.lat), lng: String(e.location.lng), note: e.note ?? '', photoName: e.photoRefs?.[0] ?? '' };
  switch (e.type) {
    case 'flood_report':
      return { ...v, type: e.type, severity: String(e.severity), depthCm: e.depthCm?.toString() ?? '', areaId: e.areaId ?? '' };
    case 'road_blockage':
      return { ...v, type: e.type, roadId: e.roadId ?? '', blockage: e.blockage, cause: e.cause ?? '' };
    case 'road_cleared':
      return { ...v, type: e.type, roadId: e.roadId };
    case 'water_level':
      return { ...v, type: e.type, levelCm: String(e.levelCm), trend: e.trend, gaugeId: e.gaugeId ?? '' };
    default:
      return v;
  }
}

export const freshId = newClientEventId;

/** Maps a zod issue path onto the visible form field key. */
export function fieldKeyForPath(path: string): string {
  if (path.startsWith('location.lat')) return 'lat';
  if (path.startsWith('location.lng')) return 'lng';
  return path.split('.')[0] ?? path;
}
