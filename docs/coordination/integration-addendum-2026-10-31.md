# SETU integration addendum — 2026-10-31

This addendum records the current agreement with Darsh's frontend handover.
It does not modify frontend source files.

## Source of truth

- Frontend: worktree `C:\Users\Ashwath M\The_Iynxs_C-hacks`, branch
  `frontend/main`, HEAD `7a14660`, plus the preserved uncommitted HTTP,
  harness, and polish changes.
- Backend: worktree `C:\Users\Ashwath M\setu-backend`, branch
  `coordination/integration-handoff`, HEAD `6168013`, plus the preserved
  uncommitted integration fixes.
- Neither worktree is clean. Do not reset, clean, or treat the HEAD commit as
  the complete running release without first committing/reviewing the dirty
  changes.

## Route-reason contract

`routes[].features[].properties.refusal` is authoritative:

```ts
type Explanation = {
  summary: string;
  blockingFeatureIds: string[];
  sourceEventIds?: string[];
};
```

The backend also emits `reason` as a plain-text compatibility mirror for older
clients. Frontend code must render/link `refusal`; it must not infer failure
from `etaMin`, route geometry, or a missing route alone.

Synthetic demo acceptance shape:

```json
{
  "summary": "No safe route: Demo Bridge Road (syn-bridge-1) is blocked.",
  "blockingFeatureIds": ["syn-bridge-1"]
}
```

The real-route edge-ID normalization keeps segmented graph IDs internal while
mapping raw road-event IDs to the correct segments. It prevents fabricated
blockers such as `osmId-segmentIndex` from appearing in explanations.

## Three invalid legacy event records

The preserved nine-event JSONL contains six `obs.water` records and three
legacy `person.register` records. The latter are not v1 `FieldEvent` records:

- `FieldEventSchema` permits only `flood_report`, `road_blockage`,
  `road_cleared`, `water_level`, and `household_registration`.
- The legacy records have `type: "person.register"` and lack required
  household fields such as `members` and `vulnerable`.
- D-08 explicitly keeps `person.register` and `household_registration` as
  separate tracks; rewriting them would fabricate audit meaning.

Backend-only fix: unsupported internal event types are omitted from the wire
`events` array instead of being emitted as malformed `EventRecord`s. The API
adds additive metadata:

```json
{ "omitted": { "total": 3, "byType": { "person.register": 3 } } }
```

Valid flood audit records remain visible and the original JSONL evidence is
untouched. Darsh's next frontend contract change should display intentional
omissions separately from records rejected by schema validation. No frontend
files were changed for this fix.

## Clean demo dataset

- Live evidence: `packages/server/data/log.jsonl`, 9 lines,
  SHA256 `261781282D9C27562C0C5C5F2DF3EA4C1D6EC443463778C23D13E9B626C046D1`.
- Clean synthetic demo: `packages/server/data/demo/log.jsonl`, one event,
  SHA256 `38DD8EAB747BC59138C25505390FBC960958319FDEE4BA50938EF0440D5F55E7`.
- Verification: `packages/server/data/demo/demo-verification.json`.
- Use `scripts/demo.ps1 -Action reset|seed|status|restore` with an isolated
  port. Previous demo logs are archived under `data/backups`; the live log is
  never overwritten.

## Validation

- Server typecheck passed.
- Server tests: **19/19 passed**.
- Core tests: **70/70 passed**.
- Frontend unit tests: **371/371 passed**.
- Isolated Chromium E2E: **65 passed, 2 skipped**; skipped tests are opt-in
  live-smoke checks.
- Actual isolated UI flow: Field submitted client ID
  `a62de0ec-f3cf-4669-983d-8d9f8a76efc8`; backend status became `applied` at
  projection version 1; Command showed live, cut-off `1`, blocked `1`, active
  routes `0`; restart preserved the same state.
