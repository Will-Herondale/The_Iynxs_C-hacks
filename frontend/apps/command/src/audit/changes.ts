import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import { diffSnapshots, type SnapshotChange } from '../feed/diff';
import { snapshotAt, snapshotBefore } from '../feed/history';
import { affectedIndex, featuresAffectedBy } from './model';
import type { Selection } from '../app';

export interface ResultingChanges {
  /** Features whose server-side sourceEventIds reference this event (reverse lookup). */
  affected: Selection[];
  /** Snapshot diff at the version this event was applied; null when that version was not seen by this session. */
  diff: SnapshotChange[] | null;
  appliedAtVersion?: number;
}

/** Payload as pretty JSON for the drawer. */
export function payloadJson(rec: EventRecord): string {
  return JSON.stringify(rec.event, null, 2);
}

/**
 * Why did things change because of this event: reverse sourceEventIds lookup on the current
 * server snapshot plus a display-only diff of the held snapshots around appliedAtVersion.
 */
export function resultingChanges(rec: EventRecord, current: ProjectionSnapshot | undefined): ResultingChanges {
  const affected = featuresAffectedBy(rec, affectedIndex(current));
  const v = rec.appliedAtVersion;
  if (rec.serverState !== 'applied' || v === undefined) return { affected, diff: null };
  const after = snapshotAt(v) ?? (current?.version === v ? current : undefined);
  const before = snapshotBefore(v);
  if (!after || !before) return { affected, diff: null, appliedAtVersion: v };
  return { affected, diff: diffSnapshots(before, after), appliedAtVersion: v };
}
