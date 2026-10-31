import { useSyncExternalStore } from 'react';

export type ConnectivityState = 'online' | 'offline' | 'backend-unreachable' | 'syncing';

export function deriveConnectivity(i: { online: boolean; syncing: boolean; backendReachable: boolean }): ConnectivityState {
  if (!i.online) return 'offline';
  if (i.syncing) return 'syncing';
  if (!i.backendReachable) return 'backend-unreachable';
  return 'online';
}

/** The server's health endpoint is `GET /health` (not under /api/v1). */
export const HEALTH_PATH = '/health';
export const PROBE_TIMEOUT_MS = 8000; // tunnels and cold servers can take several seconds
export const PROBE_RETRY_MS = 5000; // after a failure, probe again soon instead of waiting a full interval
export const PROBE_FAILURES_TO_DECLARE = 5; // tolerate burst failures on reload / cold start
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


let consecutiveFailures = 0;
/** Fold one probe result in: success is reported at once; 'unreachable' only after PROBE_FAILURES_TO_DECLARE failures in a row. */
export function recordProbe(ok: boolean): void {
  if (ok) { consecutiveFailures = 0; reportBackendResult(true); return; }
  consecutiveFailures += 1;
  if (consecutiveFailures >= PROBE_FAILURES_TO_DECLARE) reportBackendResult(false);
}
export function resetProbeState(): void { consecutiveFailures = 0; }

let users = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = true;

/**
 * One shared probe loop for the whole app (several status components can mount at once).
 * Returns a release function; the loop stops when the last user releases it.
 */
export function acquireProbe(baseUrl: string, fetchImpl: typeof fetch = fetch): () => void {
  users += 1;
  if (users === 1) {
    stopped = false;
    const tick = async () => {
      const ok = await probeBackend(fetchImpl, PROBE_TIMEOUT_MS, baseUrl);
      if (stopped) return;
      recordProbe(ok);
      timer = setTimeout(() => void tick(), ok ? PROBE_INTERVAL_MS : PROBE_RETRY_MS);
    };
    void tick();
  }
  return () => {
    users -= 1;
    if (users <= 0) { users = 0; stopped = true; if (timer) clearTimeout(timer); timer = undefined; }
  };
}
