// Hybrid Logical Clock.
// Returns (l, c) where l is a physical-time lower bound and c is a logical counter.
// HLC gives a total order consistent with happened-before, but does NOT detect
// concurrency — that requires the vector clock (vv) carried in each event.

export interface HLC {
  l: number; // physical ms (monotone, >= wall clock at last update)
  c: number; // logical counter for same-l events
}

export interface HLCState {
  l: number;
  c: number;
}

export function hlcNow(state: HLCState): HLC {
  const now = Date.now();
  if (now > state.l) {
    return { l: now, c: 0 };
  }
  return { l: state.l, c: state.c + 1 };
}

export function hlcUpdate(state: HLCState, receivedL: number): HLCState {
  const l = Math.max(state.l, receivedL);
  const c = l === state.l ? state.c + 1 : 0;
  return { l, c };
}

export function hlcCompare(a: HLC, b: HLC): number {
  if (a.l !== b.l) return a.l < b.l ? -1 : 1;
  if (a.c !== b.c) return a.c < b.c ? -1 : 1;
  return 0;
}

export function hlcInitial(): HLCState {
  return { l: Date.now(), c: 0 };
}
