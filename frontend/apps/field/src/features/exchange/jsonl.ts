import { FieldEventSchema, type FieldEvent, type ValidationIssue } from '@setu/contract';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_LINES = 5000;

/** SubmitAck-shaped per-line result (eventId/acceptedAtVersion are server-assigned, so absent here). */
export interface ExchangeResult {
  clientEventId: string;
  result: 'accepted' | 'duplicate' | 'rejected';
  eventId?: string;
  errors?: ValidationIssue[];
}

export interface ParsedLine {
  lineNo: number;
  event?: FieldEvent;
  error?: ValidationIssue[];
}

export interface ParseResult {
  lines: ParsedLine[];
  /** Set when the whole file is refused (too big / too many lines); `lines` is then empty. */
  fileError?: string;
}

export interface ClassifiedLine extends ExchangeResult {
  lineNo: number;
  event?: FieldEvent;
}

/** An event, or an event with queue metadata used only for ordering. */
export type ExportItem = FieldEvent | { event: FieldEvent; createdAt?: number | string };

const sortKey = (i: ExportItem): { t: number; ev: FieldEvent } => {
  if ('event' in i && i.event && typeof i.event === 'object') {
    const t = typeof i.createdAt === 'number' ? i.createdAt : Date.parse(String(i.createdAt ?? i.event.occurredAt));
    return { t: Number.isNaN(t) ? 0 : t, ev: i.event };
  }
  const ev = i as FieldEvent;
  const t = Date.parse(ev.occurredAt);
  return { t: Number.isNaN(t) ? 0 : t, ev };
};

/** One wire FieldEvent per line, ordered by createdAt (then clientEventId), trailing newline. Empty → ''. */
export function exportJsonl(items: ExportItem[]): string {
  const rows = items.map(sortKey).sort((a, b) => a.t - b.t || a.ev.clientEventId.localeCompare(b.ev.clientEventId));
  return rows.map((r) => JSON.stringify(r.ev) + '\n').join('');
}

export function parseJsonl(text: string): ParseResult {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_BYTES) {
    return { lines: [], fileError: `File is too large (${(bytes / 1048576).toFixed(1)} MB). The limit is 5 MB.` };
  }
  const raw = text.split(/\r?\n/);
  if (raw.filter((l) => l.trim() !== '').length > MAX_LINES) {
    return { lines: [], fileError: `File has too many lines. The limit is ${MAX_LINES} events.` };
  }
  const lines: ParsedLine[] = [];
  raw.forEach((l, idx) => {
    if (l.trim() === '') return;
    const lineNo = idx + 1;
    let json: unknown;
    try {
      json = JSON.parse(l);
    } catch (e) {
      lines.push({ lineNo, error: [{ path: '', message: `Invalid JSON: ${(e as Error).message}` }] });
      return;
    }
    const r = FieldEventSchema.safeParse(json);
    if (r.success) lines.push({ lineNo, event: r.data });
    else lines.push({ lineNo, error: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  });
  return { lines };
}

/** Pure classification: duplicate = id already known or repeated earlier in the file; rejected = invalid. */
export function classify(lines: ParsedLine[], existingIds: Iterable<string>): ClassifiedLine[] {
  const seen = new Set(existingIds);
  return lines.map((l) => {
    if (!l.event) return { lineNo: l.lineNo, clientEventId: '', result: 'rejected' as const, errors: l.error ?? [] };
    const id = l.event.clientEventId;
    if (seen.has(id)) return { lineNo: l.lineNo, clientEventId: id, result: 'duplicate' as const, event: l.event };
    seen.add(id);
    return { lineNo: l.lineNo, clientEventId: id, result: 'accepted' as const, event: l.event };
  });
}
