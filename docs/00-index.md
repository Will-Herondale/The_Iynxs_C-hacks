# SETU — Planning Documentation

Branch: `planning/architecture`. No application code exists yet. This branch contains design and contracts only.

| Doc | Contents |
|---|---|
| [01-repository-audit.md](./01-repository-audit.md) | State of the GitHub repo, tooling inventory, what was verified vs assumed |
| [02-architecture.md](./02-architecture.md) | Layering, stack choice, ADRs with rationale and rejected alternatives |
| [03-event-model.md](./03-event-model.md) | Canonical envelope, event types, merge semantics, entity resolution |
| [04-sync-protocol.md](./04-sync-protocol.md) | Version vectors, resumable anti-entropy, sneakernet, convergence harness |
| [05-geo-and-inundation.md](./05-geo-and-inundation.md) | DEM → HAND artifact pipeline, corrected inundation model, datum handling |
| [06-routing.md](./06-routing.md) | Edge state, time-expanded DAG, latest safe departure, cut-off sweep |
| [07-api-contract.md](./07-api-contract.md) | HTTP surface and the frontend/backend boundary for mock-based parallel work |
| [08-task-board.md](./08-task-board.md) | Human task allocation with owners, dependencies, acceptance criteria |
| [09-execution-plan.md](./09-execution-plan.md) | Hour-by-hour 48 h schedule with gates and fallbacks |
| [10-risks.md](./10-risks.md) | Critical risk register, kill criteria, fallback strategies |
| [11-open-questions.md](./11-open-questions.md) | Decisions required from the technical lead |

## Status

Planning stage. Nothing here is approved. Implementation begins only after explicit sign-off on [02-architecture.md](./02-architecture.md) and [03-event-model.md](./03-event-model.md).
