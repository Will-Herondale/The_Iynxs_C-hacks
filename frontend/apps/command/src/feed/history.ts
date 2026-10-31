import { useEffect } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';

const MAX_SNAPSHOTS = 30;
const held = new Map<number, ProjectionSnapshot>();

/** Remembers the server snapshots this session has seen, by version (bounded). Display-only. */
export function recordSnapshot(snapshot: ProjectionSnapshot | undefined): void {
  if (!snapshot || held.has(snapshot.version)) return;
  held.set(snapshot.version, snapshot);
  if (held.size > MAX_SNAPSHOTS) {
    const oldest = Math.min(...held.keys());
    held.delete(oldest);
  }
}

export function snapshotAt(version: number): ProjectionSnapshot | undefined {
  return held.get(version);
}

/** The newest held snapshot strictly older than `version`. */
export function snapshotBefore(version: number): ProjectionSnapshot | undefined {
  let best: ProjectionSnapshot | undefined;
  for (const [v, s] of held) if (v < version && (!best || v > best.version)) best = s;
  return best;
}

export function resetSnapshotHistory(): void {
  held.clear();
}

export function useSnapshotHistory(snapshot: ProjectionSnapshot | undefined): void {
  useEffect(() => recordSnapshot(snapshot), [snapshot]);
}
