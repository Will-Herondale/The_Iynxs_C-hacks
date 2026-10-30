# 03 — Event Model and Merge Semantics

This is the contract. Everything else is a projection of it.

## 1. Envelope

```ts
interface Envelope {
  v: 1;                        // schema major version
  id: string;                  // ULID — identity only, NEVER trusted for ordering
  origin: string;              // device that CREATED the event; never renumbered by relays
  seq: number;                 // gap-free per-origin counter, starts at 1
  hlc: { l: number; c: number };  // hybrid logical clock: physical ms, logical counter
  vv: Record<string, number>;  // causal frontier known to the creator: origin -> max seq
  type: EventType;
  actor: { id: string; role: Role };
  subject: string | null;      // canonical entity key, e.g. "edge:way/123456" or "person:PE-0007"
  at: number;                  // epoch ms, OBSERVED time (payload data, untrusted)
  payload: Json;               // no floats. integers, strings, booleans, null, arrays, objects
  hash: string;                // sha256 of canonical JSON of all fields above
  sig: string | null;          // ed25519 over hash, base64url
}
```

Rules that are enforced, not assumed:

1. **`id` and `hash` are different things.** `id` is a ULID (time-sortable identity). `hash` is integrity. The original design conflated "content-addressed" with "ULID"; both cannot be true. Deduplication is *semantic*, in the projection (see §5).
2. **`(origin, seq)` is unique across the universe.** Enforced on load. A restored backup that clones a `device_id` must fail loudly, so `device_id` is regenerated on first boot and the keypair with it.
3. **No floats anywhere in `payload`.** Floating-point addition is not associative, so two replicas can fold the same events into different numbers. Water depths are integers in **decimetres**; scores are integers in **basis points**; coordinates are integer microdegrees. A validator rejects floats at ingest.
4. **`at` is untrusted input.** It is clamped to `hlc.l + 5 min` on ingest; a clamp sets `suspect_clock: true`, which the projection surfaces. Never use `at` for ordering — only for *valid-time selection*.
5. **`vv` is the causal frontier at creation.** This is what lets the fold distinguish "B supersedes A" from "B raced A". Without it, HLC gives a total order that is consistent with causality but cannot *detect* concurrency, and the system would silently pick a winner between two contradictory bridge reports.

## 2. Event types (v1)

Payload fields are abbreviated; all values are integers unless noted.

### 2.1 Water observations — drive the flood projection

```ts
type ObsWater = {
  type: "obs.water";
  subject: "point:<point_id>";
  payload: {
    point_id: string;        // a surveyed reference point with a known DEM elevation
    kind: "depth_over_ref" | "stage_at_gauge";
    value_dm: number;        // depth above the reference, decimetres
    ref_kind: "bridge_deck" | "road_surface" | "embankment_crest" | "gauge_zero";
    method: "visual" | "staff" | "reported";
    confidence: number;      // 0..100
  };
};
```

`depth_over_ref` is the primary form. It requires no vertical datum: water-surface elevation is `z_ref(DEM) + depth / 10`. See [02-architecture.md](./02-architecture.md) ADR-8 and [05-geo-and-inundation.md](./05-geo-and-inundation.md) §5.

### 2.2 Road state — valid-time observations, not state mutation

```ts
type ObsRoad = {
  type: "obs.road";
  subject: "edge:<edge_id>";
  payload: {
    edge_id: string;
    state: "passable" | "impassable" | "restricted";
    cause: "water" | "debris" | "structural" | "unknown";
    depth_dm: number | null;
    valid_from: number;      // epoch ms
    valid_until: number | null;  // null = open-ended, NOT infinity
    confidence: number;      // 0..100
    note: string | null;
  };
};
```

### 2.3 Registry

