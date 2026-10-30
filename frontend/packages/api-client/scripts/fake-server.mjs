#!/usr/bin/env node
/* global process, console */
// Starts the in-memory fake contract server (test utility). Needs `npm run build` first.
// Env: PORT (default 8080), FAKE_LATENCY_MS, FAKE_APPLY_DELAY_MS.
import { startFakeServer } from '../dist/testing/index.js';

const s = await startFakeServer({
  port: Number(process.env.PORT ?? 8080),
  latencyMs: Number(process.env.FAKE_LATENCY_MS ?? 0),
  applyDelayMs: Number(process.env.FAKE_APPLY_DELAY_MS ?? 0),
});
console.log(`fake contract server listening on ${s.url}`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => s.close().then(() => process.exit(0)));
