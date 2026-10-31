import { useEffect } from 'react';
import { Badge } from '@setu/ui';
import { useQueue, useSyncState } from '../../sync/index.js';
import {
  acquireProbe,
  deriveConnectivity,
  useBackendReachable,
  type ConnectivityState,
} from './connectivity.js';
import { formatIst, formatRelative, staleLevel } from './staleness.js';
import { ORIGIN_SHAPE, originLabel, type Origin } from './origin.js';
import { useNow } from './useNow.js';
import { API_BASE_URL } from '../../app/api.js';
import './status.css';

const LABEL: Record<ConnectivityState, { icon: string; text: string }> = {
  online: { icon: '●', text: 'Online' },
  offline: { icon: '○', text: 'Offline: reports are saved on this device' },
  'backend-unreachable': { icon: '⚠', text: 'Online, but the server is not responding' },
  syncing: { icon: '↻', text: 'Synchronising' },
};

/** The apps always use the real backend, so the probe is on by default (tests pass `probe={false}` explicitly). */
const PROBE_ENABLED = true;

/** Probes the backend's /health while the browser says it is online. Only against the real backend. */
function useBackendProbe(enabled: boolean, online: boolean): void {
  useEffect(() => {
    if (!enabled || !online) return;
    return acquireProbe(API_BASE_URL);
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

/**
 * Honest scope of an offline device: it only knows what is saved on it. Shown whenever the browser is offline or the backend
 * is unreachable, on every screen. Never implies the local view is the district-wide situation.
 */
export function LocalOnlyNotice() {
  const { online } = useSyncState();
  const reachable = useBackendReachable();
  if (online && reachable) return null;
  return (
    <div role="status" className="local-only-notice" data-testid="local-only-notice" data-reason={online ? 'backend-unreachable' : 'offline'}>
      <strong>{online ? 'Backend unreachable.' : 'You are offline.'}</strong>{' '}
      This device only knows what is saved on it: your own reports and the last district data it received.
      It cannot see reports from other devices, so what you see is <strong>not</strong> the district-wide situation.
      Reports marked <em>Local (this device)</em> are not yet shared; <em>District (synced)</em> ones came from the server.
    </div>
  );
}
