import { ErrorState } from '@setu/ui';
import { useCachedProjections } from '../offline/index.js';

/** Honest backend state banner. Queue, forms and offline map keep working underneath. */
export function ApiStatus() {
  const { snapshot, unavailable } = useCachedProjections();
  if (unavailable) {
    return <ErrorState kind="api-unavailable" detail="Backend unavailable. Your reports are saved on this device and will sync automatically." />;
  }
  if (snapshot && snapshot.roads.features.length + snapshot.settlements.features.length + snapshot.routes.features.length + snapshot.shelters.features.length === 0) {
    return <ErrorState kind="empty" detail="No data yet from the backend." />;
  }
  return null;
}
