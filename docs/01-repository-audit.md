# 01 — Repository Audit and Tooling Inventory

## 1. Repository state

Inspected via GitHub API and a local clone (`C:\Users\Ashwath M\The_Iynxs_C-hacks`).

| Property | Value |
|---|---|
| Repo | `Will-Herondale/The_Iynxs_C-hacks` |
| Visibility | Public (readable without auth) |
| Default branch | `main` |
| Branches | `main` only |
| Commits | 1 — `f2ff75a` "Initial commit", 2026-10-30T04:50:21Z |
| Files | `LICENSE` (1071 B), `README.md` (19 B, content: `# The_Iynxs_C-hacks`) |
| Issues / PRs | None |
| CI / config | None |
| Existing implementation | **None.** Nothing to preserve, nothing to conflict with. |

**Conclusion:** greenfield. Monorepo is the correct choice; there is no legacy structure to accommodate.

## 2. Local toolchain (verified on this machine)

| Tool | Version | Note |
|---|---|---|
| git | 2.56.0 | |
| gh | 2.86.0 | authenticated as `Will-Herondale` |
| node | v24.10.0 | supports `node:sqlite`, `fetch`, ESM |
| npm | 11.6.1 | |
| Python | 3.14.0 | `py` launcher |
| fastapi / uvicorn / pydantic | installed | not required by the chosen stack |
| numpy 2.2.6, scipy 1.16.2, numba 0.66.0, networkx 2.8.8, shapely 2.1.2 | installed | usable for the offline geo build |
| rasterio | wheel `cp314` available and installable | verified via `pip install --dry-run` |

Not installed: geopandas, osmnx, pyflwdir, WhiteboxTools. These are Karthik's hour-0 task, and **only he needs them** — the runtime consumes committed artifacts.

## 3. External access verified during this audit

| Claim | Verified how | Result |
|---|---|---|
| Copernicus GLO-30 DEM downloadable without authentication | `HEAD` against `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N{26,27}_00_E09{3,4}_00_DEM/...tif` | **200 OK**, ~43–45 MB per 1°×1° tile, `image/tiff` |
| npm registry reachable, current versions resolvable | `npm view maplibre-gl version` → 6.16.0; `vite` → 8.3.5 | OK |
| npm latest React | not pinned yet; pin at scaffold time | — |
| OSM Overpass reachable | POST to `overpass-api.de` | **timed out twice from this network.** Graph extraction must use a cached download or an alternative endpoint, not a live Overpass call at build time. |

The Overpass timeout is a real constraint, not a nuisance: the road graph must be produced **once**, committed as an artifact, and never fetched live. That is also what makes the demo reproducible.

## 4. AI / MCP capabilities available and used

| Capability | Used for |
|---|---|
| `github-remote` MCP (46 tools, authenticated) | repo audit; available later for branch/PR coordination |
| Subagents: `researcher`, `general`, `reviewer`, `skeptic`, `strategist`, `qa-lead`, `security-auditor` | four parallel specialist reviews (data, hydrology, routing, distributed systems); cross-review |
| `exa-search` / `parallel` / `webfetch` | library-version and dataset verification |
| `context7` | not used this stage (no library API questions outstanding) |
| `figma`, `vercel`, `neon`, `supabase`, `cloudflare-*`, `linear`, `notion` | **not used.** These provision or depend on external services and/or incur cost. Out of scope without approval. |
| Skills (`architecture-rfc`, `db-change-safety`, `test-author`, `security-audit-lite`, …) | available; `test-author` and `architecture-rfc` are relevant at implementation time |

No cloud infrastructure was provisioned. No dependencies were installed beyond a `--dry-run` check.

## 5. Constraint discovered during audit

The field application must run **offline in a browser tab**. That means the event log, merge engine and projections must exist in JavaScript/TypeScript on the client. If the server implemented the same logic in Python, we would maintain two implementations of a *determinism-critical* fold — the single most likely source of an on-stage divergence. This drove the stack decision in [02-architecture.md](./02-architecture.md), ADR-1.
