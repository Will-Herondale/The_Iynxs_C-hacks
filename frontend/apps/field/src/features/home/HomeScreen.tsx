import { Button } from '@setu/ui';
import { SyncStatusBadge } from '@setu/ui';
import type { QueueItem } from '../../sync/index.js';
import { DataAsOf, deriveConnectivity, OriginBadge, StaleWarning, useBackendReachable } from '../status/index.js';
import { syncNow, useQueue, useSyncState } from '../../sync/index.js';

export const EVENT_TYPE_LABEL: Record<string, string> = {
  water_level: 'Water-level observation',
  flood_report: 'Flooded road',
  road_blockage: 'Blocked road / bridge',
  road_cleared: 'Road cleared',
  household_registration: 'Household registration',
};

const ATTENTION = ['conflict', 'rejected', 'failed'] as const;
const SETTLED = ['synced'] as const;

export interface HomeCounts {
  pending: number;
  synced: number;
  attention: number;
}

/** Pure mapping from the queue to the three Home counters. */
export function homeCounts(items: Pick<QueueItem, 'status'>[]): HomeCounts {
  const c: HomeCounts = { pending: 0, synced: 0, attention: 0 };
  for (const i of items) {
    if ((ATTENTION as readonly string[]).includes(i.status)) c.attention++;
    else if ((SETTLED as readonly string[]).includes(i.status)) c.synced++;
    else c.pending++;
  }
  return c;
}

const fmt = (ms: number) => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

export function HomeScreen({ district, cachedAt }: { district?: string; cachedAt?: number }) {
  const { online, syncing, lastSyncedAt } = useSyncState();
  // Same source as the header indicator, so the two never contradict each other.
  const conn = deriveConnectivity({ online, syncing, backendReachable: useBackendReachable() });
  const items = useQueue();
  const counts = homeCounts(items);
  const recent = items.slice(0, 5);

  return (
    <section className="home" data-testid="home-screen" aria-labelledby="home-h">
      <h1 id="home-h" className="home__title">
        <span data-testid="home-district">{district ?? 'Majuli (demo)'}</span>
        {!district && (
          <span className="home__fixture" data-testid="home-district-fixture">
            {' '}
            · district name not provided by the backend
          </span>
        )}
      </h1>

      <div className="home__status" data-testid="home-status">
        <div className="home__status-row" data-testid="home-connectivity" data-online={online ? 'true' : 'false'} data-state={conn}>
          <span className="home__status-label">Connection</span>
          <span className="home__status-value">
            <span aria-hidden="true">{conn === 'offline' ? '○' : conn === 'backend-unreachable' ? '⚠' : '●'}</span>{' '}
            {conn === 'offline' ? 'Offline' : conn === 'backend-unreachable' ? 'Online, but the server is not responding' : conn === 'syncing' ? 'Online · Synchronising' : 'Online'}
          </span>
        </div>
        <div className="home__status-row" data-testid="home-sync-state" data-synced={items.length > 0 && counts.pending === 0 && counts.attention === 0 ? 'true' : 'false'}>
          <span className="home__status-label">Reports</span>
          <span className="home__status-value">
            {items.length === 0
              ? 'None on this device yet'
              : counts.pending === 0 && counts.attention === 0
                ? '✓ All synchronised with the server'
                : `↻ ${counts.pending} waiting to sync${counts.attention > 0 ? ` · ${counts.attention} need attention` : ''}`}
          </span>
        </div>
        <div className="home__status-row" data-testid="home-last-synced">
          <span className="home__status-label">Last synced</span>
          <span className="home__status-value">{lastSyncedAt ? fmt(lastSyncedAt) + ' IST' : 'never'}</span>
        </div>
        <p className="home__status-note">Online only means this device is connected. A report is synchronised once the server confirms it.</p>
      </div>

      <StaleWarning cachedAt={cachedAt} />
      <p className="home__asof"><DataAsOf cachedAt={cachedAt} /></p>

      <div className="home__actions">
        <a className="home__big home__big--primary" href="#/report" data-testid="home-new-report">
          <span className="home__big-icon" aria-hidden="true">＋</span>
          <span className="home__big-text"><strong>New Report</strong><small>Flood, road, bridge or water level</small></span>
        </a>
        <a className="home__big home__big--secondary" href="#/households/new" data-testid="home-register-household">
          <span className="home__big-icon" aria-hidden="true">⌂</span>
          <span className="home__big-text"><strong>Register household</strong><small>A family, at a camp or not · works offline</small></span>
        </a>
        <a className="home__big home__big--secondary" href="#/camp" data-testid="home-register-person">
          <span className="home__big-icon" aria-hidden="true">☺</span>
          <span className="home__big-text"><strong>Register a person</strong><small>One individual, in a camp or not · works offline</small></span>
        </a>
      </div>

      <ul className="home__counts" aria-label="Report counts">
        <li data-testid="home-count-pending">
          <strong>{counts.pending}</strong> pending locally
        </li>
        <li data-testid="home-count-synced">
          <strong>{counts.synced}</strong> synced
        </li>
        <li data-testid="home-count-attention" data-attention={counts.attention > 0 ? 'true' : 'false'}>
          <strong>{counts.attention}</strong> needs attention
          <span className="home__hint"> (review, rejected, failed)</span>
        </li>
      </ul>

      <h2 className="home__h2">Recent activity</h2>
      {recent.length === 0 ? (
        <p data-testid="home-recent-empty">No reports yet on this device.</p>
      ) : (
        <ul className="home__recent" data-testid="home-recent">
          {recent.map((i) => (
            <li key={i.clientEventId} data-testid="home-recent-item">
              <a href={`#/report/${i.clientEventId}`} className="home__row">
                <span className="home__row-main">
                  <strong>{EVENT_TYPE_LABEL[i.type] ?? i.type}</strong>
                  <time dateTime={new Date(i.createdAt).toISOString()}>{fmt(i.createdAt)}</time>
                </span>
                <OriginBadge origin="local" accepted={i.status === 'synced'} />
                <SyncStatusBadge status={i.status} online={online} />
              </a>
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href="#/sync">All activity →</a>{' '}
        <Button type="button" onClick={() => void syncNow()} disabled={!online || syncing} data-testid="home-sync-now">
          Sync now
        </Button>
      </p>
    </section>
  );
}
