import {
  EventRecordSchema,
  EventStatusSchema,
  FieldEventSchema,
  NetworkError,
  PeopleSnapshotSchema,
  ProjectionSnapshotSchema,
  ServerError,
  SubmitAckSchema,
  TimeoutError,
  type ApiClient,
  type EventRecord,
  type EventStatus,
  type FieldEvent,
  type ListEventsParams,
  type PeopleSnapshot,
  type ProjectionSnapshot,
  type SubmitAck,
} from '@setu/contract';
import { z } from 'zod';

export const DEFAULT_BASE_URL = 'http://localhost:8080';

/** Minimal EventSource surface (the browser EventSource satisfies it). */
export interface EventSourceLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

export interface HttpApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Per-request timeout. Default 10 000 ms. */
  timeoutMs?: number;
  /** Polling fallback interval for subscribe(). Default 5 000 ms. */
  pollIntervalMs?: number;
  /** SSE reconnect backoff bounds. Defaults 1 000 / 30 000 ms. */
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  /** Defaults to the global EventSource when present; otherwise polling only. */
  eventSource?: EventSourceFactory;
  /** Called after every listEvents() with how many server records failed contract validation (0 = none). Valid records are still returned. */
  onSkippedRecords?: (info: { skipped: number; total: number; firstIssue?: string }) => void;
}

const BatchResponse = z.object({ acks: z.array(SubmitAckSchema) });
const StatusResponse = z.object({ statuses: z.array(EventStatusSchema) });
const EventsResponse = z.object({ events: z.array(z.unknown()) });
const StreamMessage = z.object({ type: z.literal('version'), version: z.number().int().nonnegative() });

