/** Browser-safe glue: exposes the dev relay as the store's `MockRelay` (publish/subscribe of full sync state). */
import type { MockRelay, MockSyncState } from '../scenario.js';
import { connectRelay, type ConnectOptions } from './client.js';

declare global {
  // Injected into index.html by the setuMockRelay() Vite plugin (dev only).
  var __SETU_MOCK_RELAY__: string | undefined;
}

export function relayUrlFromGlobal(): string | undefined {
  return globalThis.__SETU_MOCK_RELAY__ || undefined;
}

/**
 * Connects lazily. If the relay is unreachable the adapter is a no-op and the store keeps working
 * locally (BroadcastChannel for same-origin tabs). The store merges remote states itself.
 */
export function createRelayAdapter(opts: ConnectOptions = {}): MockRelay {
  const subs = new Set<(s: MockSyncState) => void>();
  let rev = 0;
  let pending: MockSyncState | undefined;
  let ready: Awaited<ReturnType<typeof connectRelay>> | undefined;
  let saving = false;
  const deliver = (s: unknown) => {
    if (s) for (const cb of subs) cb(s as MockSyncState);
  };

  async function flush(): Promise<void> {
    if (!ready || saving) return;
    saving = true;
    try {
      for (let tries = 0; pending && tries < 5; tries++) {
        const state = pending;
        const res = await ready.save(state, rev);
        rev = res.rev;
        if (res.ok) {
          if (pending === state) pending = undefined;
        } else {
          deliver(res.state); // store merges; `state` is the store's live object so retry carries the merge
        }
      }
    } catch {
      /* relay went away; keep working locally */
    } finally {
      saving = false;
    }
  }

  void connectRelay(opts).then(async (client) => {
    if (!client) return;
    ready = client;
    const initial = await client.load().catch(() => undefined);
    if (initial) {
      rev = initial.rev;
      deliver(initial.state);
    }
    client.subscribe((r) => {
      if (r === rev) return;
      void client.load().then((s) => {
        rev = s.rev;
        deliver(s.state);
      }).catch(() => {});
    });
    void flush();
  });

  return {
    publish(state) {
      pending = state;
      void flush();
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}
