import { useSyncExternalStore } from 'react';

export type ConnectivityState = 'online' | 'offline' | 'backend-unreachable' | 'syncing';

export function deriveConnectivity(i: { online: boolean; syncing: boolean; backendReachable: boolean }): ConnectivityState {
  if (!i.online) return 'offline';
  if (i.syncing) return 'syncing';
  return i.backendReachable ? 'online' : 'backend-unreachable';
}

/** The server's health endpoint is `GET /health` (not under /api/v1). */
export const HEALTH_PATH = '/health';
export const PROBE_TIMEOUT_MS = 4000;
export const PROBE_INTERVAL_MS = 30_000;

/**
 * Reachable = the server answered at all (any HTTP status); only a network failure or timeout means unreachable.
 * `baseUrl` must be the BACKEND address: a relative path would hit the app's own origin and always look reachable.
 */
export async function probeBackend(fetchImpl: typeof fetch = fetch, timeoutMs = PROBE_TIMEOUT_MS, baseUrl = ''): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // no-cors: only reachability matters, so a server that omits CORS headers on /health must not look unreachable.
    await fetchImpl(`${baseUrl}${HEALTH_PATH}`, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let reachable = true;
const listeners = new Set<() => void>();

/** Record the outcome of the latest backend request (probe or data fetch). */
export function reportBackendResult(ok: boolean): void {
  if (reachable === ok) return;
  reachable = ok;
  listeners.forEach((l) => l());
}

export function useBackendReachable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => reachable,
    () => true,
  );
}
