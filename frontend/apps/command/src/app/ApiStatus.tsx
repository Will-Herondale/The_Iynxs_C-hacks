import { ErrorState } from '@setu/ui';
import { useProjections } from '../data';

/** Honest backend state: unreachable, or reachable but with no data yet. Never shows seeded data. */
export function ApiStatus() {
  const { snapshot, connection, isLoading } = useProjections();
  if (connection === 'unavailable') {
    return <ErrorState kind="api-unavailable" detail="Backend unavailable. Reports stay queued on field devices and sync automatically when it answers." />;
  }
  if (!isLoading && snapshot) {
    const n = snapshot.roads.features.length + snapshot.settlements.features.length + snapshot.routes.features.length + snapshot.shelters.features.length + snapshot.flood.features.length;
    if (n === 0) return <ErrorState kind="empty" detail="No data yet: the backend snapshot has no features." />;
  }
  return null;
}
