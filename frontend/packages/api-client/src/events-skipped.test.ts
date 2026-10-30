import { describe, expect, it } from 'vitest';
import { createHttpApiClient } from './http.js';

const valid = {
  eventId: 'evt_1',
  event: {
    clientEventId: '2c7cd4dc-f5ee-4380-b21f-068e3c0564dd', type: 'flood_report', occurredAt: '2026-10-30T10:00:00Z',
    reporterId: 'r1', deviceId: 'd1', location: { lat: 26.9, lng: 94.1 }, severity: 2,
  },
  serverState: 'applied', receivedAt: '2026-10-30T10:00:01Z', appliedAtVersion: 3,
};
// Internal-envelope style record: clientEventId is a ULID, not a UUID (live backend issue #22).
const bad = { ...valid, eventId: 'evt_2', event: { ...valid.event, clientEventId: '06GRTDY13XGYWMK9J2TGCC7GNR' } };

const clientWith = (events: unknown[], onSkipped?: (i: { skipped: number; total: number; firstIssue?: string }) => void) =>
  createHttpApiClient({
    baseUrl: 'http://x',
    fetch: (async () => new Response(JSON.stringify({ events }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
    ...(onSkipped ? { onSkippedRecords: onSkipped } : {}),
  });

describe('listEvents with records that fail contract validation', () => {
  it('returns the valid records and reports how many were skipped, never failing the whole list', async () => {
    const seen: Array<{ skipped: number; total: number; firstIssue?: string }> = [];
    const out = await clientWith([valid, bad, bad], (i) => seen.push(i)).listEvents();
    expect(out.map((e) => e.eventId)).toEqual(['evt_1']);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ skipped: 2, total: 3 });
    expect(seen[0]!.firstIssue).toContain('clientEventId');
  });

  it('reports zero skipped when everything is valid', async () => {
    const seen: number[] = [];
    const out = await clientWith([valid], (i) => seen.push(i.skipped)).listEvents();
    expect(out).toHaveLength(1);
    expect(seen).toEqual([0]);
  });
});
