# 02 — Architecture and Decision Record

Status: **proposed, awaiting technical-lead approval.**

## 1. System shape

```
 ┌──────────────┐   ┌──────────────┐   ┌────────────────┐
 │  FIELD  app  │   │  CAMP  app   │   │  CONSOLE       │
 │  (offline)   │   │  (offline)   │   │  (command)     │
 └──────┬───────┘   └──────┬───────┘   └───────┬────────┘
        │  local log       │ local log         │ local log
        └──────────┬───────┴───────────────────┘
                   │   /sync  (version-vector anti-entropy, chunked, resumable)
                   │   + file export/import ("sneakernet")
            ┌──────▼───────────────────────────────┐
            │  packages/core  — ONE implementation │
            │  envelope · HLC · VV · fold · routes │
            └──────┬───────────────────────────────┘
                   │ pure function of (event set, as_of)
     ┌─────────────┼─────────────┬──────────────┬──────────────┐
     ▼             ▼             ▼              ▼              ▼
  FLOOD        NETWORK        PEOPLE        DECISION        AUDIT
  grid+stage   edges+state    registry      reachability    replay/hash
     │             │             │              │
     └──────┬──────┴─────────────┴──────────────┘
            ▼
   precomputed artifacts (committed):
   hand.bin, d8/recv.bin, graph.json, settlements.json, shelters.json
```

Every screen renders a projection. Every action appends an event. There is exactly one fold implementation, and it is shared byte-for-byte between browser and server.

## 2. ADRs

### ADR-1 — TypeScript end to end; Python only as an offline artifact builder

**Decision.** `packages/core` is zero-dependency TypeScript used by both the browser apps and the Node sync hub. Python appears only in `packages/geo`, a batch script that converts DEM → HAND/derived rasters and OSM → graph, emitting committed artifacts.

**Rationale.**
- The field app is offline in a browser. The fold must run client-side. Two implementations of the fold (TS client + Python server) would drift, and drift is the one failure that destroys the project's central claim.
- Routing and inundation are cheap at this scale when the expensive terrain work is precomputed: 1 M-cell threshold + connected-component label is tens of milliseconds in a typed array; 5 k-edge time-expanded DP is ~10 ms.
- One language means one schema module, one test suite, and no serialisation contract to maintain between two runtimes.

**Rejected.** FastAPI + React (two folds, two languages, schema duplicated); Python-everywhere (browser cannot run it).

**Cost accepted.** The "flood projection" is a *threshold-and-label* over a precomputed HAND grid rather than a from-scratch DEM pass at request time. The DEM pass is a build step, which is also how real systems do it.

---

### ADR-2 — The log is a file, not a database

**Decision.** Server persistence: append-only `log.jsonl` (one canonical-JSON event per line), `fsync` per append, plus a `checkpoint.json` holding the vector clock. Indices are rebuilt in memory at startup. Browser persistence: IndexedDB object store keyed by `[origin, seq]`, plus `seen:<id>` index.

**Rationale.** At demo scale (≤ 50 k events) an in-memory index is faster than SQL and has no native dependency. `better-sqlite3` needs prebuilds; `node:sqlite` is still flagged experimental; either is a build risk on three different OSes. A JSONL log is also *legible* — a judge can open it, and the "append-only" claim becomes visible rather than asserted.

**Rejected.** SQLite (native-build risk, hides the thesis), Postgres/Neon/Supabase (external service).

**Cost accepted.** No indexed queries; the whole log is parsed at boot. Compaction is deferred (see risk R-09).

---

### ADR-3 — Offline basemap is a bundled image, not online tiles

**Decision.** The map renders a single local raster (hillshade + landcover composite produced by the geo build) as a MapLibre `image` source, with roads, settlements, shelters, inundation polygons and route geometry as local GeoJSON layers.

**Rationale.** Hackathon wifi fails. Online tile CDNs also make the "fully offline field app" claim false. A single image source is one file, no tile server, no attribution ambiguity.

