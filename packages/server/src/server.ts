// SETU backend server — HTTP adapter for /api/v1/* endpoints.
//
// Implements the integration contract (docs/coordination/integration-contract.md):
//   POST /api/v1/events:batch   — submit field events → { acks: SubmitAck[] }
//   POST /api/v1/events/status   — get event status → { statuses: EventStatus[] }
//   GET  /api/v1/projections     — get projection snapshot
//   GET  /api/v1/events          — list event records
//   GET  /api/v1/stream          — SSE stream of version bumps
//
// The server translates wire format (FieldEvent) → internal envelope (Envelope)
// at the API boundary. The fold never sees floats or ISO strings.

import { createServer, type Server } from 'node:http';
import { EventLog } from './event-log';
import { translateEvent } from './translation';
import { projectSnapshot, type GeoArtifacts } from './projection';
import { loadGeoArtifacts } from './geo-artifacts';
import { type Envelope } from '../../core/src/index';
import {
  type SubmitAck,
  type EventStatus,
  type FieldEvent,
} from './contract-types';

const PORT = Number(process.env.SETU_PORT) || 8080;
const LOG_DIR = process.env.SETU_LOG_DIR || './data';
const MAX_EVENTS_PER_BATCH = 500;

// In-memory state
let log: EventLog | null = null;
let artifacts: GeoArtifacts | null = null;
let clientEventMappings = new Map<string, string>(); // clientEventId → eventId
let eventIdToClientEventId = new Map<string, string>(); // eventId → clientEventId
let projectionVersion = 0;
let sseClients = new Set<(data: string) => void>();

// ── SSE broadcast ──────────────────────────────────────────────────────

function broadcastVersion(version: number): void {
  const data = JSON.stringify({ type: 'version', version });
  for (const cb of sseClients) {
    try {
      cb(data);
    } catch {
      // Client disconnected — will be cleaned up on next send
    }
  }
}

// ── HTTP helpers ───────────────────────────────────────────────────────

function sendJson(
  res: import('node:http').ServerResponse,
  status: number,
  body: unknown,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json).toString(),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(json);
}

function readBody(req: import('node:http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Route handlers ─────────────────────────────────────────────────────

async function handleEventsBatch(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  if (!log || !artifacts) {
    sendJson(res, 503, { error: 'Server not initialized' });
    return;
  }

  let body: { events: FieldEvent[] };
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw.toString());
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!Array.isArray(body.events)) {
    sendJson(res, 400, { error: 'events must be an array' });
    return;
  }

  if (body.events.length > MAX_EVENTS_PER_BATCH) {
    sendJson(res, 400, {
      error: `Too many events: max ${MAX_EVENTS_PER_BATCH} per batch`,
    });
    return;
  }

  const acks: SubmitAck[] = [];
  const vv = log.getVersionVector();

  for (const event of body.events) {
    const clientEventId = typeof event?.clientEventId === 'string' ? event.clientEventId : '';
    if (!isValidUuid(clientEventId)) {
      acks.push({
        clientEventId,
        result: 'rejected',
        errors: [{ path: 'clientEventId', message: 'Must be a UUID v4' }],
      });
      continue;
    }

    // Idempotency: check if clientEventId already known
    const existingEventId = clientEventMappings.get(clientEventId);
    if (existingEventId) {
      acks.push({
        clientEventId,
        result: 'duplicate',
        eventId: existingEventId,
      });
      continue;
    }

    // Translate wire format → internal envelope input
    let envInput;
    try {
      envInput = translateEvent(event);
    } catch (err) {
      acks.push({
        clientEventId,
        result: 'rejected',
        errors: [
          { path: 'type', message: `Translation failed: ${(err as Error).message}` },
        ],
      });
      continue;
    }

    // Assign seq = hwm + 1 for this origin
    const origin = envInput.origin;
    const currentHwm = log.getHwm(origin);
    envInput.seq = currentHwm + 1;
    envInput.vv = { ...vv };

    // Check for hash collision: same origin+seq already exists
    const existing = log.getEventByOriginSeq(origin, envInput.seq);
    if (existing) {
      acks.push({
        clientEventId,
        result: 'conflict',
        eventId: existing.id,
        reason: `Origin ${origin} already has event at seq ${envInput.seq}`,
      });
      continue;
    }

    // Append to log
    let appended: Envelope;
    try {
      appended = await log.append(envInput);
    } catch (err) {
      acks.push({
        clientEventId,
        result: 'rejected',
        errors: [
          { path: 'payload', message: `Append failed: ${(err as Error).message}` },
        ],
      });
      continue;
    }

    // Record mapping
    clientEventMappings.set(clientEventId, appended.id);
    eventIdToClientEventId.set(appended.id, clientEventId);

    // The event is accepted; it will be applied to projections on next read.
    // One accepted event = one version bump, so the projection version always
    // equals the number of applied events (and stays monotonic across restarts).
    projectionVersion++;
    acks.push({
      clientEventId,
      result: 'accepted',
      eventId: appended.id,
      acceptedAtVersion: projectionVersion,
    });
  }

  // Notify subscribers once per batch, after all events in it were appended.
  const acceptedCount = acks.filter((a) => a.result === 'accepted').length;
  if (acceptedCount > 0) {
    broadcastVersion(projectionVersion);
  }

  sendJson(res, 200, { acks });
}

