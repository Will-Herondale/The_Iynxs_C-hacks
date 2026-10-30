import { describe, expect, it } from 'vitest';
import {
  createEnvelope,
  envelopeIsValid,
  happensBefore,
  totalOrder,
  type Envelope,
} from './envelope.js';
import { contentHash } from './content-hash.js';
import { hlcInitial } from './hlc.js';

async function makeEnv(overrides: Partial<Envelope> = {}): Promise<Envelope> {
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

describe('envelope', () => {
  it('creates valid envelope with content hash', async () => {
    const env = await makeEnv();
    expect(envelopeIsValid(env).valid).toBe(true);
    expect(env.hash).toBeDefined();
    expect(env.hash.length).toBe(64);
    expect(env.id.length).toBe(26);
  });

  it('content hash changes when payload changes', async () => {
    const a = await makeEnv({ payload: { value: 1 } });
    const b = await makeEnv({ payload: { value: 2 } });
    expect(a.hash).not.toBe(b.hash);
  });

  it('content hash is deterministic for same content (same id)', async () => {
    const s = hlcInitial();
    const h = { l: s.l, c: s.c };
    const base = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      origin: 'd', seq: 1, hlc: h, vv: { d: 1 }, type: 't',
      actor: { id: 'a', role: 'r' }, subject: 's', at: s.l, payload: { x: 1 },
    };
    const a = await createEnvelope({ ...base });
    const b = await createEnvelope({ ...base });
    expect(a.hash).toBe(b.hash);
    expect(a.id).toBe(b.id); // same explicit id
  });

  it('content hash differs when id differs (hash binds to identity)', async () => {
    const s = hlcInitial();
    const h = { l: s.l, c: s.c };
    const a = await createEnvelope({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      origin: 'd', seq: 1, hlc: h, vv: { d: 1 }, type: 't',
      actor: { id: 'a', role: 'r' }, subject: 's', at: s.l, payload: { x: 1 },
    });
    const b = await createEnvelope({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FBV',
      origin: 'd', seq: 1, hlc: h, vv: { d: 1 }, type: 't',
      actor: { id: 'a', role: 'r' }, subject: 's', at: s.l, payload: { x: 1 },
    });
    expect(a.hash).not.toBe(b.hash);
    expect(a.id).not.toBe(b.id);
  });

  it('rejects floats in payload', async () => {
    await expect(createEnvelope({
      origin: 'd', seq: 1, hlc: { l: 1, c: 0 }, vv: {}, type: 't',
      actor: { id: 'a', role: 'r' }, subject: null, at: 1, payload: { depth: 1.5 },
    })).rejects.toThrow();
  });

  it('envelopeIsValid catches bad seq', () => {
    const env: Envelope = {
      v: 1, id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', origin: 'd', seq: 0,
      hlc: { l: 1, c: 0 }, vv: {}, type: 't',
      actor: { id: 'a', role: 'r' }, subject: null, at: 1, payload: {},
      hash: 'abc', sig: null,
    };
    expect(envelopeIsValid(env).valid).toBe(false);
  });

  it('happensBefore detects causal ordering', async () => {
    const a = await createEnvelope({ origin: 'd', seq: 1, hlc: { l: 100, c: 0 }, vv: { d: 1 }, type: 't', actor: { id: 'a', role: 'r' }, subject: 's', at: 100, payload: {} });
    const b = await createEnvelope({ origin: 'd', seq: 2, hlc: { l: 101, c: 0 }, vv: { d: 2 }, type: 't', actor: { id: 'a', role: 'r' }, subject: 's', at: 101, payload: {} });
    expect(happensBefore(a, b)).toBe(true);
    expect(happensBefore(b, a)).toBe(false);
  });

  it('happensBefore returns false for concurrent events', async () => {
    const a = await createEnvelope({ origin: 'd1', seq: 1, hlc: { l: 100, c: 0 }, vv: { d1: 1 }, type: 't', actor: { id: 'a', role: 'r' }, subject: 's', at: 100, payload: {} });
    const b = await createEnvelope({ origin: 'd2', seq: 1, hlc: { l: 100, c: 0 }, vv: { d2: 1 }, type: 't', actor: { id: 'a', role: 'r' }, subject: 's', at: 100, payload: {} });
    expect(happensBefore(a, b)).toBe(false);
    expect(happensBefore(b, a)).toBe(false);
  });

  it('totalOrder is deterministic for concurrent events', async () => {
    const a = await createEnvelope({ origin: 'd1', seq: 1, hlc: { l: 100, c: 0 }, vv: { d1: 1 }, type: 't', actor: { id: 'a', role: 'r' }, subject: 's', at: 100, payload: {} });
    const b = await createEnvelope({ origin: 'd2', seq: 1, hlc: { l: 100, c: 0 }, vv: { d2: 1 }, type: 't', actor: { id: 'a', role: 'r' }, subject: 's', at: 100, payload: {} });
    const cmp = totalOrder(a, b);
    expect(cmp).not.toBe(0);
    expect(totalOrder(b, a)).toBe(-cmp);
  });

  it('contentHash is idempotent (calling twice gives same result)', async () => {
    const env = await makeEnv();
    const h1 = await contentHash(env);
    const h2 = await contentHash(env);
    expect(h1).toBe(h2);
  });
});
