# Device-to-device exchange (JSONL)

Lightweight, serverless transfer of field reports between devices. Format approved by the backend lead (issue #23).
Screen: `#/sync/exchange` (link `nav-exchange` inside Sync). Works fully offline.

## Format
- UTF-8 text, one **wire `FieldEvent`** (valid against `FieldEventSchema` in `@setu/contract`) per line. No internal envelopes, no extra fields.
- Blank lines and CRLF line endings are tolerated. Trailing newline on export.
- Export order is stable: ascending `createdAt`. File name: `setu-events-<device>-<timestamp>.jsonl`.
- Export includes local reports and previously imported ones; nothing is silently excluded.

## Validation (in the browser, before anything is written)
Each line is parsed as JSON, then validated with the contract zod schema. Result per line has the `SubmitAck` shape:
`{ clientEventId, result: 'accepted' | 'duplicate' | 'rejected', eventId?, errors? }` plus the 1-based line number in the UI.
- `rejected`: invalid JSON or schema failure; `errors` are `{path, message}` entries.
- `duplicate`: `clientEventId` already on this device, or repeated earlier in the same file (first occurrence wins).
- `accepted`: otherwise.
The user sees a preview table and confirms; only `accepted` lines are imported. Rejected/duplicate lines never block the rest.

## Dedupe
Identity is `clientEventId`. Import goes through the existing idempotent `enqueue`; ids are never rewritten. Re-importing the same file yields all `duplicate`.

## Limits
File > 5 MB or > 5000 lines is refused with a clear message (nothing imported).

## After import
Imported rows are stored with `origin: 'imported'` (distinct from Local / Remote), enter the normal sync queue and reach the server later through the idempotent `POST /events:batch`.
The UI states: "Imported events are saved on this device and will appear in district projections after sync." Merged events are shown as a **list**, never as a recalculated projection; the local view is never presented as district-wide.

## Blocked: phase 2
Recomputing projections (flood, routes, settlements) locally with `@setu/core` is blocked on the backend lead. The frontend does not import `packages/core` and computes no projections, routes or flood state.

## Tests
Unit: `features/exchange/*.test.ts(x)`. E2E: `e2e/tests/exchange.spec.ts` (two browser contexts).
