// Server integration tests for all 6 endpoints.
// Tests run against an in-memory server instance.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, stopServer } from './server';
import { type Server } from 'node:http';

let server: Server;
let baseUrl: string;
let logDir: string;

beforeAll(async () => {
  // Isolate test events from the live backend log.
  logDir = await mkdtemp(join(tmpdir(), 'setu-server-test-'));
  server = await startServer(0, undefined, { logDir }); // port 0 = random available port
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  if (server) await stopServer(server);
  if (logDir) await rm(logDir, { recursive: true, force: true });
});

async function fetchJson(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(baseUrl + path, {
    method: opts.method ?? 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : await res.text();
  return { status: res.status, body };
}

describe('SETU server endpoints', () => {
  beforeEach(async () => {
    // No clean state between tests — each test uses unique clientEventIds
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const { status, body } = await fetchJson('/health');
      expect(status).toBe(200);
      expect(body).toMatchObject({ ok: true });
    });
  });

  describe('POST /api/v1/events:batch', () => {
    it('accepts a valid flood_report event', async () => {
      const ceid = '550e8400-e29b-41d4-a716-446655440001';
      const { status, body } = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: {
          events: [
            {
              clientEventId: ceid,
              type: 'flood_report',
              occurredAt: '2026-10-30T14:03:31.074723+00:00',
              reporterId: 'volunteer-01',
              deviceId: 'device-01',
              location: { lat: 26.9586, lng: 94.1622, accuracyM: 10 },
              note: 'Test flood report',
              severity: 3,
              depthCm: 50,
              areaId: 'area-test',
            },
          ],
        },
      });
      expect(status).toBe(200);
      const acks = (body as { acks: Array<{ result: string; eventId?: string }> }).acks;
      expect(acks.length).toBe(1);
      expect(acks[0].result).toBe('accepted');
      expect(acks[0].eventId).toBeDefined();

      // The event list round-trips decimetres back to centimetres.
      const listed = await fetchJson('/api/v1/events?type=flood_report');
      const record = (listed.body as { events: Array<{ event: { clientEventId: string; depthCm?: number } }> })
        .events.find((e) => e.event.clientEventId === ceid);
      expect(record?.event.depthCm).toBe(50);
    });

    it('rejects invalid clientEventId before appending', async () => {
      const { status, body } = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: {
          events: [{
            clientEventId: 'not-a-uuid',
            type: 'flood_report',
            occurredAt: '2026-10-30T14:03:31.074723+00:00',
            reporterId: 'volunteer-invalid-id',
            deviceId: 'device-invalid-id',
            location: { lat: 26.9586, lng: 94.1622 },
            severity: 3,
          }],
        },
      });
      expect(status).toBe(200);
      expect(body).toMatchObject({ acks: [{ clientEventId: 'not-a-uuid', result: 'rejected' }] });
      const listed = await fetchJson('/api/v1/events');
      expect((listed.body as { events: Array<{ event: { clientEventId: string } }> }).events
        .some((e) => e.event.clientEventId === 'not-a-uuid')).toBe(false);
    });

    it('rejects invalid JSON body', async () => {
      const res = await fetch(baseUrl + '/api/v1/events:batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });
    it('rejects missing events array', async () => {
      const { status } = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: { notEvents: [] },
      });
      expect(status).toBe(400);
    });

    it('rejects duplicate clientEventId', async () => {
      const ceid = '550e8400-e29b-41d4-a716-446655440002';
      const event = {
        clientEventId: ceid,
        type: 'flood_report',
        occurredAt: '2026-10-30T14:03:31.074723+00:00',
        reporterId: 'volunteer-01',
        deviceId: 'device-dup-01',
        location: { lat: 26.9586, lng: 94.1622 },
        severity: 3,
      };
      const first = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: { events: [event] },
      });
      expect(first.status).toBe(200);
      const { status, body } = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: { events: [event] },
      });
      expect(status).toBe(200);
      const acks = (body as { acks: Array<{ result: string }> }).acks;
      expect(acks[0].result).toBe('duplicate');
    });

    it('rejects events exceeding batch limit', async () => {
      const events = Array.from({ length: 501 }, (_, i) => ({
        clientEventId: `test-batch-${i}`,
        type: 'flood_report',
        occurredAt: '2026-10-30T14:03:31.074723+00:00',
        reporterId: 'volunteer-01',
        deviceId: 'device-01',
        location: { lat: 26.9586, lng: 94.1622 },
        severity: 3,
      }));
      const { status } = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: { events },
      });
      expect(status).toBe(400);
    });
  });

  describe('POST /api/v1/events/status', () => {
    it('returns status for known clientEventId', async () => {
      const ceid = '550e8400-e29b-41d4-a716-446655440003';
      const event = {
        clientEventId: ceid,
        type: 'flood_report',
        occurredAt: '2026-10-30T14:03:31.074723+00:00',
        reporterId: 'volunteer-01',
        deviceId: 'device-status-01',
        location: { lat: 26.9586, lng: 94.1622 },
        severity: 3,
      };
      const first = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: { events: [event] },
      });
      expect(first.status).toBe(200);

      const { status, body } = await fetchJson('/api/v1/events/status', {
        method: 'POST',
        body: { clientEventIds: [ceid] },
      });
      expect(status).toBe(200);
      const statuses = (body as { statuses: Array<{ state: string }> }).statuses;
      expect(statuses[0].state).toBe('applied');
    });

    it('returns unknown for unknown clientEventId', async () => {
      const { status, body } = await fetchJson('/api/v1/events/status', {
        method: 'POST',
        body: { clientEventIds: ['nonexistent-id'] },
      });
      expect(status).toBe(200);
      const statuses = (body as { statuses: Array<{ state: string }> }).statuses;
      expect(statuses[0].state).toBe('unknown');
    });
  });

  describe('GET /api/v1/projections', () => {
    it('returns projection snapshot', async () => {
      const { status, body } = await fetchJson('/api/v1/projections');
      expect(status).toBe(200);
      expect(body).toMatchObject({
        version: expect.any(Number),
        flood: expect.any(Object),
        roads: expect.any(Object),
        settlements: expect.any(Object),
        routes: expect.any(Object),
        shelters: expect.any(Object),
      });
    });

    it('returns 304 when sinceVersion is current', async () => {
      // First get current version
      const { body: first } = await fetchJson('/api/v1/projections');
      const version = (first as { version: number }).version;

      // Request with sinceVersion = current version
      const res = await fetch(baseUrl + `/api/v1/projections?sinceVersion=${version}`);
      expect(res.status).toBe(304);
    });
  });

  describe('GET /api/v1/events', () => {
    it('returns list of event records', async () => {
      const { status, body } = await fetchJson('/api/v1/events');
      expect(status).toBe(200);
      expect(body).toMatchObject({ events: expect.any(Array) });
    });

    it('filters by type', async () => {
      const ceid = '550e8400-e29b-41d4-a716-446655440000';
      const event = {
        clientEventId: ceid,
        type: 'flood_report',
        occurredAt: '2026-10-30T14:03:31.074723+00:00',
        reporterId: 'volunteer-01',
        deviceId: 'device-type-01',
        location: { lat: 26.9586, lng: 94.1622 },
        severity: 3,
      };
      const first = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: { events: [event] },
      });
      expect(first.status).toBe(200);

      // Wire format after translation is 'flood_report' with areaId (not point_id)
      const { status, body } = await fetchJson('/api/v1/events?type=flood_report');
      expect(status).toBe(200);
      const events = (body as { events: Array<{ event: { type: string; areaId?: string; clientEventId: string } }> }).events;
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.find((e) => e.event.clientEventId === ceid)).toBeDefined();
    });

    it('does not emit unsupported person.register records as FieldEvents', async () => {
      const ceid = '550e8400-e29b-41d4-a716-446655440004';
      const first = await fetchJson('/api/v1/events:batch', {
        method: 'POST',
        body: {
          events: [{
            clientEventId: ceid,
            type: 'household_registration',
            occurredAt: '2026-10-30T14:03:31.074723+00:00',
            reporterId: 'volunteer-household',
            deviceId: 'device-household',
            location: { lat: 26.9586, lng: 94.1622 },
            householdId: '550e8400-e29b-41d4-a716-446655440005',
            headName: 'Demo Household',
            members: 2,
            vulnerable: { elderly: false, children: true, disabled: false, medical: false },
            needs: ['water'],
          }],
        },
      });
      expect(first.status).toBe(200);

      const listed = await fetchJson('/api/v1/events?limit=1');
      const body = listed.body as {
        events: Array<{ event: { type: string } }>;
        omitted?: { total: number; byType: Record<string, number> };
      };
      expect(body.events.every((record) => record.event.type !== 'person.register')).toBe(true);
      expect(body.omitted?.byType['person.register']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/stream', () => {
    it('returns SSE stream with correct headers', async () => {
      const res = await fetch(baseUrl + '/api/v1/stream');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('cache-control')).toContain('no-cache');
      // Close the response immediately
      res.body?.cancel();
    });
  });
});
