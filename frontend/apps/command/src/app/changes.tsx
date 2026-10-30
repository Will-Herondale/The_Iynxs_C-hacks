import { createContext, useContext, type ReactNode } from 'react';
import { useProjections } from '../data';
import { useSnapshotHistory } from '../feed/history';
import { useSnapshotChanges } from '../feed/useSnapshotChanges';
import type { ChangeBatch } from '../feed/useSnapshotChanges';

const Ctx = createContext<ChangeBatch[]>([]);

/** Keeps the server-snapshot diff history for the whole session, whichever section is open. */
export function ChangesProvider({ children }: { children: ReactNode }) {
  const { snapshot } = useProjections();
  const batches = useSnapshotChanges(snapshot);
  useSnapshotHistory(snapshot);
  return <Ctx.Provider value={batches}>{children}</Ctx.Provider>;
}

export function useChangeBatches(): ChangeBatch[] {
  return useContext(Ctx);
}
