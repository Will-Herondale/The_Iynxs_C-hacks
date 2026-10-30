import { describe, expect, it } from 'vitest';
import { ingestEvent, ingestBatch, MAX_EVENT_BYTES } from './ingest.js';
import { syncStateEmpty, type SyncState } from './types.js';
import { createEnvelope, type Envelope } from '../event/envelope.js';
import { hlcInitial } from '../event/hlc.js';

type MakeEnvOverrides = Omit<Partial<Envelope>, 'v' | 'id' | 'hash' | 'sig'>;

async function makeEnv(overrides: MakeEnvOverrides = {}): Promise<Envelope> {
  const s = hlcInitial();
  const h = { l: s.l, c: s.c };
  return createEnvelope({
    origin: 'dev-1',
    seq: 1,
    hlc: h,
    vv: { 'dev-1': 1 },
    type: 'test.event',
    actor: { id: 'actor-1', role: 'volunteer' },
    subject: 'obj-1',
    at: s.l,
    payload: { value: 42 },
    ...overrides,
  });
}

function makeSyncState(): SyncState {
  return syncStateEmpty();
}

describe('ingestEvent', () => {
  it('accepts a contiguous first event', async () => {
    const state = makeSyncState();
    const env = await makeEnv({ origin: 'd1', seq: 1 });
    const result = ingestEvent(state, env);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.state.hwm['d1']).toBe(1);
  });

  it('rejects invalid envelope', async () => {
    const state = makeSyncState();
    const env = await makeEnv({ seq: 0 });
    const result = ingestEvent(state, env);
    expect(result.rejected).toHaveLength(1);
    expect(result.accepted).toHaveLength(0);
  });

  it('idempotent: duplicate delivery ignored', async () => {
    const state = makeSyncState();
    const env = await makeEnv({ origin: 'd1', seq: 1 });
    const r1 = ingestEvent(state, env);
    const r2 = ingestEvent(r1.state, env);
    expect(r2.accepted).toHaveLength(0);
    expect(r2.state.hwm['d1']).toBe(1);
  });

  it('rejects hash collision: same origin+seq, different id', async () => {
    const state = makeSyncState();
    const env1 = await makeEnv({ origin: 'd1', seq: 1 });
    const env2 = await makeEnv({ origin: 'd1', seq: 1 }); // different id (ULID)
    const r1 = ingestEvent(state, env1);
    const r2 = ingestEvent(r1.state, env2);
    expect(r2.rejected).toHaveLength(1);
    expect(r2.rejected[0].reason).toContain('collision');
    expect(r2.state.hwm['d1']).toBe(1);
  });

  it('parks out-of-order event in holes table', async () => {
    const state = makeSyncState();
    const env1 = await makeEnv({ origin: 'd1', seq: 1 });
    const env3 = await makeEnv({ origin: 'd1', seq: 3 });
    const r1 = ingestEvent(state, env1);
    const r2 = ingestEvent(r1.state, env3);
    expect(r2.accepted).toHaveLength(0);
    expect(r2.state.hwm['d1']).toBe(1);
    const holes = r2.state.holes.get('d1');
    expect(holes?.has(3)).toBe(true);
  });

  it('advances hwm through filled holes', async () => {
    const state = makeSyncState();
    const env1 = await makeEnv({ origin: 'd1', seq: 1 });
    const env3 = await makeEnv({ origin: 'd1', seq: 3 });
    const env2 = await makeEnv({ origin: 'd1', seq: 2 });
    const r1 = ingestEvent(state, env1);
    const r2 = ingestEvent(r1.state, env3); // parked in holes
    const r3 = ingestEvent(r2.state, env2); // fills hole, advances to 3
    expect(r3.state.hwm['d1']).toBe(3);
    expect(r3.state.holes.get('d1')?.size).toBe(0);
  });

  it('multi-origin hwm is independent', async () => {
    const state = makeSyncState();
    const e1 = await makeEnv({ origin: 'd1', seq: 1 });
    const e2 = await makeEnv({ origin: 'd2', seq: 1 });
    const r1 = ingestEvent(state, e1);
    const r2 = ingestEvent(r1.state, e2);
    expect(r2.state.hwm['d1']).toBe(1);
    expect(r2.state.hwm['d2']).toBe(1);
  });

  it('enforces max event size', async () => {
    const state = makeSyncState();
    const bigPayload = { data: 'x'.repeat(MAX_EVENT_BYTES) };
    const env = await makeEnv({ payload: bigPayload });
    const result = ingestEvent(state, env);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('too large');
  });

  it('does not mutate input state', async () => {
    const state = makeSyncState();
    const env = await makeEnv({ origin: 'd1', seq: 1 });
    ingestEvent(state, env);
    expect(state.hwm['d1']).toBeUndefined();
    expect(state.seen.size).toBe(0);
  });
});

describe('ingestBatch', () => {
  it('sorts and ingests deterministically', async () => {
    const state = makeSyncState();
    const e1 = await makeEnv({ origin: 'd1', seq: 2 });
    const e2 = await makeEnv({ origin: 'd1', seq: 1 });
    const e3 = await makeEnv({ origin: 'd2', seq: 1 });
    const result = ingestBatch(state, [e1, e2, e3]);
    expect(result.accepted).toHaveLength(3);
    expect(result.state.hwm['d1']).toBe(2);
    expect(result.state.hwm['d2']).toBe(1);
  });

  it('handles partial batch with holes', async () => {
    const state = makeSyncState();
    const e1 = await makeEnv({ origin: 'd1', seq: 1 });
    const e3 = await makeEnv({ origin: 'd1', seq: 3 });
    const result = ingestBatch(state, [e1, e3]);
    expect(result.accepted).toHaveLength(1);
    expect(result.state.holes.get('d1')?.has(3)).toBe(true);
  });
});

describe('MAX_EVENT_BYTES', () => {
  it('is 64 KB', () => {
    expect(MAX_EVENT_BYTES).toBe(64 * 1024);
  });
});
