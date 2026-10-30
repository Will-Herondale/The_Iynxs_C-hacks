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
import { totalOrder, type Envelope } from '../../core/src/index';
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
    // Idempotency: check if clientEventId already known
    const existingEventId = clientEventMappings.get(event.clientEventId);
    if (existingEventId) {
      acks.push({
        clientEventId: event.clientEventId,
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
        clientEventId: event.clientEventId,
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
        clientEventId: event.clientEventId,
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
        clientEventId: event.clientEventId,
        result: 'rejected',
        errors: [
          { path: 'payload', message: `Append failed: ${(err as Error).message}` },
        ],
      });
      continue;
    }

    // Record mapping
    clientEventMappings.set(event.clientEventId, appended.id);

    // The event is accepted; it will be applied to projections on next read
    // acceptedAtVersion = version AFTER apply (we assign at apply time)
    acks.push({
      clientEventId: event.clientEventId,
      result: 'accepted',
      eventId: appended.id,
      acceptedAtVersion: projectionVersion + 1,
    });
  }

  // Bump projection version if any events were accepted
  const acceptedCount = acks.filter((a) => a.result === 'accepted').length;
  if (acceptedCount > 0) {
    projectionVersion++;
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
      projectionVersion: projectionVersion,
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

  const events = log.getAllEvents().sort(totalOrder);
  const snapshot = projectSnapshot(events, artifacts, Date.now());

  if (since > 0 && snapshot.version <= since) {
    res.writeHead(304, { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  sendJson(res, 200, snapshot);
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

  const events = log.getAllEvents().sort(totalOrder);

  let filtered = events;
  if (sinceVersion) {
    const since = Number(sinceVersion);
    filtered = filtered.filter((e) => e.hlc.l > since);
  }
  if (type) {
    filtered = filtered.filter((e) => e.type === type);
  }
  filtered = filtered.slice(0, limit);

  const records = filtered.map((env) => ({
    eventId: env.id,
    event: env.payload,
    serverState: 'applied' as const,
    receivedAt: new Date(env.at).toISOString(),
    appliedAtVersion: projectionVersion,
  }));

  sendJson(res, 200, { events: records });
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

    if (req.method === 'GET' && url === '/health') {
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

export async function startServer(
  port: number = PORT,
  geoArtifacts?: GeoArtifacts,
): Promise<Server> {
  artifacts = geoArtifacts ?? (await loadGeoArtifacts());
  log = new EventLog(LOG_DIR);
  await log.load();

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