export function createHttpApiClient(opts: HttpApiClientOptions = {}): ApiClient {
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const pollMs = opts.pollIntervalMs ?? 5_000;
  const backoffMin = opts.reconnectMinMs ?? 1_000;
  const backoffMax = opts.reconnectMaxMs ?? 30_000;
  let lastSnapshot: ProjectionSnapshot | undefined;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await doFetch(base + path, { ...init, signal: ctl.signal });
    } catch (e) {
      if (ctl.signal.aborted) throw new TimeoutError();
      throw new NetworkError(e instanceof Error ? e.message : undefined);
    } finally {
      clearTimeout(timer);
    }
  }

  async function json<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
    if (!res.ok) throw new ServerError(res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ServerError(502, 'Invalid response: not JSON');
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ServerError(502, `Invalid response: ${parsed.error.issues[0]?.message ?? 'schema'}`);
    return parsed.data;
  }

  const post = (path: string, body: unknown) =>
    request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  async function submitEvents(events: FieldEvent[]): Promise<SubmitAck[]> {
    const acks: (SubmitAck | undefined)[] = new Array(events.length).fill(undefined);
    const toSend: { i: number; e: FieldEvent }[] = [];
    events.forEach((e, i) => {
      const v = FieldEventSchema.safeParse(e);
      if (v.success) toSend.push({ i, e: v.data });
      else {
        acks[i] = {
          clientEventId: String((e as { clientEventId?: unknown }).clientEventId ?? ''),
          result: 'rejected',
          errors: v.error.issues.map((x) => ({ path: x.path.join('.'), message: x.message })),
        };
      }
    });
    if (toSend.length > 0) {
      const res = await post('/api/v1/events:batch', { events: toSend.map((x) => x.e) });
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        for (const { i, e } of toSend) {
          acks[i] = { clientEventId: e.clientEventId, result: 'rejected', errors: [{ path: '', message: `HTTP ${res.status}` }] };
        }
      } else {
        const body = await json(res, BatchResponse);
        toSend.forEach(({ i, e }, k) => {
          const a = body.acks.find((x) => x.clientEventId === e.clientEventId) ?? body.acks[k];
          if (!a) throw new ServerError(502, 'Invalid response: missing ack');
          acks[i] = a;
        });
      }
    }
    return acks as SubmitAck[];
  }

  async function getEventStatus(clientEventIds: string[]): Promise<EventStatus[]> {
    if (clientEventIds.length === 0) return [];
    const res = await post('/api/v1/events/status', { clientEventIds });
    return (await json(res, StatusResponse)).statuses;
  }

  async function getProjections(sinceVersion?: number): Promise<ProjectionSnapshot> {
    const send = (since?: number) => request('/api/v1/projections' + (since === undefined ? '' : `?sinceVersion=${since}`));
    let res = await send(sinceVersion);
    if (res.status === 304) {
      if (lastSnapshot) return lastSnapshot;
      res = await send();
    }
    const snap = await json(res, ProjectionSnapshotSchema);
    lastSnapshot = snap;
    return snap;
  }

  async function getPeople(): Promise<PeopleSnapshot> {
    const res = await request('/api/v1/people');
    return json(res, PeopleSnapshotSchema);
  }

  async function listEvents(params: ListEventsParams = {}): Promise<EventRecord[]> {    const q = new URLSearchParams();
    if (params.sinceVersion !== undefined) q.set('sinceVersion', String(params.sinceVersion));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.type !== undefined) q.set('type', params.type);
    const qs = q.toString();
    const res = await request('/api/v1/events' + (qs ? `?${qs}` : ''));
    // Validate record by record: one bad record must not hide the valid ones. Skipped records are reported, never silently dropped.
    const raw = (await json(res, EventsResponse)).events;
    const valid: EventRecord[] = [];
    let firstIssue: string | undefined;
    for (const rec of raw) {
      const r = EventRecordSchema.safeParse(rec);
      if (r.success) valid.push(r.data);
      else firstIssue ??= `${r.error.issues[0]?.path.join('.') ?? '?'}: ${r.error.issues[0]?.message ?? 'invalid'}`;
    }
    opts.onSkippedRecords?.({ skipped: raw.length - valid.length, total: raw.length, ...(firstIssue ? { firstIssue } : {}) });
    return valid;
  }

  // Shared SSE connection state across all subscribe() callers of this api client.
  const makeEs: EventSourceFactory | undefined =
    opts.eventSource ??
    (typeof EventSource !== 'undefined' ? (url) => new EventSource(url) as unknown as EventSourceLike : undefined);
  let es: EventSourceLike | undefined;
  const listeners = new Set<(v: number) => void>();
  let stopped = false;
  let lastVersion: number | undefined;
  let polling = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let backoff = backoffMin;

  const notify = (v: number) => {
    if (stopped || v === lastVersion) return;
    lastVersion = v;
    listeners.forEach((l) => l(v));
  };
  const poll = async () => {
    pollTimer = undefined;
    try {
      notify((await getProjections(lastVersion)).version);
    } catch {
      /* keep polling */
    }
    if (!stopped && polling) pollTimer = setTimeout(poll, pollMs);
  };
  const startPolling = () => {
    if (polling || stopped) return;
    polling = true;
    pollTimer = setTimeout(poll, 0);
  };
  const stopPolling = () => {
    polling = false;
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    pollTimer = undefined;
  };
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== undefined) return;
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, backoffMax);
  };
  function connect() {
    reconnectTimer = undefined;
    if (stopped || !makeEs) return;
    let source: EventSourceLike;
    try {
      source = makeEs(`${base}/api/v1/stream`);
    } catch {
      startPolling();
      scheduleReconnect();
      return;
    }
    es = source;
    source.onopen = () => {
      backoff = backoffMin;
      stopPolling();
    };
    source.onmessage = (ev) => {
      try {
        const m = StreamMessage.safeParse(JSON.parse(ev.data));
        if (m.success) notify(m.data.version);
      } catch {
        /* ignore malformed frame */
      }
    };
    source.onerror = () => {
      source.close();
      if (es === source) es = undefined;
      startPolling();
      scheduleReconnect();
    };
  }

  function subscribe(onChange: (snapshotVersion: number) => void): () => void {
    listeners.add(onChange);

    // If already connected, just register the listener.
    if (es) {
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) {
          stopped = true;
          stopPolling();
          if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
          es?.close();
          es = undefined;
        }
      };
    }

    // First subscriber — create the shared SSE connection.
    stopped = false;
    if (makeEs) connect();
    else startPolling();

    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0) {
        stopped = true;
        stopPolling();
        if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
        es?.close();
        es = undefined;
      }
    };
  }

  return { submitEvents, getEventStatus, getProjections, getPeople, listEvents, subscribe };
}
