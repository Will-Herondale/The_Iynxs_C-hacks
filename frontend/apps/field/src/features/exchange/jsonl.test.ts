import { describe, expect, it } from 'vitest';
import { FieldEventSchema, newClientEventId, type FieldEvent } from '@setu/contract';
import { classify, exportJsonl, MAX_LINES, parseJsonl } from './jsonl';

const mk = (over: Record<string, unknown> = {}): FieldEvent =>
  FieldEventSchema.parse({
    clientEventId: newClientEventId(), occurredAt: '2026-10-30T10:00:00Z', reporterId: 'r1', deviceId: 'd1',
    location: { lat: 26.14, lng: 91.73, accuracyM: 8 }, type: 'flood_report', severity: 3, ...over,
  });

describe('jsonl', () => {
  it('round-trips with order by createdAt and trailing newline', () => {
    const a = mk(); const b = mk(); const c = mk();
    const out = exportJsonl([{ event: b, createdAt: 2 }, { event: c, createdAt: 3 }, { event: a, createdAt: 1 }]);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.split('\n')).toHaveLength(4);
    const p = parseJsonl(out);
    expect(p.lines.map((l) => l.event)).toEqual([a, b, c]);
    expect(exportJsonl([])).toBe('');
  });
  it('tolerates blank lines, CRLF, BOM; reports real line numbers', () => {
    const a = mk();
    const t = `${String.fromCharCode(0xfeff)}${JSON.stringify(a)}\r\n\r\n{bad\r\n${JSON.stringify({ ...a, severity: 9 })}\r\n`;
    const p = parseJsonl(t);
    expect(p.lines.map((l) => l.lineNo)).toEqual([1, 3, 4]);
    expect(p.lines[0]!.event).toEqual(a);
    expect(p.lines[1]!.error![0]!.message).toMatch(/Invalid JSON/);
    expect(p.lines[2]!.error![0]).toMatchObject({ path: 'severity' });
  });
  it('classifies duplicates, repeats and rejects', () => {
    const a = mk(); const b = mk();
    const p = parseJsonl([a, b, a, 'nope'].map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n'));
    const r = classify(p.lines, [b.clientEventId]);
    expect(r.map((x) => x.result)).toEqual(['accepted', 'duplicate', 'duplicate', 'rejected']);
    expect(r[0]!.clientEventId).toBe(a.clientEventId);
    expect(r[3]!.errors!.length).toBeGreaterThan(0);
  });
  it('enforces limits', () => {
    expect(parseJsonl('x'.repeat(5 * 1024 * 1024 + 1)).fileError).toMatch(/5 MB/);
    const many = Array(MAX_LINES + 1).fill('{}').join('\n');
    expect(parseJsonl(many).fileError).toMatch(/too many/);
    const ok = Array(MAX_LINES).fill(JSON.stringify(mk())).join('\n') + '\n';
    expect(parseJsonl(ok).fileError).toBeUndefined();
  });
  it('fuzz: never throws on garbage; valid output only contains schema-valid events', () => {
    const junk = ['', '[]', 'null', '123', '"s"', '{"type":"flood_report"}', '\u0000', '{"a":', '{}', JSON.stringify(mk())];
    for (let i = 0; i < 200; i++) {
      const text = Array.from({ length: 8 }, () => junk[Math.floor(Math.random() * junk.length)]).join(i % 2 ? '\r\n' : '\n');
      const p = parseJsonl(text);
      for (const l of p.lines) expect(Boolean(l.event) !== Boolean(l.error)).toBe(true);
      classify(p.lines, []);
    }
  });
});