async function handleEventsStatus(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  if (!log) {
    sendJson(res, 503, { error: 'Server not initialized' });
    return;
  }

  let body: { clientEventIds: string[] };
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw.toString());
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!Array.isArray(body.clientEventIds)) {
    sendJson(res, 400, { error: 'clientEventIds must be an array' });
    return;
  }

  const statuses: EventStatus[] = [];
  for (const clientEventId of body.clientEventIds) {
    const eventId = clientEventMappings.get(clientEventId);
    if (!eventId) {
      statuses.push({
        clientEventId,
        state: 'unknown',
      });
      continue;
    }

    const env = log.getEvent(eventId);
    if (!env) {
      statuses.push({
        clientEventId,
        eventId,
        state: 'accepted',
      });
      continue;
    }

    statuses.push({
      clientEventId,
      eventId,
      state: 'applied',
      projectionVersion: log.getAppliedVersion(eventId) ?? projectionVersion,
    });
  }

  sendJson(res, 200, { statuses });
}

function handleProjections(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): void {
  if (!log || !artifacts) {
    sendJson(res, 503, { error: 'Server not initialized' });
    return;
  }

  const url = new URL(req.url!, 'http://localhost');
  const sinceVersion = url.searchParams.get('sinceVersion');
  const since = sinceVersion ? Number(sinceVersion) : 0;

  const events = [...log.getAllEvents()]
    .map((env, index) => ({ env, index }))
    .sort((a, b) => b.env.at - a.env.at || b.index - a.index)
    .map(({ env }) => env);
  const snapshot = projectSnapshot(events, artifacts, Date.now(), projectionVersion);

  if (since > 0 && snapshot.version <= since) {
    res.writeHead(304, { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  sendJson(res, 200, snapshot);
}

/** UUID v4 regex — clientEventId must be a valid UUID per the wire contract. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

/**
 * Translate an internal envelope back to wire format (FieldEvent) for the
 * event list endpoint. The internal envelope stores obs.water/obs.road types
 * with integer payloads; the wire format uses flood_report/road_blockage etc.
 * with float-friendly fields.
 *
 * Returns null when the event cannot be translated to a valid wire-format
 * FieldEvent (e.g. no recoverable clientEventId — pre-fix events stored
 * before client_event_id was added to the payload). Callers must filter out
 * null results.
 */
function translateEnvelopeToWire(env: Envelope): { event: FieldEvent; eventId: string } | null {
  const p = env.payload as Record<string, unknown>;
  // Prefer client_event_id stored in payload (new events); fall back to the
  // eventId→clientEventId map (old events created before this fix).
  const clientEventId =
    (typeof p.client_event_id === 'string' ? p.client_event_id : undefined) ??
    eventIdToClientEventId.get(env.id);

  if (!isValidUuid(clientEventId)) return null;

  const base: Record<string, unknown> = {
    clientEventId,
    type: env.type,
    occurredAt: new Date(env.at).toISOString(),
    reporterId: env.actor.id,
    deviceId: env.origin,
    location: {
      lat: (typeof p.lat === 'number' ? p.lat : 0) / 1_000_000,
      lng: (typeof p.lng === 'number' ? p.lng : 0) / 1_000_000,
    },
  };

  switch (env.type) {
    case 'obs.water': {
      return {
        eventId: env.id,
        event: {
          ...base,
          type: 'flood_report',
          severity: typeof p.severity === 'number' ? p.severity : 3,
          ...(typeof p.depth_dm === 'number'
            ? { depthCm: Math.round(p.depth_dm * 10) }
            : {}),
          ...(typeof p.area_id === 'string' ? { areaId: p.area_id } : {}),
        } as unknown as FieldEvent,
      };
    }
    case 'obs.road': {
      return {
        eventId: env.id,
        event: {
          ...base,
          type: p.state === 'open' ? 'road_cleared' : 'road_blockage',
          ...(typeof p.edge_id === 'string' ? { roadId: p.edge_id } : {}),
          blockage: p.state === 'blocked' ? 'full' : 'partial',
        } as unknown as FieldEvent,
      };
    }
    default:
      // Internal registry/matching events are not part of the v1 FieldEvent
      // wire contract. Do not emit a malformed discriminant or fabricate
      // household fields merely to make legacy records parse.
      return null;
    }
}

async function handleListEvents(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  if (!log) {
    sendJson(res, 503, { error: 'Server not initialized' });
    return;
  }

  const url = new URL(req.url!, 'http://localhost');
  const sinceVersion = url.searchParams.get('sinceVersion');
  const limit = Number(url.searchParams.get('limit') || '50');
  const type = url.searchParams.get('type');

  const events = [...log.getAllEvents()]
    .map((env, index) => ({ env, index }))
    .sort((a, b) => b.env.at - a.env.at || b.index - a.index)
    .map(({ env }) => env);

  // Wire format type → internal envelope type mapping
  const wireToInternalType: Record<string, string> = {
    flood_report: 'obs.water',
    water_level: 'obs.water',
    road_blockage: 'obs.road',
    road_cleared: 'obs.road',
    household_registration: 'person.register',
  };

  let filtered = events;
  if (sinceVersion) {
    const since = Number(sinceVersion);
    filtered = filtered.filter((e) => e.hlc.l > since);
  }
  if (type) {
    const internalType = wireToInternalType[type];
    if (internalType) {
      filtered = filtered.filter((e) => e.type === internalType);
    }
  }
  const omittedByType: Record<string, number> = {};
  const records: Array<{
    eventId: string;
    event: FieldEvent;
    serverState: 'applied';
    receivedAt: string;
    appliedAtVersion: number;
  }> = [];

  // Translate before applying the page limit. Unsupported internal events must
  // not consume slots that should contain valid v1 audit records.
  for (const env of filtered) {
    const translated = translateEnvelopeToWire(env);
    if (!translated) {
      omittedByType[env.type] = (omittedByType[env.type] ?? 0) + 1;
      continue;
    }
    if (records.length >= limit) continue;
    records.push({
      eventId: env.id,
      event: translated.event,
      serverState: 'applied',
      receivedAt: new Date(env.at).toISOString(),
      appliedAtVersion: log!.getAppliedVersion(env.id) ?? projectionVersion,
    });
  }

  const omittedTotal = Object.values(omittedByType).reduce((sum, count) => sum + count, 0);
  sendJson(res, 200, {
    events: records,
    omitted: omittedTotal > 0 ? { total: omittedTotal, byType: omittedByType } : undefined,
  });
}

function handleStream(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): void {
  if (!log) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Server not initialized');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(`data: ${JSON.stringify({ type: 'version', version: projectionVersion })}\n\n`);

  let closed = false;

  const cb = (data: string) => {
    if (closed) return;
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      closed = true;
      sseClients.delete(cb);
    }
  };

  sseClients.add(cb);

  req.on('close', () => {
    closed = true;
    sseClients.delete(cb);
    try {
      res.end();
    } catch {
      // ignore
    }
  });

  req.on('error', () => {
    closed = true;
    sseClients.delete(cb);
  });
}

// ── Route dispatch ─────────────────────────────────────────────────────

async function handleRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  const url = req.url!;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  try {
    if (req.method === 'POST' && url === '/api/v1/events:batch') {
      await handleEventsBatch(req, res);
      return;
    }

    if (req.method === 'POST' && url === '/api/v1/events/status') {
      await handleEventsStatus(req, res);
      return;
    }

    if (req.method === 'GET' && url.startsWith('/api/v1/projections')) {
      handleProjections(req, res);
      return;
    }

    if (req.method === 'GET' && url.startsWith('/api/v1/events')) {
      await handleListEvents(req, res);
      return;
    }

    if (req.method === 'GET' && url === '/api/v1/stream') {
      handleStream(req, res);
      return;
    }

    // /api/v1/health is the path the field app probes; /health stays for
    // backwards compatibility with earlier scripts.
    if (req.method === 'GET' && (url === '/health' || url === '/api/v1/health')) {
      sendJson(res, 200, {
        ok: true,
        eventCount: log ? log.count : 0,
        projectionVersion,
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Request handler error:', err);
    if (!res.writableEnded) {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
}

// ── Server lifecycle ───────────────────────────────────────────────────

export interface StartServerOptions {
  /** Directory holding log.jsonl. Defaults to SETU_LOG_DIR or ./data. */
  logDir?: string;
}

/**
 * Rebuild runtime state that is derived from the event log after loading it.
 * Without this, a restart forgets clientEventId → eventId idempotency mappings
 * and reports projectionVersion 0 even though events were recovered.
 */
function restoreStateFromLog(): void {
  if (!log) return;

  clientEventMappings.clear();
  eventIdToClientEventId.clear();

  for (const env of log.getAllEvents()) {
    const clientEventId = (env.payload as Record<string, unknown> | null)
      ?.client_event_id;
    if (typeof clientEventId !== 'string' || clientEventId.length === 0) {
      continue;
    }
    clientEventMappings.set(clientEventId, env.id);
    eventIdToClientEventId.set(env.id, clientEventId);
  }

  // One accepted event = one version bump in handleEventsBatch, so the event
  // count is a monotonic projection version after a restart. It can never be
  // lower than the previous process's batch count.
  projectionVersion = log.count;
}

export async function startServer(
  port: number = PORT,
  geoArtifacts?: GeoArtifacts,
  options: StartServerOptions = {},
): Promise<Server> {
  artifacts = geoArtifacts ?? (await loadGeoArtifacts());
  log = new EventLog(options.logDir ?? LOG_DIR);
  await log.load();
  restoreStateFromLog();

  const server = createServer(handleRequest);
  await new Promise<void>((resolve, reject) => {
    server.listen(port, () => {
      console.log(`SETU server listening on port ${port}`);
      resolve();
    });
    server.on('error', reject);
  });

  return server;
}

export async function stopServer(server: Server): Promise<void> {
  if (log) await log.close();
  sseClients.clear();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
