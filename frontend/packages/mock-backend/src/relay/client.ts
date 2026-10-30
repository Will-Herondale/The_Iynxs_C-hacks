/**
 * Browser-safe relay client (also runs in Node 18+). No Node imports here.
 * The mock store uses it when the relay is reachable and falls back to local storage otherwise.
 */
import { RELAY_URL, type RelayState, type SaveResult } from './protocol.js';
export type { RelayState, SaveResult } from './protocol.js';

export interface RelayClient {
  readonly url: string;
  load(): Promise<RelayState>;
  /** Compare-and-set: succeeds only if `baseRev` is the relay's current rev; otherwise returns the latest state. */
  save(state: unknown, baseRev: number): Promise<SaveResult>;
  /** Calls back with the relay revision on connect and after every accepted save by any client. */
  subscribe(onRev: (rev: number) => void): () => void;
  close(): void;
}

export interface ConnectOptions {
  url?: string;
  /** Reachability probe timeout (ms). Default 800. */
  timeoutMs?: number;
  /** Delay before SSE reconnect (ms). Default 1000. */
  reconnectMs?: number;
}

/** Resolves to a client if the relay answers, or null (use the local in-browser store instead). */
export async function connectRelay(opts: ConnectOptions = {}): Promise<RelayClient | null> {
  const url = (opts.url ?? RELAY_URL).replace(/\/$/, '');
  const f = globalThis.fetch;
  if (typeof f !== 'function') return null;
  try {
    const res = await f(`${url}/health`, { signal: AbortSignal.timeout(opts.timeoutMs ?? 800) });
    const body = (await res.json()) as { relay?: string };
    if (body.relay !== 'setu-mock') return null;
  } catch {
    return null;
  }

  const aborters = new Set<AbortController>();
  let closed = false;

  return {
    url,
    async load() {
      return (await (await f(`${url}/state`)).json()) as RelayState;
    },
    async save(state, baseRev) {
      const res = await f(`${url}/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseRev, state }) });
      return (await res.json()) as SaveResult;
    },
    subscribe(onRev) {
      const ac = new AbortController();
      aborters.add(ac);
      void (async () => {
        while (!ac.signal.aborted && !closed) {
          try {
            const res = await f(`${url}/events`, { signal: ac.signal, headers: { accept: 'text/event-stream' } });
            const reader = res.body!.getReader();
            const dec = new TextDecoder();
            let buf = '';
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let i: number;
              while ((i = buf.indexOf('\n\n')) >= 0) {
                const chunk = buf.slice(0, i);
                buf = buf.slice(i + 2);
                const line = chunk.split('\n').find((l) => l.startsWith('data:'));
                if (line) onRev((JSON.parse(line.slice(5)) as { rev: number }).rev);
              }
            }
          } catch {
            if (ac.signal.aborted) return;
          }
          await new Promise((r) => setTimeout(r, opts.reconnectMs ?? 1000));
        }
      })();
      return () => { ac.abort(); aborters.delete(ac); };
    },
    close() {
      closed = true;
      for (const a of aborters) a.abort();
      aborters.clear();
    },
  };
}
