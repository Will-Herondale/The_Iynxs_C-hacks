import { useCachedProjections } from '../../offline/index.js';
import { useSyncState } from '../../sync/index.js';
import { CampView } from './CampView.js';

export function CampScreen() {
  const { snapshot, cachedAt } = useCachedProjections();
  const { online } = useSyncState();
  return <CampView snapshot={snapshot} cachedAt={cachedAt} online={online} />;
}
