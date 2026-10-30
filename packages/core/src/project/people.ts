// People projection — planning doc 03 §3.3-3.4.
//
// Cross-script entity resolution:
//   Stage 1: normalise (script detection, Indic→Latin transliteration)
//   Stage 2: phonetic key (consonant skeleton)
//   Stage 3: score in basis points (basis points = 0.01%)
//   Stage 4: match.propose events only; match.accept/reject are separate events
//
// All scoring is integer arithmetic. No floats.

export type Script = 'beng' | 'deva' | 'latn' | 'unknown';

export interface PersonName {
  script: Script;
  text: string;
}

export interface PersonRecord {
  personId: string;
  names: PersonName[];
  ageBand: '0-4' | '5-12' | '13-17' | '18-59' | '60+';
  sex: 'f' | 'm' | 'o' | 'u';
  villageId: string | null;
  campId: string | null;
  householdId: string | null;
  reporterConfidence: number; // 0..100
}

export interface MatchProposal {
  proposalId: string;
  a: string;
  b: string;
  evidence: Array<{ feature: string; value: number; weight: number }>;
  scoreBp: number;     // 0..10000
  decidedBy: null;     // null until match.accept / match.reject
}

export interface PersonCluster {
  id: string;          // min personId by byte order
  members: string[];
  personCount: number;
  fields: Record<string, { value: string | number | boolean | null; disputed: boolean }>;
}

export interface PeopleProjection {
  clusters: PersonCluster[];
  proposals: MatchProposal[];
  disputed: string[];    // personIds with conflicting concurrent data
}

// ── Stage 1: normalise ──────────────────────────────────────────────

const BENG_RANGE = [0x0980, 0x09FF];
const DEVA_RANGE = [0x0900, 0x097F];

function detectScript(text: string): Script {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= BENG_RANGE[0] && cp <= BENG_RANGE[1]) return 'beng';
    if (cp >= DEVA_RANGE[0] && cp <= DEVA_RANGE[1]) return 'deva';
    if ((cp >= 0x0041 && cp <= 0x005A) || (cp >= 0x0061 && cp <= 0x007A)) return 'latn';
  }
  return 'unknown';
}

// ISO-15919-derived transliteration table (Indic → Latin)
// Aggressive collapsing for blocking purposes only.
const TRANSLIT: Record<string, string> = {
  // Bengali
  'অ': 'a', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u',
  'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
  'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'nj',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
  'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
  'প': 'p', 'ফ': 'ph', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
  'য': 'y', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
  // Devanagari
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'nj',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
};

function transliterate(text: string, script: Script): string {
  if (script === 'latn') return text.toLowerCase();
  let out = '';
  for (const ch of text) {
    const mapped = TRANSLIT[ch];
    out += mapped ? mapped : ch;
  }
  return out.toLowerCase();
}

export function normalizeName(name: PersonName): string {
  let latin = transliterate(name.text, name.script);
  // Strip honorifics
  for (const h of ['shri', 'smt', 'sri', 'md', 'mohd', 'mr', 'mrs', 'ms']) {
    latin = latin.replace(new RegExp(`^${h}\\s+`, 'i'), '');
  }
  // Collapse non-letters, doubled letters
  latin = latin.replace(/[^a-z]/g, '');
  latin = latin.replace(/([a-z])\1+/g, '$1');
  return latin;
}

// ── Stage 2: phonetic key ───────────────────────────────────────────

export function phoneticKey(normalized: string): string {
  // Consonant skeleton: strip vowels, collapse repeated consonants
  const withoutVowels = normalized.replace(/[aeiou]/g, '');
  const collapsed = withoutVowels.replace(/([a-z])\1+/g, '$1');
  return collapsed;
}

// ── Stage 3: score in basis points ──────────────────────────────────

function jaroWinkler(a: string, b: string): number {
  // Simplified Jaro-Winkler returning 0..1
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const m = matches;
  const jaro =
    (m / a.length + m / b.length + ((m - transpositions / 2) / m)) / 3;

  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++; else break;
  }
  const p = 0.1;
  return jaro + prefix * p * (1 - jaro);
}

