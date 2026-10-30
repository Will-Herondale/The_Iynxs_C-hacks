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
import { OfflineBanner } from './OfflineBanner.js';
import { QueueScreen, OnlineStatus, PendingCount, LastSynced, SyncNowButton } from '../features/queue/index.js';
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
  const { snapshot } = useCachedProjections();
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
      <OnlineStatus />
      <PendingCount />
      <LastSynced />
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
          onOpenReport={openReport}
          startRegistering={route.param === 'new'}
        />
      );
      break;
    case 'camp':
      main = <CampScreen onOpenReport={openReport} />;
      break;
    case 'sync':
      main = <QueueScreen onEdit={onEdit} />;
      break;
    default:
      main = <HomeScreen />;
  }

  return (
    <AppShell
      header={header}
      nav={nav}
      main={
        <>
          <OfflineBanner />
          {main}
        </>
      }
    />
  );
}
