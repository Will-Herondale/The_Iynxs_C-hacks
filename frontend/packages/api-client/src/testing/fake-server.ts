/**
 * TEST UTILITY ONLY. In-memory Node server implementing exactly the 6 backend endpoints
 * (integration handoff §3). Starts EMPTY: it records events and bumps the version; it
 * invents no flood, road or route data.
 */
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { FieldEventSchema, type EventRecord, type FieldEvent, type ProjectionSnapshot, type SubmitAck } from '@setu/contract';
import type { EventSourceLike } from '../http.js';

export interface FakeServerOptions {
  port?: number;
  /** Added delay to every API response (ms). */
  latencyMs?: number;
  /** accepted → applied delay (ms). 0 = applied immediately. */
  applyDelayMs?: number;
  /** Next N API requests answer 503 (events:batch, status, projections, events, health). */
  fail5xx?: number;
  /** Predicate: matching events get a `conflict` ack. */
  conflict?: (e: FieldEvent) => boolean;
  /** Predicate: matching events get a `rejected` ack. */
  reject?: (e: FieldEvent) => boolean;
}

interface Stored {
  eventId: string;
  event: FieldEvent;
  state: EventRecord['serverState'];
  receivedAt: string;
  appliedAtVersion?: number;
}

export interface FakeServer {
  readonly url: string;
  readonly port: number;
  /** Mutable: change latency/5xx/conflict/reject at runtime. */
  readonly options: FakeServerOptions;
  readonly version: number;
  readonly records: readonly Stored[];
  /** Forget all events, back to version 0. */
  reset(): void;
  close(): Promise<void>;
}

const empty = (version: number, generatedAt: string) => ({ type: 'FeatureCollection' as const, version, generatedAt, features: [] });

