import { useCachedProjections } from '../../offline/index.js';
import { useSyncState } from '../../sync/index.js';
import { useRemotePeople } from '../../offline/useRemotePeople.js';
import { CampView } from './CampView.js';

export function CampScreen({ onOpenReport }: { onOpenReport?: (clientEventId: string) => void }) {
  const { snapshot, cachedAt } = useCachedProjections();
  const { online } = useSyncState();
  const people = useRemotePeople();
  return <CampView snapshot={snapshot} cachedAt={cachedAt} online={online} people={people.snapshot} peopleUnavailable={people.unavailable} onOpenReport={onOpenReport} />;
}
