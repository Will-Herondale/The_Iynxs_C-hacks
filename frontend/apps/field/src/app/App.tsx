import { useState } from 'react';
import { AppShell } from '@setu/ui';
import type { QueueItem } from '../sync/index.js';
import { ReportScreen } from '../features/report/index.js';
import { ReportDetailScreen } from '../features/report-detail/index.js';
import { HouseholdsScreen } from '../features/household/index.js';
import { CampScreen } from '../features/camp/index.js';
import { MapScreen } from '../features/map/index.js';
import { HomeScreen } from '../features/home/index.js';
import { useCachedProjections } from '../offline/index.js';
import { useRemotePeople } from '../offline/useRemotePeople.js';
import { OfflineBanner } from './OfflineBanner.js';
import { StorageBanner } from './StorageBanner.js';
import { ApiStatus } from './ApiStatus.js';
import { UpdateToast } from '../pwa/index.js';
import { ExchangeScreen } from '../features/exchange/index.js';
import { QueueScreen, SyncNowButton } from '../features/queue/index.js';
import { ConnectivityStatus, LastSyncedLine, LocalOnlyNotice } from '../features/status/index.js';
import { useRoute } from './route.js';
import type { RouteName } from './route.js';

const NAV: { route: RouteName; label: string; icon: string; testId: string }[] = [
  { route: 'home', label: 'Home', icon: '⌂', testId: 'nav-home' },
  { route: 'report', label: 'Report', icon: '+', testId: 'nav-report' },
  { route: 'map', label: 'Map', icon: '◎', testId: 'nav-map' },
  { route: 'households', label: 'Households', icon: '☖', testId: 'nav-households' },
  { route: 'sync', label: 'Sync', icon: '↻', testId: 'nav-sync' },
];

export function App() {
  const [route, go] = useRoute();
  // A rejected queue item reopened for editing; the matching form prefills from it.
  const { snapshot, cachedAt } = useCachedProjections();
  const remotePeople = useRemotePeople();
  const [editing, setEditing] = useState<QueueItem | null>(null);

  const openReport = (id: string) => go(`report/${id}`);
  const onEdit = (item: QueueItem) => {
    setEditing(item);
    go(item.type === 'household_registration' ? 'households' : 'report');
  };
  const done = () => {
    setEditing(null);
    go('sync');
  };

  const header = (
    <div className="field-header">
      <strong className="field-header__title">SETU Field</strong>
      <ConnectivityStatus />
      <LastSyncedLine />
      <SyncNowButton />
      <a href="#/camp" data-testid="nav-camp" className="field-header__link" aria-current={route.name === 'camp' ? 'page' : undefined}>
        Camp
      </a>
    </div>
  );

  const nav = (
    <ul className="field-nav">
      {NAV.map((n) => (
        <li key={n.route}>
          <a
            href={`#/${n.route}`}
            data-testid={n.testId}
            aria-current={route.name === n.route ? 'page' : undefined}
            onClick={() => {
              if (n.route !== route.name) setEditing(null);
            }}
          >
            <span aria-hidden="true" className="field-nav__icon">
              {n.icon}
            </span>
            <span>{n.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );

  let main;
  switch (route.name) {
    case 'report':
      main = route.param ? (
        <ReportDetailScreen clientEventId={route.param} onEdit={onEdit} onOpen={openReport} onBack={() => go('sync')} />
      ) : (
        <ReportScreen snapshot={snapshot} editing={editing?.type !== 'household_registration' ? editing : null}
          onDone={done}
          onOpenDetail={openReport}
        />
      );
      break;
    case 'map':
      main = <MapScreen onOpenReport={openReport} />;
      break;
    case 'households':
      main = (
        <HouseholdsScreen
          snapshot={snapshot}
          people={remotePeople.snapshot}
          peopleUnavailable={remotePeople.unavailable}
          onOpenReport={openReport}
          startRegistering={route.param === 'new'}
        />
      );
      break;
    case 'camp':
       main = <CampScreen people={remotePeople.snapshot} peopleUnavailable={remotePeople.unavailable} onOpenReport={openReport} />;
      break;
    case 'sync':
      main =
        route.param === 'exchange' ? (
          <>
            <a href="#/sync" className="field-header__link" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}>
              ← Back to Sync
            </a>
            <ExchangeScreen />
          </>
        ) : (
          <>
            <a
              href="#/sync/exchange"
              data-testid="nav-exchange"
              className="field-header__link"
              style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}
            >
              Exchange reports (file)
            </a>
            <QueueScreen onEdit={onEdit} />
          </>
        );
      break;
    default:
      main = <HomeScreen cachedAt={cachedAt} />;
  }

  return (
    <AppShell
      header={header}
      nav={nav}
      main={
        <>
          <OfflineBanner />
          <LocalOnlyNotice />
          <StorageBanner />
          <ApiStatus />
          {main}
          <UpdateToast />
        </>
      }
    />
  );
}
