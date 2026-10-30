# 09 — 48-Hour Execution Plan

Gates are hard stop-points: if a gate fails, the fallback below it activates immediately and work proceeds on the fallback path.

| Hour | Milestone | Owner | Gate |
|------|-----------|-------|------|
| 0 | Repo scaffold + monorepo skeletons | lead | G0: `npm run build` passes in core + web |
| 0–2 | Event envelope, HLC, canonical JSON | lead | G0.5: hash stable; floats rejected |
| 0–4 | Geo pipeline start (DEM mosaic → zero repair → breach → D8 → HAND) | Karthik | G1a at h6: artifacts exist + hash-committed |
| 0–4 | OSM → graph, settlements, shelters | Karthik | G1b at h6: graph < 10 k edges committed |
| 2–6 | Sync protocol + `/sync` server | lead | G1c at h6: convergence harness green; 3 negatives red |
| 6–8 | Flood projection (HAND → stage → inundation) | lead | G1d at h8: monotonicity + connectivity pass; < 200 ms/stage |
| 6–8 | Routing DAG + latest-safe-departure + cut-off sweep | lead | G1e at h8: exact_replay assert passes; sweep < 1 s |
| 6–10 | Mock API + frontend scaffold + basemap | Darsh | G1f at h10: map renders basemap + roads locally |
| 8–12 | Road-state + people + decision projections | lead | G2 at h12: all four projections run over committed artifacts |
| 10–16 | Field app + camp app + console UI | Darsh | G3 at h16: offline report → console renders inundation |
| 16–20 | End-to-end scenario A demo | all | G4 at h20: demo beats 1–7 run (see below) |
| 20–24 | Convergence fuzz + negative controls + CI wire-up | lead | G5 at h24: one green + three red runs on commit |
| 24–32 | Polish, disputed badge, quarantine, revision banner | Darsh | — |
| 32–40 | Presentation deck + demo script + dry runs | Karthik + all | G6 at h40: full rehearsal passes |
| 40–48 | Buffer, fixes, final rehearsal | all | — |

## Demo beats (the on-stage narrative)

1. Offline reporting: field app creates report while wifi off.
2. Inundation from one observation: volunteer reports 1.1 m over bridge → inundation spreads.
3. Roads turn impassable; settlements grey = cut off.
4. Ambulance route A→B refuses submerged road, states deadline ("leave in the next 26 min").
5. Stage raised 0.8 m: new cut-off village, named segment, deadline, evacuation list.
6. Two camps register same family in two scripts → match proposed with evidence → accepted.
7. Reconnect → sync → all replicas converge; divergence fuzz runs on stage (5 replicas, random partitions).

## Gate fallbacks

| Gate | If it fails | Fallback (pre-authorised, no re-approval needed) |
|------|-------------|--------------------------------------------------|
| G1 (geo artifacts missing at h6) | Karthik cannot finish DEM pipeline | Use `data/fixtures/synthetic.json` — a 40×40 grid island with hand-computed HAND, graph, settlements. All downstream code reads the same JSON schema. Demo still runs; terrain provenance is reduced but claims unchanged. |
| G1c (sync/convergence broken at h6) | `/sync` cannot pass fuzz | Ship single-browser mode: log persists in IndexedDB, `/sync` returns the same replica's events. Offline behaviour intact; multi-replica convergence shown via pre-recorded harness video instead of live. |
| G4 (demo beat 5 or 6 fails at h20) | routing or matching misbehaves on stage | Drop beat 6 (matching) and beat 5 (stage raise) if needed; keep beats 1–4 (offline report → inundation → blocked roads → refused route). A 4-beat demo is still coherent. |
| G5 (fuzz flaky at h24) | convergence test non-deterministic | Reduce replicas to 3, events to 150, rounds to 20; keep negative controls. Determinism is the claim; a smaller green test beats a large flaky one. |
| G6 (rehearsal fails at h40) | demo unstable | Ship the last-known-good commit tagged `demo-stable`; do not merge fixes after h40 without lead sign-off. |

## Hour-gate rule

No UI feature may be started before its projection exists and passes its unit test. No projection may be merged before its invariants (monotonicity, connectivity, exact_replay) are in CI. This is the discipline that keeps a 48 h build from collapsing into an unverifiable mess at hour 46.