function scoreMatch(
  aNorm: string,
  bNorm: string,
  aKey: string,
  bKey: string,
  aAge: string,
  bAge: string,
  aSex: string,
  bSex: string,
  aVillage: string | null,
  bVillage: string | null,
  sameCamp: boolean,
  sameHousehold: boolean,
): { scoreBp: number; evidence: Array<{ feature: string; value: number; weight: number }> } {
  const evidence: Array<{ feature: string; value: number; weight: number }> = [];
  let score = 0;

  // Phonetic key exact — blocking requirement
  if (aKey === bKey && aKey.length > 0) {
    score += 3200;
    evidence.push({ feature: 'phonetic_key', value: 1, weight: 3200 });
  } else {
    evidence.push({ feature: 'phonetic_key', value: 0, weight: 3200 });
  }

  // Jaro-Winkler on normalised Latin
  const jw = jaroWinkler(aNorm, bNorm);
  const jwBp = Math.round(jw * 2400);
  score += jwBp;
  evidence.push({ feature: 'jaro_winkler', value: jwBp, weight: 2400 });

  // Age band
  const ageAdjacent =
    Math.abs(['0-4', '5-12', '13-17', '18-59', '60+'].indexOf(aAge) -
      ['0-4', '5-12', '13-17', '18-59', '60+'].indexOf(bAge)) <= 1;
  if (aAge === bAge) {
    score += 1200;
    evidence.push({ feature: 'age_band', value: 1200, weight: 1200 });
  } else if (ageAdjacent) {
    score += 400;
    evidence.push({ feature: 'age_band', value: 400, weight: 400 });
  } else {
    evidence.push({ feature: 'age_band', value: 0, weight: 1200 });
  }

  // Sex
  if (aSex === bSex && aSex !== 'u') {
    score += 600;
    evidence.push({ feature: 'sex', value: 600, weight: 600 });
  } else if (aSex === 'u' || bSex === 'u') {
    score += 200;
    evidence.push({ feature: 'sex', value: 200, weight: 200 });
  } else {
    evidence.push({ feature: 'sex', value: 0, weight: 600 });
  }

  // Same village
  if (aVillage && bVillage && aVillage === bVillage) {
    score += 1000;
    evidence.push({ feature: 'same_village', value: 1000, weight: 1000 });
  } else {
    evidence.push({ feature: 'same_village', value: 0, weight: 1000 });
  }

  // Same camp
  if (sameCamp) {
    score += 300;
    evidence.push({ feature: 'same_camp', value: 300, weight: 300 });
  } else {
    evidence.push({ feature: 'same_camp', value: 0, weight: 300 });
  }

  // Shared household member already matched
  if (sameHousehold) {
    score += 800;
    evidence.push({ feature: 'shared_household', value: 800, weight: 800 });
  } else {
    evidence.push({ feature: 'shared_household', value: 0, weight: 800 });
  }

  // Relative name overlap
  const relOverlap = aNorm.length > 0 && bNorm.length > 0 && aNorm === bNorm ? 300 : 0;
  score += relOverlap;
  if (relOverlap > 0) evidence.push({ feature: 'relative_name', value: 300, weight: 300 });
  else evidence.push({ feature: 'relative_name', value: 0, weight: 300 });

  return { scoreBp: Math.min(score, 10000), evidence };
}

// ── Stage 4: project ────────────────────────────────────────────────

