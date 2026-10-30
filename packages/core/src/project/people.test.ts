import { describe, expect, it } from 'vitest';
import {
  projectPeople,
  normalizeName,
  phoneticKey,
  type PersonName,
} from './people.js';
import { createEnvelope, type Envelope } from '../event/envelope.js';
import { hlcInitial } from '../event/hlc.js';

async function makeRegister(
  overrides: Partial<{
    personId: string;
    names: PersonName[];
    ageBand: string;
    sex: string;
    villageId: string | null;
    campId: string | null;
    householdId: string | null;
    reporterConfidence: number;
    at: number;
    origin: string;
    seq: number;
  }> = {},
): Promise<Envelope> {
  const s = hlcInitial();
  return createEnvelope({
    origin: overrides.origin ?? 'dev-1',
    seq: overrides.seq ?? 1,
    hlc: { l: overrides.at ?? s.l, c: 0 },
    vv: { [overrides.origin ?? 'dev-1']: overrides.seq ?? 1 },
    type: 'person.register',
    actor: { id: 'actor-1', role: 'volunteer' },
    subject: `person:${overrides.personId ?? 'P1'}`,
    at: overrides.at ?? s.l,
    payload: {
      person_id: overrides.personId ?? 'P1',
      names: overrides.names ?? [{ script: 'latn' as const, text: 'Bipul' }],
      age_band: (overrides.ageBand ?? '18-59') as any,
      sex: (overrides.sex ?? 'm') as any,
      village_id: overrides.villageId ?? 'V1',
      camp_id: overrides.campId ?? null,
      household_id: overrides.householdId ?? null,
      reporter_confidence: overrides.reporterConfidence ?? 90,
    },
  });
}

describe('normalizeName', () => {
  it('lowercases and strips non-letters', () => {
    expect(normalizeName({ script: 'latn', text: 'Bipul!' })).toBe('bipul');
    expect(normalizeName({ script: 'latn', text: 'Shri Ram' })).toBe('ram'); // shri stripped, ram kept
    expect(normalizeName({ script: 'latn', text: 'AABBC' })).toBe('abc'); // doubled letters collapsed
  });
});

describe('phoneticKey', () => {
  it('produces consonant skeleton', () => {
    expect(phoneticKey('bipul')).toBe('bpl');
    expect(phoneticKey('ram')).toBe('rm');
  });
});

describe('projectPeople', () => {
  it('creates clusters from single register', async () => {
    const env1 = await makeRegister({ personId: 'P1' });
    const result = projectPeople([env1], 1000);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members).toContain('P1');
    expect(result.proposals).toHaveLength(0);
  });

  it('proposes match for similar names above threshold', async () => {
    const env1 = await makeRegister({
      personId: 'P1',
      names: [{ script: 'latn', text: 'Bipul' }],
      ageBand: '18-59',
      sex: 'm',
      villageId: 'V1',
    });
    const env2 = await makeRegister({
      personId: 'P2',
      names: [{ script: 'latn', text: 'Bipul' }],
      ageBand: '18-59',
      sex: 'm',
      villageId: 'V1',
    });
    const result = projectPeople([env1, env2], 1000);
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.proposals[0].scoreBp).toBeGreaterThanOrEqual(6200);
  });

  it('does not propose match for dissimilar names', async () => {
    const env1 = await makeRegister({
      personId: 'P1',
      names: [{ script: 'latn', text: 'Bipul' }],
      ageBand: '18-59',
      sex: 'm',
      villageId: 'V1',
    });
    const env2 = await makeRegister({
      personId: 'P2',
      names: [{ script: 'latn', text: 'Rahim' }],
      ageBand: '0-4',
      sex: 'f',
      villageId: 'V9',
    });
    const result = projectPeople([env1, env2], 1000);
    expect(result.proposals.length).toBe(0);
  });

  it('flags disputed for concurrent registers from different origins', async () => {
    const t = 1000;
    const env1 = await makeRegister({
      personId: 'P1',
      names: [{ script: 'latn', text: 'Bipul' }],
      at: t,
      origin: 'dev-1',
      seq: 1,
    });
    const env2 = await makeRegister({
      personId: 'P1',
      names: [{ script: 'latn', text: 'Rahim' }],
      at: t,
      origin: 'dev-2',
      seq: 1,
    });
    const result = projectPeople([env1, env2], t);
    expect(result.disputed).toContain('P1');
  });
});
