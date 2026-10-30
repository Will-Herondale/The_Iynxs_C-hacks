# SETU e2e (Playwright)

Runs both apps against the **in-memory fake contract server** (`@setu/api-client/testing`); no mock data, no real backend, no external network.

```sh
cd frontend && npm install && npm run build
cd e2e && npx playwright install chromium && npx playwright test
```

- Projects: `chromium` (dev servers :5173 field, :5174 command) and `pwa` (`@pwa` tests, `vite preview` build on :4173). All use `VITE_API_URL=http://localhost:8099`.
- The fake server is started in-process by the worker fixture and reset before every test. If `:8099` is already taken by another process, that server is used as-is (no reset): stop it for a clean run. Single worker (shared state).
- Fixtures (`fixtures/index.ts`): `test` (auto reset + fails on any non-localhost request), `openField`, `openCommand`, `goOffline`/`goOnline`, `submitReport`, `expectQueueStatus`, and route injectors `recordBatches`, `failBatch`, `abortBatch`, `ackBatch(conflict|rejected)`, `backendDown`. Tune the server with the `fakeServer` fixture (`fakeServer.options.applyDelayMs = ...`).
- Assert on `data-testid` and `data-status|state|origin`; see `docs/TEST_IDS.md`.
- `live-smoke.spec.ts` only runs when `LIVE_API_URL` is set (read-only GETs).