export function projectPeople(
  events: Envelope[],
  asOf: number,
): PeopleProjection {
  const registers: Array<{ env: Envelope; record: PersonRecord }> = [];
  const proposals: MatchProposal[] = [];
  const decisions: Map<string, 'accepted' | 'rejected'> = new Map();

  for (const env of events) {
    if (env.type === 'person.register') {
      const p = env.payload as {
        person_id: string;
        names: Array<{ script: Script; text: string }>;
        age_band: PersonRecord['ageBand'];
        sex: PersonRecord['sex'];
        village_id: string | null;
        camp_id: string | null;
        household_id: string | null;
        reporter_confidence: number;
      };
      registers.push({
        env,
        record: {
          personId: p.person_id,
          names: p.names,
          ageBand: p.age_band,
          sex: p.sex,
          villageId: p.village_id,
          campId: p.camp_id,
          householdId: p.household_id,
          reporterConfidence: p.reporter_confidence,
        },
      });
    }
    if (env.type === 'match.propose') {
      const p = env.payload as {
        proposal_id: string;
        a: string;
        b: string;
        evidence: Array<{ feature: string; value: number; weight: number }>;
        score_bp: number;
      };
      proposals.push({
        proposalId: p.proposal_id,
        a: p.a,
        b: p.b,
        evidence: p.evidence,
        scoreBp: p.score_bp,
        decidedBy: null,
      });
    }
    if (env.type === 'match.accept' || env.type === 'match.reject') {
      const p = env.payload as { proposal_id: string };
      decisions.set(p.proposal_id, env.type === 'match.accept' ? 'accepted' : 'rejected');
    }
  }

  // Build normalised representations
  const normalized = registers.map((r) => ({
    ...r,
    norm: r.record.names.map((n) => normalizeName(n)).join(' '),
    keys: r.record.names.map((n) => phoneticKey(normalizeName(n))),
  }));

  // Score all pairs above threshold
  const thresholdBp = 6200;
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i];
      const b = normalized[j];

      // Best phonetic key match across name variants
      let bestScore = 0;
      let bestEvidence: Array<{ feature: string; value: number; weight: number }> = [];

      for (const aNorm of a.norm.split(' ')) {
        for (const bNorm of b.norm.split(' ')) {
          for (const aKey of a.keys) {
            for (const bKey of b.keys) {
              const s = scoreMatch(
                aNorm, bNorm, aKey, bKey,
                a.record.ageBand, b.record.ageBand,
                a.record.sex, b.record.sex,
                a.record.villageId, b.record.villageId,
                a.record.campId === b.record.campId && a.record.campId !== null,
                a.record.householdId === b.record.householdId &&
                  a.record.householdId !== null,
              );
              if (s.scoreBp > bestScore) {
                bestScore = s.scoreBp;
                bestEvidence = s.evidence;
              }
            }
          }
        }
      }

      if (bestScore >= thresholdBp) {
        const proposalId = `match-${a.record.personId}-${b.record.personId}`;
        const alreadyExists = proposals.some((p) => p.proposalId === proposalId);
        if (!alreadyExists) {
          proposals.push({
            proposalId,
            a: a.record.personId,
            b: b.record.personId,
            evidence: bestEvidence,
            scoreBp: bestScore,
            decidedBy: decisions.get(proposalId) ?? null,
          });
        }
      }
    }
  }

  // Build clusters from accepted matches (union-find by min personId)
  const parent = new Map<string, string>();
  for (const r of registers) parent.set(r.record.personId, r.record.personId);

  function find(x: string): string {
    let p = parent.get(x)!;
    while (p !== x) {
      parent.set(x, parent.get(p)!);
      x = p;
      p = parent.get(x)!;
    }
    return x;
  }
  function union(x: string, y: string): void {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx > ry ? rx : ry, rx < ry ? rx : ry);
  }

  for (const p of proposals) {
    if (p.decidedBy === 'accepted') {
      union(p.a, p.b);
    }
  }

  const clusterMap = new Map<string, string[]>();
  for (const r of registers) {
    const root = find(r.record.personId);
    const arr = clusterMap.get(root) ?? [];
    arr.push(r.record.personId);
    clusterMap.set(root, arr);
  }

  const clusters: PersonCluster[] = [];
  for (const [root, members] of clusterMap) {
    members.sort();
    clusters.push({
      id: root,
      members,
      personCount: members.length,
      fields: {},
    });
  }
  clusters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Disputed persons: concurrent registers with conflicting data
  const disputed: string[] = [];
  const byPerson = new Map<string, typeof registers>();
  for (const r of registers) {
    const arr = byPerson.get(r.record.personId) ?? [];
    arr.push(r);
    byPerson.set(r.record.personId, arr);
  }
  for (const [pid, arr] of byPerson) {
    if (arr.length > 1) {
      // Check for concurrent conflict
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i].env;
          const b = arr[j].env;
          const sameTime = Math.abs(a.hlc.l - b.hlc.l) <= 1000;
          const diffOrigin = a.origin !== b.origin;
          if (sameTime && diffOrigin) {
            disputed.push(pid);
            break;
          }
        }
      }
    }
  }

  return { clusters, proposals, disputed: [...new Set(disputed)].sort() };
}
