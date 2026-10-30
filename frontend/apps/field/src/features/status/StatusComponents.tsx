import { useEffect } from 'react';
import { Badge } from '@setu/ui';
import { useQueue, useSyncState } from '../../sync/index.js';
import {
  PROBE_INTERVAL_MS,
  deriveConnectivity,
  probeBackend,
  reportBackendResult,
  useBackendReachable,
  type ConnectivityState,
} from './connectivity.js';
import { formatIst, formatRelative, staleLevel } from './staleness.js';
import { ORIGIN_SHAPE, originLabel, type Origin } from './origin.js';
import { useNow } from './useNow.js';
import './status.css';

const LABEL: Record<ConnectivityState, { icon: string; text: string }> = {
  online: { icon: '●', text: 'Online' },
  offline: { icon: '○', text: 'Offline: reports are saved on this device' },
  'backend-unreachable': { icon: '⚠', text: 'Online, but the server is not responding' },
  syncing: { icon: '↻', text: 'Synchronising' },
};

const PROBE_ENABLED = import.meta.env.VITE_API_MODE === 'http';

/** Probes /api/v1/health while the browser says it is online. Only against the real backend. */
function useBackendProbe(enabled: boolean, online: boolean): void {
  useEffect(() => {
    if (!enabled || !online) return;
    let cancelled = false;
    const run = async () => {
      const ok = await probeBackend();
      if (!cancelled) reportBackendResult(ok);
    };
    void run();
    const t = setInterval(() => void run(), PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled, online]);
}

/** The one connectivity indicator, with pending and failed counts. */
export function ConnectivityStatus({ probe = PROBE_ENABLED }: { probe?: boolean }) {
  const { online, syncing } = useSyncState();
  const reachable = useBackendReachable();
  const items = useQueue();
  useBackendProbe(probe, online);
  const state = deriveConnectivity({ online, syncing, backendReachable: reachable });
  const pending = items.filter((i) => i.status === 'queued' || i.status === 'sending' || i.status === 'accepted').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const l = LABEL[state];
  return (
    <span className="conn" role="status">
      <span data-testid="connectivity-status" data-state={state} className={`conn__state conn__state--${state}`}>
        <span aria-hidden="true">{l.icon}</span> {l.text}
      </span>
      <span className="conn__count" data-testid="connectivity-pending" data-count={pending}>
        Pending: <strong>{pending}</strong>
      </span>
      <span className="conn__count" data-testid="connectivity-failed" data-count={failed}>
        Failed: <strong>{failed}</strong>
      </span>
    </span>
  );
}

/** Last successful sync in IST plus relative age. `testId` lets a screen keep its existing id. */
export function LastSyncedLine({ testId = 'last-synced' }: { testId?: string }) {
  const { lastSyncedAt } = useSyncState();
  const now = useNow();
  const iso = lastSyncedAt ? new Date(lastSyncedAt).toISOString() : '';
  return (
    <span className="conn__last">
      Last synced:{' '}
      <time data-testid={testId} data-ts={iso} dateTime={iso || undefined}>
        {lastSyncedAt ? `${formatIst(lastSyncedAt)} (${formatRelative(now - lastSyncedAt)})` : 'never'}
      </time>
    </span>
  );
}

/** "Operational data as of …" from the cache timestamp. */
export function DataAsOf({ cachedAt }: { cachedAt?: number }) {
  const now = useNow();
  if (cachedAt === undefined) return <span data-testid="data-as-of" data-ts="">Operational data: none saved on this device yet</span>;
  return (
    <span>
      Operational data as of{' '}
      <time data-testid="data-as-of" data-ts={new Date(cachedAt).toISOString()} dateTime={new Date(cachedAt).toISOString()}>
        {formatIst(cachedAt)} ({formatRelative(now - cachedAt)})
      </time>
    </span>
  );
}

/** Amber > 15 min, red > 60 min. Renders nothing while data is fresh or absent. */
export function StaleWarning({ cachedAt }: { cachedAt?: number }) {
  const now = useNow();
  if (cachedAt === undefined) return null;
  const age = now - cachedAt;
  const level = staleLevel(age);
  if (level === 'fresh') return null;
  return (
    <p role="alert" className={`stale stale--${level}`} data-testid="stale-warning" data-level={level}>
      <span aria-hidden="true">{level === 'red' ? '⛔' : '⚠'}</span> {level === 'red' ? 'Data is very old' : 'Data may be out of date'}:
      last updated {formatRelative(age)}. Check with your coordinator before relying on roads or flood areas.
    </p>
  );
}

/** Local / Remote label with a distinct shape. */
export function OriginBadge({ origin, accepted = false }: { origin: Origin; accepted?: boolean }) {
  const s = ORIGIN_SHAPE[origin];
  return (
    <span data-testid="origin-badge" data-origin={origin} className={`origin origin--${origin}`} title={`${s.shape} marker`}>
      <Badge>
        <span aria-hidden="true">{s.glyph}</span> {originLabel(origin, accepted)}
      </Badge>
    </span>
  );
}
