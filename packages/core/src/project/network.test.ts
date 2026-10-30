import { describe, expect, it } from 'vitest';
import {
  projectNetwork,
  type RoadObservation,
} from './network.js';
import { createEnvelope, type Envelope } from '../event/envelope.js';
import { hlcInitial } from '../event/hlc.js';

async function makeRoadObs(
  overrides: Partial<RoadObservation> & { at?: number; origin?: string; seq?: number } = {},
): Promise<RoadObservation> {
  const s = hlcInitial();
  return {
    edgeId: 'R1',
    state: 'open',
    cause: 'water',
    depthDm: 0,
    validFrom: 0,
    validUntil: null,
    confidence: 100,
    observedAt: overrides.at ?? s.l,
    hlc: { l: s.l, c: 0 },
    origin: overrides.origin ?? 'dev-1',
    seq: overrides.seq ?? 1,
    ...overrides,
  };
}

async function makeEnv(obs: RoadObservation): Promise<Envelope> {
  return createEnvelope({
    origin: obs.origin,
    seq: obs.seq,
    hlc: obs.hlc,
    vv: { [obs.origin]: obs.seq },
    type: 'obs.road',
    actor: { id: 'actor-1', role: 'volunteer' },
    subject: `edge:${obs.edgeId}`,
    at: obs.observedAt,
    payload: {
      edge_id: obs.edgeId,
      state: obs.state,
      cause: obs.cause,
      depth_dm: obs.depthDm,
      valid_from: obs.validFrom,
      valid_until: obs.validUntil,
      confidence: obs.confidence,
    },
  });
}

describe('projectNetwork', () => {
  it('returns open for no observations', async () => {
    const events: Envelope[] = [];
    const edges = [{ edgeId: 'R1', class: 'residential' }];
    const result = projectNetwork(events, edges, 1000);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('unknown');
    expect(result[0].disputed).toBe(false);
  });

  it('returns passable state from observation', async () => {
    const obs1 = await makeRoadObs({
      edgeId: 'R1',
      state: 'blocked',
      validFrom: 0,
      observedAt: 1000,
    });
    const env1 = await makeEnv(obs1);
    const events = [env1];
    const edges = [{ edgeId: 'R1', class: 'residential' }];
    const result = projectNetwork(events, edges, 1000);
    expect(result[0].state).toBe('blocked');
    expect(result[0].disputed).toBe(false);
  });

  it('flags disputed when concurrent disagreeing observations', async () => {
    const t = 1000;
    const obs1 = await makeRoadObs({
      edgeId: 'R1',
      state: 'open',
      validFrom: 0,
      observedAt: t,
      origin: 'dev-1',
      seq: 1,
    });
    const obs2 = await makeRoadObs({
      edgeId: 'R1',
      state: 'blocked',
      validFrom: 0,
      observedAt: t,
      origin: 'dev-2',
      seq: 1,
    });
    const env1 = await makeEnv(obs1);
    const env2 = await makeEnv(obs2);
    const events = [env1, env2];
    const edges = [{ edgeId: 'R1', class: 'residential' }];
    const result = projectNetwork(events, edges, t);
    expect(result[0].disputed).toBe(true);
  });

  it('returns unknown outside validity window', async () => {
    const obs1 = await makeRoadObs({
      edgeId: 'R1',
      state: 'blocked',
      validFrom: 2000,
      validUntil: 3000,
      observedAt: 1000,
    });
    const env1 = await makeEnv(obs1);
    const events = [env1];
    const edges = [{ edgeId: 'R1', class: 'residential' }];
    // asOf = 500, before validFrom
    const result = projectNetwork(events, edges, 500);
    expect(result[0].state).toBe('unknown');
    // asOf = 3500, after validUntil
    const result2 = projectNetwork(events, edges, 3500);
    expect(result2[0].state).toBe('unknown');
  });
});
