# @setu/server

SETU backend server — HTTP adapter for the `/api/v1/*` endpoints.

Endpoints:
- `POST /api/v1/events:batch` — submit field events (returns per-item acks)
- `POST /api/v1/events/status` — get event status by clientEventId
- `GET /api/v1/projections` — get projection snapshot (optional sinceVersion)
- `GET /api/v1/events` — list event records (optional sinceVersion, limit, type)
- `GET /api/v1/stream` — SSE stream of projection version bumps

Persistence:
- Append-only JSONL event log (`data/log.jsonl`)
- In-memory index rebuilt at startup

The server translates the wire format (`FieldEvent`) to the internal envelope
(`Envelope`) at the API boundary — the fold never sees floats or ISO strings.