export async function startFakeServer(options: FakeServerOptions = {}): Promise<FakeServer> {
  const opts: FakeServerOptions = { latencyMs: 0, applyDelayMs: 0, fail5xx: 0, ...options };
  let version = 0;
  let reserved = 0; // versions promised to accepted-but-unapplied events
  let seq = 0;
  let byClientId = new Map<string, Stored>();
  let timers: ReturnType<typeof setTimeout>[] = [];
  const streams = new Set<ServerResponse>();

  const broadcast = () => {
    for (const s of streams) s.write(`data: ${JSON.stringify({ type: 'version', version })}\n\n`);
  };
  const apply = (rec: Stored, v: number) => {
    rec.state = 'applied';
    rec.appliedAtVersion = v;
    version = Math.max(version, v);
    broadcast();
  };
  const snapshot = (): ProjectionSnapshot => {
    const t = new Date().toISOString();
    return { version, generatedAt: t, flood: empty(version, t), roads: empty(version, t), settlements: empty(version, t), routes: empty(version, t), shelters: empty(version, t) };
  };

  function ingest(raw: unknown): SubmitAck {
    const cid = String((raw as { clientEventId?: unknown } | null)?.clientEventId ?? '');
    const parsed = FieldEventSchema.safeParse(raw);
    if (!parsed.success) {
      return { clientEventId: cid, result: 'rejected', errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
    }
    const e = parsed.data;
    const known = byClientId.get(e.clientEventId);
    if (known) return { clientEventId: e.clientEventId, result: 'duplicate', eventId: known.eventId };
    const rec: Stored = { eventId: `evt_${++seq}`, event: e, state: 'accepted', receivedAt: new Date().toISOString() };
    byClientId.set(e.clientEventId, rec);
    if (opts.reject?.(e)) {
      rec.state = 'rejected';
      return { clientEventId: e.clientEventId, result: 'rejected', errors: [{ path: '', message: 'Rejected by fake server' }] };
    }
    if (opts.conflict?.(e)) {
      rec.state = 'conflict';
      return { clientEventId: e.clientEventId, result: 'conflict', eventId: rec.eventId, reason: 'Conflict injected by fake server' };
    }
    const v = ++reserved;
    if (!opts.applyDelayMs) apply(rec, v);
    else timers.push(setTimeout(() => apply(rec, v), opts.applyDelayMs));
    return { clientEventId: e.clientEventId, result: 'accepted', eventId: rec.eventId, acceptedAtVersion: v };
  }

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
  const send = (res: ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, { ...cors, ...(body === undefined ? {} : { 'content-type': 'application/json' }) });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<unknown>((resolve) => {
      let s = '';
      req.on('data', (c: Buffer) => (s += c));
      req.on('end', () => {
        try { resolve(JSON.parse(s || '{}')); } catch { resolve(undefined); }
      });
    });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const u = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'OPTIONS') return send(res, 204);
    if (u.pathname === '/api/v1/stream' && req.method === 'GET') {
      res.writeHead(200, { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'version', version })}\n\n`);
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }
    if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
    if (u.pathname.startsWith('/api/v1/') && (opts.fail5xx ?? 0) > 0) {
      opts.fail5xx!--;
      return send(res, 503, { error: 'injected failure' });
    }
    if (u.pathname === '/api/v1/health' && req.method === 'GET') return send(res, 200, { ok: true, eventCount: byClientId.size, projectionVersion: version });
    if (u.pathname === '/api/v1/projections' && req.method === 'GET') {
      const since = u.searchParams.get('sinceVersion');
      if (since !== null && version <= Number(since)) return send(res, 304);
      return send(res, 200, snapshot());
    }
    if (u.pathname === '/api/v1/events' && req.method === 'GET') {
      const since = u.searchParams.get('sinceVersion');
      const type = u.searchParams.get('type');
      const limit = Number(u.searchParams.get('limit') ?? 50);
      const events: EventRecord[] = [...byClientId.values()]
        .filter((r) => (type === null || r.event.type === type) && (since === null || (r.appliedAtVersion ?? Infinity) > Number(since)))
        .slice(0, limit)
        .map((r) => ({ eventId: r.eventId, event: r.event, serverState: r.state, receivedAt: r.receivedAt, ...(r.appliedAtVersion === undefined ? {} : { appliedAtVersion: r.appliedAtVersion }) }));
      return send(res, 200, { events });
    }
    if (u.pathname === '/api/v1/events:batch' && req.method === 'POST') {
      const body = (await readBody(req)) as { events?: unknown } | undefined;
      if (!body || !Array.isArray(body.events)) return send(res, 400, { error: 'events[] required' });
      return send(res, 200, { acks: body.events.map(ingest) });
    }
    if (u.pathname === '/api/v1/events/status' && req.method === 'POST') {
      const body = (await readBody(req)) as { clientEventIds?: unknown } | undefined;
      if (!body || !Array.isArray(body.clientEventIds)) return send(res, 400, { error: 'clientEventIds[] required' });
      const statuses = body.clientEventIds.map((id) => {
        const r = byClientId.get(String(id));
        if (!r) return { clientEventId: String(id), state: 'unknown' as const };
        return { clientEventId: String(id), eventId: r.eventId, state: r.state, ...(r.appliedAtVersion === undefined ? {} : { projectionVersion: r.appliedAtVersion }) };
      });
      return send(res, 200, { statuses });
    }
    send(res, 404, { error: 'not found' });
  }

  const server: Server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    options: opts,
    get version() { return version; },
    get records() { return [...byClientId.values()]; },
    reset() {
      timers.forEach(clearTimeout);
      timers = [];
      byClientId = new Map();
      version = reserved = seq = 0;
      broadcast();
    },
    close: () =>
      new Promise<void>((r) => {
        timers.forEach(clearTimeout);
        for (const s of streams) s.end();
        server.close(() => r());
        server.closeAllConnections();
      }),
  };
}

/** Node EventSource stand-in for tests (Node has no global EventSource). */
export function createNodeEventSource(url: string): EventSourceLike {
  const es: EventSourceLike = { onopen: null, onmessage: null, onerror: null, close: () => req.destroy() };
  let closed = false;
  const req = httpRequest(url, { headers: { accept: 'text/event-stream' } }, (res) => {
    es.onopen?.({});
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (c: string) => {
      buf += c;
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
        if (data && !closed) es.onmessage?.({ data });
      }
    });
    res.on('close', () => { if (!closed) es.onerror?.({}); });
  });
  req.on('error', () => { if (!closed) es.onerror?.({}); });
  req.end();
  const origClose = es.close;
  es.close = () => { closed = true; origClose(); };
  return es;
}
