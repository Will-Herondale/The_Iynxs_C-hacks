import { useEffect, useRef, useState } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';
import { diffSnapshots, type SnapshotChange } from './diff';

export interface ChangeBatch {
  version: number;
  at: number;
  changes: SnapshotChange[];
}

const MAX_BATCHES = 5;

/** Remembers the previous server snapshot and records what changed on each version bump. */
export function useSnapshotChanges(snapshot?: ProjectionSnapshot): ChangeBatch[] {
  const prev = useRef<ProjectionSnapshot | undefined>(undefined);
  const [batches, setBatches] = useState<ChangeBatch[]>([]);

  useEffect(() => {
    if (!snapshot) return;
    const before = prev.current;
    prev.current = snapshot;
    if (!before || before.version === snapshot.version) return;
    const changes = diffSnapshots(before, snapshot);
    if (changes.length === 0) return;
    setBatches((b) => [{ version: snapshot.version, at: Date.now(), changes }, ...b].slice(0, MAX_BATCHES));
  }, [snapshot]);

  return batches;
}
