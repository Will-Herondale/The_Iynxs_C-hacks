import {
  NetworkError,
  ServerError,
  TimeoutError,
  type ApiClient,
  type EventRecord,
  type EventStatus,
  type ListEventsParams,
} from '@setu/contract';
import { createApiClient } from '@setu/api-client';
import { getMockConfig } from './config.js';
import { createRelayAdapter, relayUrlFromGlobal } from './relay/adapter.js';
import type { MockRelay, StoredEvent } from './scenario.js';
import { MockStore } from './store.js';
import { getMockStore } from './defaults.js';

export interface MockClientOptions {
  /** Use a specific store (tests). Defaults to the shared singleton. */
  store?: MockStore;
  /** Only honoured when the singleton is first created. */
  relay?: MockRelay;
}

const delay = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

/** Transport-level failure injection applied to every call. */
async function gate(): Promise<void> {
  const cfg = getMockConfig();
  if (cfg.offline) throw new NetworkError('Simulated offline');
  await delay(cfg.latencyMs);
  if (cfg.random() < cfg.timeoutRate) throw new TimeoutError('Simulated timeout');
  if (cfg.random() < cfg.failRate5xx) throw new ServerError(503, 'Simulated 503');
}

function toRecord(e: StoredEvent): EventRecord {
  return {
    eventId: e.eventId,
    event: e.event,
    serverState: e.serverState,
    receivedAt: e.receivedAt,
    ...(e.appliedAtVersion !== undefined ? { appliedAtVersion: e.appliedAtVersion } : {}),
  };
}

export function createMockApiClient(opts: MockClientOptions = {}): ApiClient {
  const store = opts.store ?? getMockStore({ relay: opts.relay });
  return {
    async submitEvents(events) {
      await gate();
      return events.map((e) => store.submitOne(e));
    },
    async getEventStatus(ids) {
      await gate();
      return ids.map((clientEventId): EventStatus => {
        const rec = store.find(clientEventId);
        if (!rec) return { clientEventId, state: 'unknown' };
        return {
          clientEventId,
          eventId: rec.eventId,
          state: rec.serverState,
          ...(rec.appliedAtVersion !== undefined ? { projectionVersion: rec.appliedAtVersion } : {}),
        };
      });
    },
    async getProjections() {
      await gate();
      return store.snapshot;
    },
    async listEvents(params: ListEventsParams = {}) {
      await gate();
      // The feed only shows events the server has applied (or flagged as conflicts): `accepted` is not visible yet.
      let list = store.events.filter((e) => e.serverState !== 'accepted');
      if (params.type) list = list.filter((e) => e.event.type === params.type);
      if (params.sinceVersion !== undefined) {
        const since = params.sinceVersion;
        list = list.filter((e) => (e.appliedAtVersion ?? 0) > since);
      }
      if (params.limit !== undefined) list = list.slice(-params.limit);
      return list.map(toRecord);
    },
    subscribe(onChange) {
      return store.subscribe((v) => {
        if (!getMockConfig().offline) onChange(v);
      });
    },
  };
}

/** Convenience for apps: `createApiClient({mode:'mock'})` with the in-process mock wired in. */
export function createApiClientWithMock(opts: MockClientOptions = {}): ApiClient {
  // In dev the Vite plugin injects the relay URL so field/command tabs on different origins share state.
  const url = relayUrlFromGlobal();
  const relay = opts.relay ?? (url ? createRelayAdapter({ url }) : undefined);
  return createApiClient({ mode: 'mock', mockAdapter: createMockApiClient({ ...opts, relay }) });
}
