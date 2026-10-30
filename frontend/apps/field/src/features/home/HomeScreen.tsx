import { Button } from '@setu/ui';
import { SyncStatusBadge } from '@setu/ui';
import type { QueueItem } from '../../sync/index.js';
import { DataAsOf, OriginBadge, StaleWarning } from '../status/index.js';
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
            · demo fixture, district not provided by backend
          </span>
        )}
      </h1>

      <p className="home__conn" data-testid="home-connectivity" data-online={online ? 'true' : 'false'}>
        <span aria-hidden="true">{online ? '●' : '○'}</span> {online ? 'Online' : 'Offline'}
        {syncing ? ' · Synchronising' : ''}
        {' · Last synced: '}
        {lastSyncedAt ? fmt(lastSyncedAt) + ' IST' : 'never'}
      </p>

      <StaleWarning cachedAt={cachedAt} />
      <p className="home__asof"><DataAsOf cachedAt={cachedAt} /></p>

      <div className="home__actions">
        <a className="home__big home__big--primary" href="#/report" data-testid="home-new-report">
          New Report
        </a>
        <a className="home__big" href="#/households/new" data-testid="home-register-household">
          Register household
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
