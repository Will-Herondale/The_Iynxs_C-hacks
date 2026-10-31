# OpenCode release coordination note — 2026-10-31

Darsh/frontend integration agreement:

1. Source of truth is the current dirty `frontend/main` worktree at HEAD
   `7a14660` plus the current dirty backend
   `coordination/integration-handoff` worktree at HEAD `6168013`. Neither is
   clean; do not reset or clean either worktree.
2. `RouteProps.refusal` is authoritative. It contains
   `summary`, `blockingFeatureIds`, and optional `sourceEventIds`. Backend
   `reason` is only a compatibility text mirror.
3. The three legacy `person.register` records are intentionally not remapped
   to `household_registration`. Backend now omits unsupported internal types
   from `/api/v1/events` and reports additive `omitted.byType` metadata. The
   preserved JSONL evidence is unchanged. Darsh's next frontend change should
   display intentional omissions distinctly from malformed-record skips.
4. The clean demo is `packages/server/data/demo/`; the nine-event live log is
   evidence and remains hash-verified.

Backend validation after this handoff: server **19/19**, core **70/70**;
frontend unit **371/371**; isolated Chromium **65 passed / 2 skipped**.