**Cost accepted.** Fixed zoom range (~z10–z14 effective), no panning beyond the district. Acceptable: the product is one district deep, not a global map.

---

### ADR-4 — Inundation is HAND-SRC, with a connected bathtub as an independent bracket

**Decision.** Build a HAND grid once. At runtime, given an observed water depth at a point, derive a water-surface elevation per drainage reach from a synthetic rating curve (Manning, wide channel), then `wet(c) ⇔ z(c) < S(D(c))`, `depth = max(0, S(D(c)) − z(c))`.

**Rationale.** The naive formulation `HAND ≤ stage` is algebraically `z(c) ≤ S` — the HAND term cancels and the method degenerates to an unconnected bathtub while still *claiming* to be HAND. This was caught in specialist review (see §4). Carrying a per-reach water surface is what makes the terrain work meaningful, and it is ~60 lines.

**Rejected.** Hydrodynamic solver (out of scope, unbuildable in 48 h); pure bathtub (no drainage structure, no defensible claim); global uniform stage (physically wrong on a 60 km island with 5 cm/km slope).

**Cost accepted.** We claim *terrain-based screening of potential inundation for a specified water level*. We do not claim forecast skill, velocity, duration, or validation against observed extent. This wording is fixed and appears in the UI.

---

### ADR-5 — Routing is a time-expanded DAG with node waiting

**Decision.** Discretise the horizon into 1-minute slots. Build `(node, slot)` states; edge arcs advance time by the traversal cost; wait arcs advance one slot at nodes. The expanded graph is a DAG (every arc strictly increases the slot index), so shortest path is a reverse DP in `O(V+E)` — no heap.

**Rationale.** Rising stage is genuinely FIFO, but road *re-emergence* and *blockage expiry* are downward jumps in cost, which break FIFO and break label-setting Dijkstra. Waiting at nodes restores monotonicity and is also the physically correct model (vehicles hold at junctions and high ground). The DAG formulation encodes waiting, blockages and submergence exactly, with no approximation across an infinity.

**Rejected.** Snapshot interpolation (interpolates across impassability — invents dry road); plain time-dependent Dijkstra (subtly wrong at expiry events).

**Cost accepted.** 1-minute slot quantisation introduces ≤ 60 s error per edge traversal; bounded and disclosed.

---

### ADR-6 — Merges that need judgement are events, not automatic reconciliation

**Decision.** Person matching produces `match.propose` events carrying integer evidence. A human issues `match.accept` / `match.reject`. The projection renders proposals deterministically in a `pending` state.

**Rationale.** A *reviewed* merge is deliberately not convergent until a human decides. If the fold auto-applied the best-scoring proposal, two replicas that received proposals in different orders could apply different merges — the exact bug class the architecture exists to avoid. Making the decision an event keeps the fold pure.

---

### ADR-7 — Road state is a set of valid-time observations, not last-writer-wins

**Decision.** Each road report is an observation with `observed_at`, `valid_from`, `valid_until`, `confidence`, `source`. The projection selects, per edge and per time slot, the observation covering that slot with the highest `(observed_at, confidence, hlc)` rank. Ties that are causally concurrent and disagree set `disputed: true` and the edge renders as contested, never as free.

**Rationale.** LWW-by-HLC conflates *when the report was written* with *when the road was in that state*, and a single skewed clock can overwrite a survey. Safety-critical attributes bias to the pessimistic reading.

---

### ADR-8 — Observations are local depths, not gauge stages

**Decision.** The primary water observation is *depth above a known local reference* — "water is 1.1 m over the Kamalabari bridge deck" — not a gauge reading. Water-surface elevation is derived as `z_ref(DEM) + depth`.

**Rationale.** This removes the vertical-datum problem entirely. Copernicus GLO-30 is orthometric (EGM2008); Assam's geoid undulation is of order −60 m; a gauge reading is height above a local zero whose datum we do not have. A 30 m datum error does not bias the map, it saturates it (30 m ≫ 10 m of island relief). Deriving elevation from the same DEM that drives the inundation removes the discrepancy by construction.

