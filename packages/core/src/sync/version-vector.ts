// Version vector — per-origin max contiguous seq.
// Keyed on (origin, seq): origin = device that created the event.
// Transitive relay: a requester that has never seen origin C starts at 0 and
// receives everything the responder holds from C.

export type VersionVector = Record<string, number>;

export function vvEmpty(): VersionVector {
  return {};
}

export function vvGet(vv: VersionVector, origin: string): number {
  return vv[origin] ?? 0;
}

export function vvSet(vv: VersionVector, origin: string, seq: number): VersionVector {
  vv[origin] = seq;
  return vv;
}

export function vvMerge(target: VersionVector, source: VersionVector): VersionVector {
  for (const [origin, seq] of Object.entries(source)) {
    const cur = target[origin] ?? 0;
    if (seq > cur) target[origin] = seq;
  }
  return target;
}

export function vvEqual(a: VersionVector, b: VersionVector): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  }
  return true;
}

export function vvClone(vv: VersionVector): VersionVector {
  return { ...vv };
}

export function vvToSortedEntries(vv: VersionVector): [string, number][] {
  return Object.entries(vv).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
