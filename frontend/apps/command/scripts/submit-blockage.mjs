/* global process, console, setTimeout */
// Drives the shared dev relay like the field app would: submit road_blockage R7 full and wait for 'applied'.
// Usage (dev server running): node apps/command/scripts/submit-blockage.mjs [roadId] [full|partial]
import { randomUUID } from 'node:crypto';
globalThis.__SETU_MOCK_RELAY__ = process.env.SETU_RELAY ?? 'http://127.0.0.1:5199';
const { createApiClientWithMock } = await import('@setu/mock-backend');

const [roadId = 'R7', blockage = 'full'] = process.argv.slice(2);
const api = createApiClientWithMock();
await new Promise((r) => setTimeout(r, 500)); // let the relay connect and sync state
const clientEventId = randomUUID();
const [ack] = await api.submitEvents([
  {
    type: 'road_blockage',
    clientEventId,
    occurredAt: new Date().toISOString(),
    reporterId: 'script',
    deviceId: 'script-device',
    location: { lat: 26.14, lng: 91.73 },
    roadId,
    blockage,
  },
]);
console.log('ack', ack);
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const [s] = await api.getEventStatus([clientEventId]);
  console.log('status', s?.state, s?.projectionVersion);
  if (s?.state === 'applied') break;
}
setTimeout(() => process.exit(0), 1000); // allow relay publish to flush