```ts
type PersonRegister = {
  type: "person.register";
  subject: "person:<person_id>";
  payload: {
    person_id: string;
    names: Array<{ script: "beng" | "deva" | "latn"; text: string }>;   // one or more scripts
    age_band: "0-4" | "5-12" | "13-17" | "18-59" | "60+";
    sex: "f" | "m" | "o" | "u";
    village_id: string | null;
    camp_id: string | null;
    household_id: string | null;
    relation_to_reporter: string | null;
    reporter_confidence: number;   // 0..100
  };
};

type PersonSighting = {
  type: "person.sighting";
  subject: "person:<person_id>" | "sighting:<sighting_id>";
  payload: { person_id: string | null; description: string; place_id: string; at: number };
};

type MatchPropose = {
  type: "match.propose";
  subject: "person:<a>|<b>";
  payload: {
    proposal_id: string; a: string; b: string;
    evidence: Array<{ feature: string; value: number; weight: number }>;  // integer bp
    score_bp: number;          // 0..10000
    decided_by: null;
  };
};

type MatchDecision = {   // accept or reject; a human decision is an event
  type: "match.accept" | "match.reject";
  subject: "match:<proposal_id>";
  payload: { proposal_id: string; rationale: string | null };
};
```

### 2.4 Infrastructure and configuration

```ts
type ShelterStatus = {
  type: "shelter.status";
  subject: "shelter:<shelter_id>";
  payload: { shelter_id: string; open: 0 | 1; capacity: number; occupancy: number; valid_from: number; valid_until: number | null };
};

type ThresholdSet = {          // thresholds are events, so they are auditable and replayable
  type: "threshold.set";
  subject: "class:<road_class>";
  payload: { road_class: string; max_depth_dm: number; speed_dry_kph: number };
};

type RosterAdd = {             // trust root: manual, signed by the console device
  type: "roster.add";
  subject: "device:<device_id>";
  payload: { device_id: string; pubkey: string; role: Role; display_name: string };
};
```

### 2.5 Scenario driver — the demo is itself event-sourced

```ts
type ScenarioStage = {
  type: "scenario.stage";
  subject: "scenario:<scenario_id>";
  payload: { scenario_id: string; t_sim: number; depth_dm_at_point: string /* point_id */; note: string };
};
```

Raising the water level during the demo appends a `scenario.stage` event. This is not a hack — it means the demo is a *replayable scenario* rather than a sequence of imperative UI calls, and the audit view can rewind it.

`Role = "volunteer" | "camp_officer" | "commander" | "simulator"`.

## 3. Merge semantics, stated precisely

### 3.1 What is actually convergent

The event *set* is a grow-only set merged by union. Union is commutative, associative and idempotent, so:

> **Theorem (set convergence).** If two replicas have received the same set of events, their logs are equal as sets, regardless of order or duplication.

This is easy and it is not the interesting claim. The interesting claim is that the **projection** is a pure function:

```
project: (EventSet, asOf) -> CanonicalJSON
```

with the properties:

- **P1 Determinism** — same set, same `asOf`, same output bytes, on any replica, in any process, any locale, any timezone.
- **P2 Order independence** — `project(sort(S), asOf) = project(shuffle(S), asOf)`.
- **P3 Idempotence** — `project(S ∪ S, asOf) = project(S, asOf)`.
- **P4 Monotone-append safety** — adding events never invalidates the fact that the previous output was correct *for the previous event set*; the UI shows `revision = hash(project(S))` so a stale view is visibly stale.

`asOf` is always passed explicitly. It is never `Date.now()` inside the fold.

### 3.2 Selection rule for time-valid observations (road state)

For edge `e`, attribute `a`, at slot time `t`:

```
candidates = [ o | o.subject = e, o covers t, o.state ≠ null ]
rank(o)    = (o.observed_at, o.confidence, o.hlc.l, o.hlc.c, o.origin, o.seq)
winner     = argmax rank
```

Then:

- If the top two candidates **disagree on `state`** and are **causally concurrent** (`!causallyBefore(top2, winner)`), set `state = "disputed"` on that edge for that slot. The UI renders **contested**, never free and never passable.
- If `cause = "water"` and the winner is `passable` while a concurrent observation says `impassable`, the pessimistic value wins for routing. A false negative kills; a false positive costs a detour.
- `valid_until: null` means "open-ended", which the fold treats as extending to the horizon. It never means infinity in a numeric sense and is never arithmetic.

### 3.3 Selection rule for the water driver

