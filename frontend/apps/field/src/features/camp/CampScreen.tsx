import { useCachedProjections } from '../../offline/index.js';
import { useSyncState } from '../../sync/index.js';
import type { PeopleSnapshot } from '@setu/contract';
import { CampView } from './CampView.js';

export function CampScreen({ onOpenReport, people, peopleUnavailable }: { onOpenReport?: (clientEventId: string) => void; people?: PeopleSnapshot; peopleUnavailable?: boolean }) {
  const { snapshot, cachedAt } = useCachedProjections();
  const { online } = useSyncState();
  return <CampView snapshot={snapshot} cachedAt={cachedAt} online={online} people={people} peopleUnavailable={peopleUnavailable} onOpenReport={onOpenReport} />;
}
