// Restart-recovery tests: the server must rebuild its event indices,
// projections and idempotency mappings from log.jsonl on startup.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Server } from 'node:http';
import { startServer, stopServer } from './server';

let server: Server;
let baseUrl: string;
let logDir: string;
let firstClientEventId = '';
let firstEventId = '';
let secondClientEventId = '';

async function listen(): Promise<void> {
  server = await startServer(0, undefined, { logDir });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
}

async function fetchJson(path: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch(baseUrl + path, {
    method: opts.method ?? 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

const floodAtDemoBridge = (clientEventId: string) => ({
  clientEventId,
  type: 'flood_report',
  occurredAt: new Date().toISOString(),
  reporterId: 'recovery-test',
  deviceId: 'device-recovery-01',
  location: { lat: 26.8005, lng: 94.5005, accuracyM: 10 },
  severity: 3,
  depthCm: 50,
});

beforeAll(async () => {
  logDir = await mkdtemp(join(tmpdir(), 'setu-recovery-test-'));
  await listen();
});

afterAll(async () => {
  if (server) await stopServer(server);
  await rm(logDir, { recursive: true, force: true });
});

describe('event log recovery', () => {
  it('recovers events, projections, versions and duplicate detection after restart', async () => {
    const clientEventId = randomUUID();
    firstClientEventId = clientEventId;

    const first = await fetchJson('/api/v1/events:batch', {
      method: 'POST',
      body: { events: [floodAtDemoBridge(clientEventId)] },
    });
    expect(first.status).toBe(200);
    const ack = first.body.acks[0] as { result: string; eventId: string; acceptedAtVersion: number };
    expect(ack.result).toBe('accepted');
    expect(ack.acceptedAtVersion).toBe(1);
    firstEventId = ack.eventId;

    const before = await fetchJson('/api/v1/projections');
    expect(before.body.version).toBe(1);
    const bridgeBefore = before.body.roads.features.find(
      (f: any) => f.properties.roadId === 'syn-bridge-1',
    );
    expect(bridgeBefore.properties.status).toBe('blocked');

    // Restart on the same log directory.
    await stopServer(server);
    await listen();

    const health = await fetchJson('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ ok: true, eventCount: 1, projectionVersion: 1 });

    // Same clientEventId is still recognised as a duplicate with the same id.
    const duplicate = await fetchJson('/api/v1/events:batch', {
      method: 'POST',
      body: { events: [floodAtDemoBridge(clientEventId)] },
    });
    expect(duplicate.body.acks[0]).toMatchObject({
      clientEventId,
      result: 'duplicate',
      eventId: ack.eventId,
    });

    const restored = await fetchJson('/api/v1/projections');
    expect(restored.body.version).toBe(1);
    const bridge = restored.body.roads.features.find(
      (f: any) => f.properties.roadId === 'syn-bridge-1',
    );
    expect(bridge.properties.status).toBe('blocked');
    expect(bridge.properties.sourceEventIds).toContain(firstClientEventId);

    const settlement = restored.body.settlements.features.find(
      (f: any) => f.properties.settlementId === 'syn-settlement-1',
    );
    expect(settlement.properties.accessibility).toBe('cut_off');
    expect(settlement.properties.cutOffReason).toMatchObject({ sourceEventIds: [firstClientEventId] });

    const route = restored.body.routes.features.find(
      (f: any) => f.properties.routeId === 'syn-evac-1',
    );
    expect(route.properties.status).toBe('unavailable');
    expect(route.properties.refusal).toMatchObject({
      blockingFeatureIds: ['syn-bridge-1'],
      sourceEventIds: [firstClientEventId],
    });
    expect(route.properties.refusal.summary).toContain('blocked');

    const events = await fetchJson('/api/v1/events?type=flood_report');
    const firstRecord = events.body.events.find(
      (r: any) => r.event.clientEventId === clientEventId,
    );
    expect(firstRecord).toMatchObject({
      eventId: firstEventId,
      appliedAtVersion: 1,
    });

    const status = await fetchJson('/api/v1/events/status', {
      method: 'POST',
      body: { clientEventIds: [clientEventId] },
    });
    expect(status.body.statuses[0]).toMatchObject({
      state: 'applied',
      eventId: firstEventId,
      projectionVersion: 1,
    });
  });

  it('keeps projection versions monotonic and reports each event’s own applied version', async () => {
    secondClientEventId = randomUUID();
    const second = await fetchJson('/api/v1/events:batch', {
      method: 'POST',
      body: { events: [floodAtDemoBridge(secondClientEventId)] },
    });
    expect(second.body.acks[0]).toMatchObject({ result: 'accepted', acceptedAtVersion: 2 });

    const snapshot = await fetchJson('/api/v1/projections');
    expect(snapshot.body.version).toBe(2);

    const events = await fetchJson('/api/v1/events?type=flood_report');
    const firstRecord = events.body.events.find(
      (r: any) => r.event.clientEventId === firstClientEventId,
    );
    const secondRecord = events.body.events.find(
      (r: any) => r.event.clientEventId === secondClientEventId,
    );
    expect(firstRecord.appliedAtVersion).toBe(1);
    expect(secondRecord.appliedAtVersion).toBe(2);

    const status = await fetchJson('/api/v1/events/status', {
      method: 'POST',
      body: { clientEventIds: [firstClientEventId, secondClientEventId] },
    });
    expect(status.body.statuses).toEqual([
      expect.objectContaining({ eventId: firstEventId, projectionVersion: 1 }),
      expect.objectContaining({ projectionVersion: 2 }),
    ]);
  });
});
