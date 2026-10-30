# SETU — Agent Coordination README

Welcome to the SETU coordination documents. This directory is the **single source of truth** for multi-agent communication between:
- **Backend orchestrator** (OpenCode): event infrastructure, fold, flood, routing, decision engine.
- **Frontend agent** (Darsh's Claude): field app, command centre, browser persistence, offline queue, UI.
- **Data/QA agent** (Karthik): geographic datasets, preprocessing, scenarios, validation, presentation.

## How to use these documents

1. **Backend orchestrator**: Read `agent-status.md` for current branch/ownership state. Read `open-questions.md` and `decisions.md` for pending and resolved decisions. Review `integration-contract.md` before publishing API changes. Publish updates to `messages/opencode.md`.

2. **Frontend agent**: Read `agent-status.md` for who owns what. Review `integration-contract.md` for wire format and API contract. Check `messages/claude-darsh.md` for inter-agent communication. Publish frontend progress to `messages/claude-darsh.md`.

3. **Data/QA agent**: Read `agent-status.md` for data ownership. Review data deliverables in `docs/05-geo-and-inundation.md`. Publish dataset progress to `messages/agent-karthik.md`.

4. **All agents**: Before making any change to shared files:
   - Read the relevant coordination documents.
   - Check the latest Git state (`git status`, `git log`).
   - Verify the other agents have seen your changes (fetch their branches).
   - Record the change in `messages/` or a GitHub issue.
   - Update `agent-status.md`.

## Communication protocol

- **GitHub**: primary channel for code, PRs, issues.
- **docs/coordination/**: persistent written state. Never overwrite another agent's documents without review.
- **messages/**: lightweight update notes between agents. One topic per file.
- **Open questions**: raised in `open-questions.md`, resolved in `decisions.md`.

## Current branches (as of last sync)

| Branch | Owner | Summary |
|---|---|---|
| `main` | human technical lead | Protected default. Empty except LICENSE + README. |
| `planning/architecture` | backend orchestrator | All planning docs (docs/00–11). No application code. |
| `frontend/main` | frontend agent | Frontend monorepo: contract, api-client, mock-backend, ui. |
| `coordination/team-handoff` | backend orchestrator | Multi-agent handoff docs + task board. |

## Directory ownership

| Directory | Owner | Other agents may touch? |
|---|---|---|
| `docs/coordination/` | shared | Yes — via PR/comment, never force-push |
| `docs/coordination/agent-status.md` | backend orchestrator | Read-only for others; propose changes via `open-questions.md` |
| `docs/coordination/ownership.md` | shared | Read/write by all |
| `docs/coordination/messages/` | each agent writes own file | Read by all; the named agent writes |
| `docs/00–11/` | backend orchestrator | Read-only for others |
| `frontend/` | frontend agent | Backend read-only |
| `packages/core`, `packages/server` | backend orchestrator | Frontend read-only |
| `data/`, `tests/e2e/` | Karthik / backend | Both read-only until Karthik lands artifacts |

## Files in this directory

| File | Purpose |
|---|---|
| `agent-status.md` | Agent map, branch state, ownership, work status |
| `ownership.md` | File-disjoint ownership table |
| `integration-contract.md` | Stable frontend↔backend wire contract |
| `open-questions.md` | Unresolved items (OQ-NN) |
| `decisions.md` | Resolved decisions (D-NN) |
| `messages/opencode.md` | OpenCode agent round-trip notes |
| `messages/claude-darsh.md` | Frontend agent sync notes |
| `messages/agent-karthik.md` | Data/QA agent sync notes |

## Updating agent-status.md

The backend orchestrator maintains `docs/coordination/agent-status.md`. Update whenever:
- A branch lands or is merged.
- A new package is added.
- A milestone is reached.
- Work state changes.

After updating, commit to `coordination/team-handoff` from `planning/architecture`.