import { useSyncExternalStore } from 'react';

export type ConnectivityState = 'online' | 'offline' | 'backend-unreachable' | 'syncing';

export function deriveConnectivity(i: { online: boolean; syncing: boolean; backendReachable: boolean }): ConnectivityState {
  if (!i.online) return 'offline';
  if (i.syncing) return 'syncing';
  return i.backendReachable ? 'online' : 'backend-unreachable';
}

export const HEALTH_PATH = '/api/v1/health';
export const PROBE_TIMEOUT_MS = 4000;
export const PROBE_INTERVAL_MS = 30_000;

/**
 * Reachable = the server answered at all. The live backend returns 404 for /health,
 * so any HTTP status counts; only a network failure or timeout means unreachable.
 */
export async function probeBackend(fetchImpl: typeof fetch = fetch, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    await fetchImpl(HEALTH_PATH, { method: 'GET', cache: 'no-store', signal: ctl.signal });
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