**Cost accepted.** We cannot ingest a real CWC gauge feed without a survey of gauge zero. Documented as a limitation, and it is *why* field observation is the input rather than a workaround.

---

### ADR-9 — No external services in the request path

**Decision.** No hosted database, no LLM, no map tile CDN, no weather API. Optional: one static file host for the demo build.

**Rationale.** Stated project constraint; also removes the largest demo-failure mode.

---

## 3. Package layout

```
The_Iynxs_C-hacks/
├─ docs/                      # this planning set
├─ packages/
│  ├─ core/                   # TS, zero deps — THE fold. Owned by: lead
│  │  ├─ src/event/           # envelope, hlc, canonical json, ulid, vv
│  │  ├─ src/project/         # flood, network, people, decision
│  │  ├─ src/route/           # time-expanded dag, latest-safe-departure
│  │  ├─ src/match/           # transliteration, phonetic key, scoring
│  │  └─ test/                # unit + convergence fuzz harness
│  ├─ server/                 # TS, Node — sync hub + REST. Owned by: lead
│  ├─ web/                    # React+Vite+MapLibre. Owned by: Darsh
│  └─ geo/                    # Python batch builder. Owned by: Karthik
├─ data/
│  ├─ artifacts/              # committed build outputs (hand.bin, graph.json, …)
│  └─ fixtures/               # deterministic demo scenarios + expected hashes
└─ tests/e2e/                 # cross-package scenario tests. Owned by: Karthik
```

Ownership is file-disjoint. Darsh never edits `core`; he consumes a published mock of the API contract in [07-api-contract.md](./07-api-contract.md).

## 4. Disagreements resolved during review

| # | Disagreement | Resolution |
|---|---|---|
| D1 | Event architect claimed HLC establishes causality; distributed reviewer: it does not | **Reviewer upheld.** Each event carries a causal frontier (`vv`). Concurrent disagreeing observations surface as `disputed`, never silently resolved. 15-line change, highest value in the review. |
| D2 | Architecture originally stated `HAND ≤ stage` | **Hydrology reviewer upheld and it is fatal as written:** the expression reduces to `z(c) ≤ S`, cancelling HAND. Replaced with per-reach water surface `S(D(c))` (ADR-4). |
| D3 | Architecture claimed "FIFO-consistent under rising stage" as the reason plain TD-Dijkstra works | **Partially upheld.** Rising stage *is* FIFO (verified). But blockage expiry and road re-emergence are downward jumps, which are not. Plain TD-Dijkstra is wrong; time-expanded DAG with node waiting is correct (ADR-5). |
| D4 | Architecture claimed content-addressed IDs give idempotency, while also specifying ULIDs | **Reviewer upheld the contradiction.** Split into `id` (ULID, identity) and `content_hash` (sha256, integrity). Dedupe is semantic, in the projection, not by ID. |
| D5 | Reviewer proposed SQLite with `UNIQUE(origin,seq)` and WAL | **Overruled on storage, upheld on invariant.** The uniqueness invariant is enforced by the in-memory index and asserted at load; storage is JSONL (ADR-2). |
| D6 | Reviewer suggested `match.*` merge automation | **Overruled.** Reviewed merges only (ADR-6). |
| D7 | Data reviewer initially favoured a live gauge series as the water driver | **Overruled.** Datum unavailability makes it unfalsifiable; local depth observations instead (ADR-8). |

## 5. What this architecture is deliberately not

- Not a hydrodynamic model, not a forecast, not validated against observed flood extent.
- Not a general all-hazards platform. The schema is hazard-agnostic; only the flood projection is implemented.
- Not a replacement for Sahana Eden / NDEM / Bhuvan. The claim is narrower and testable: *inundation determines passability, passability determines reachability, and all of it converges under multi-day disconnection.*
