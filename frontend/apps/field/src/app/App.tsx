import { useState } from 'react';
import { AppShell } from '@setu/ui';
import type { QueueItem } from '../sync/index.js';
import { ReportScreen } from '../features/report/index.js';
import { HouseholdScreen } from '../features/household/index.js';
import { CampScreen } from '../features/camp/index.js';
import { useCachedProjections } from '../offline/index.js';
import { OfflineBanner } from './OfflineBanner.js';
import { QueueScreen, OnlineStatus, PendingCount, LastSynced, SyncNowButton } from '../features/queue/index.js';
import { useRoute } from './route.js';
import type { Route } from './route.js';

const NAV: { route: Route; label: string; testId: string }[] = [
  { route: 'report', label: 'Report', testId: 'nav-report' },
  { route: 'household', label: 'Household', testId: 'nav-household' },
  { route: 'camp', label: 'Camp', testId: 'nav-camp' },
  { route: 'queue', label: 'Queue', testId: 'nav-queue' },
];

export function App() {
  const [route, go] = useRoute();
  // A rejected queue item reopened for editing; the matching form prefills from it.
  const { snapshot } = useCachedProjections();
  const [editing, setEditing] = useState<QueueItem | null>(null);

  const onEdit = (item: QueueItem) => {
    setEditing(item);
    go(item.type === 'household_registration' ? 'household' : 'report');
  };
  const done = () => {
    setEditing(null);
    go('queue');
  };

  const header = (
    <div className="field-header">
      <strong className="field-header__title">SETU Field</strong>
      <OnlineStatus />
      <PendingCount />
      <LastSynced />
      <SyncNowButton />
    </div>
  );

  const nav = (
    <ul className="field-nav">
      {NAV.map((n) => (
        <li key={n.route}>
          <a
            href={`#/${n.route}`}
            data-testid={n.testId}
            aria-current={route === n.route ? 'page' : undefined}
            onClick={() => {
              if (n.route !== route) setEditing(null);
            }}
          >
            {n.label}
          </a>
        </li>
      ))}
    </ul>
  );

  const main =
    route === 'report' ? (
      <ReportScreen snapshot={snapshot} editing={editing?.type !== 'household_registration' ? editing : null} onDone={done} />
    ) : route === 'household' ? (
      <HouseholdScreen editing={editing?.type === 'household_registration' ? editing : null} onDone={done} />
    ) : route === 'camp' ? (
      <CampScreen />
    ) : (
      <QueueScreen onEdit={onEdit} />
    );

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