The active water observation is the `obs.water` with the highest `rank` **whose `at` is ≤ asOf**, subject to `suspect_clock = false`. If the highest-ranked observation is `suspect_clock`, it is shown in a quarantine strip and *not* used to drive inundation. This is a deliberate, visible safety choice: a phone with a wrong date must not flood a village.

### 3.4 Person identity

- `person.register` events for the same `person_id` from different replicas are **the same person** only if a `match.accept` exists or they share a `person_id` by construction. Registers are not merged automatically.
- The projection computes a **cluster** = union-find over accepted matches. Cluster identifier = `min(person_id)` by byte order — deterministic, not arrival order.
- Conflicting demographic fields within a cluster are resolved per field by `rank`, with `disputed` flagged when concurrent.

## 4. Entity resolution — cross-script

Three stages, all integer arithmetic, all deterministic.

**Stage 1 — normalise.**
Script detection by code-point range (`beng` U+0980–09FF, `deva` U+0900–097F, `latn`). Transliterate Indic → Latin with a static ISO-15919-derived table (aspirated consonants collapsed, `ṛ/ṟ` → `r`, `ś/ṣ` → `s`, `ñ` → `n`, final vowels dropped). Lowercase, strip honorifics (`shri`, `smt`, `md`, `mohd`), collapse doubled letters, remove non-letters.

**Stage 2 — phonetic key.**
Consonant skeleton with vowels folded to a single placeholder: `bipul` → `bpl`, `বিপুল` → `bpl`. This catches transliteration variance (`Bipul` / `Bipool` / `বিপুল`) that edit distance misses. Deliberately aggressive; it is a *blocking* key, not a decision.

**Stage 3 — score in basis points.**

| Feature | Weight (bp) | Rule |
|---|---|---|
| phonetic key exact | 3200 | blocking requirement in the common case |
| Jaro–Winkler on normalised Latin | 0–2400 | `round(2400 * jw)` |
| age band equal / adjacent | 1200 / 400 | |
| sex match / unknown | 600 / 200 | |
| same village | 1000 | |
| same camp | 300 | |
| shared household member already matched | 800 | transitive evidence |
| relative name overlap | 300 | |

`score_bp ≥ 6200` → `match.propose` is emitted automatically. **Nothing is auto-accepted.** The console shows the evidence table; the officer accepts or rejects; the decision is an event.

Why not a library: no CRDT, ER package, or fuzzy-matcher expresses "reviewed merge as an event" with integer-deterministic scoring across two scripts. The transliteration table is ~120 lines and is the only genuinely Indic-specific code in the project.

**Honest limitation, stated on screen:** this finds people who were *registered*. It does not find missing persons who were never reported, and the phonetic key will produce false positives on very common name skeletons (`bpl`, `rk`). The review gate exists because of that.

## 5. Semantic deduplication (projection-level)

Two volunteers often report the same bridge within minutes. Ids differ, so log-level dedupe does nothing. Instead, the projection derives:

```
dedupe_key = sha256(type | subject | actor.id | observed_at_bucket_60s | payload_semantic_subset)
```

Collapse each `dedupe_key` group to its minimum-`(hlc.l, hlc.c, origin, seq)` representative and carry `duplicate_count`. The log keeps every event (audit), the projection collapses them (signal). This is why "content-addressed events" is unnecessary — the semantics handle it.

## 6. Validation at ingest

Reject (quarantine, never drop) if:

- `payload` contains a float, `NaN`, `Infinity`, or a key that is not NFC-normalised.
- `hash` does not match recomputed canonical hash.
- `(origin, seq)` already exists with a different `hash` → **collision**: quarantine both, raise an integrity alert.
- `seq` is not `hwm[origin] + 1` → hold in the `holes` table and re-request (see [04-sync-protocol.md](./04-sync-protocol.md)).
- `sig` invalid or `origin` not in roster → store, exclude from projection, show in quarantine.

## 7. Canonical JSON

Keys sorted by UTF-16 code unit; no whitespace; integers only, no exponent notation; strings NFC; `null` retained; UTF-8 encoding. `hash = sha256(canonicalJson(envelopeWithoutSigAndHash))`. The same function produces the projection revision `hash(project(S, asOf))`, which is what the convergence harness compares.
