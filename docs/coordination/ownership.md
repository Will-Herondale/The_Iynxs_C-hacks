# SETU — Agent Ownership

File-disjoint ownership table for the SETU repository. This document answers "who owns what" and is the reference for the communication protocol: never silently modify a file owned by another agent.

## 1. Top-level directory ownership

| Directory / Path | Owner | Other agents may touch? | Conditions |
|---|---|---|---|
| `docs/` | shared | Yes — via PR/comment, never force-push | All coordination docs live here |
| `docs/coordination/` | shared | Yes — via PR/comment, never force-push | This is the communication channel |
| `docs/coordination/agent-status.md` | backend orchestrator | Read-only for others | Propose changes via `open-questions.md` |
| `docs/coordination/ownership.md` | shared | Read/write by all | Updated by whoever notices it needs updating |
| `docs/coordination/messages/*.md` | named agent only | Read by all | Each agent writes their own file |
| `docs/00–11/` | backend orchestrator | Read-only for others | Planning docs — no application code |
| `frontend/` | frontend agent | Backend read-only | Do not modify without reviewing with frontend agent |
| `packages/core`, `packages/server` | backend orchestrator | Frontend read-only | Backend infrastructure |
| `data/`, `tests/e2e/` | Karthik / backend | Both read-only until Karthik lands artifacts | Data artifacts and e2e tests |
| `packages/geo` | backend orchestrator | Frontend read-only | Geographic artifact pipeline |

## 2. File-disjoint scope (what each agent must NOT edit)

| Agent | Must NOT edit these file types / paths |
|---|---|
| **Frontend agent** | `packages/core/`, `packages/server/`, `packages/geo/` <br> `docs/00–11/` <br> Any file in `frontend/` owned by backend |
| **Backend orchestrator** | `frontend/` (packages, apps, src) <br> `docs/coordination/messages/claude-darsh.md` <br> `docs/coordination/messages/agent-karthik.md` |
| **Karthik's AI** | `docs/coordination/messages/claude-darsh.md` <br> `docs/coordination/messages/opencode.md` <br> Any `data/` path not explicitly assigned |

## 3. How to check ownership before editing

1. Open the file in the repository.
2. Check the first comment or heading for an ownership marker.
3. If in doubt, check `docs/coordination/agent-status.md` for the current owner.
4. If still unclear, raise a question in `docs/coordination/open-questions.md` before editing.
5. After editing, record the change in `docs/coordination/messages/` and commit to a dedicated branch.

## 5. Version control discipline

- Never force-push to `main` or `planning/architecture`.
- Create a dedicated branch for any multi-agent change (e.g., `coordination/team-handoff`).
- Use PRs to review changes across agents.
- Always `git fetch` before integrating another agent's branch.
- Commit messages should reference the relevant `OQ-NN` or `D-NN` number.