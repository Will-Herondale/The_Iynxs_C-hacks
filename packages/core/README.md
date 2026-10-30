# @setu/core

SETU core package — zero-dependency TypeScript shared by the browser field/camp apps and the Node sync hub.

## Contents

- `src/event/` — ULID, HLC, canonical JSON, content hash, envelope validation
- `src/sync/` — version vector, sync protocol (pull + push)
- `src/project/` — flood, network, people, decision projections (fold)
- `src/route/` — time-expanded DAG, latest-safe-departure, cut-off sweep

## Determinism rules (enforced by lint + tests)

- No `Date.now()`, `Math.random`, `Intl`, `Date`, or `toLocaleString` inside `project/` or `route/`.
- No floats in payloads: integer decimetres, epoch ms, microdegrees only.
- All folds sort inputs before processing; output is canonical JSON (sorted keys, no whitespace).
- `asOf` is always passed explicitly; never read from wall clock.
