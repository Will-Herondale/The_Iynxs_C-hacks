/* global process, console, setTimeout, URL, document, window */
// Headless acceptance run for Command v3 (own ports, no shared relay).
//   cd frontend && SETU_RELAY_PORT=5299 npx vite --port 5274 --strictPort -c apps/command/vite.config.ts apps/command   (separate terminal)
//   SETU_RELAY_PORT=5299 node apps/command/scripts/acceptance.mjs [baseUrl]
// Submits the Majuli S1 (bridge 284824410) and S4 (Auniati water level) demo events through the mock client
// over the relay, checks Overview/Map/Routes at 1366x768 and 1920x1080, asserts ZERO non-localhost requests,
// and saves screenshots into apps/command/docs/.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5274';
const RELAY = `http://127.0.0.1:${process.env.SETU_RELAY_PORT ?? 5299}`;
const OUT = new URL('../docs/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
globalThis.__SETU_MOCK_RELAY__ = RELAY;
const { createApiClientWithMock } = await import('@setu/mock-backend');

const api = createApiClientWithMock();
await new Promise((r) => setTimeout(r, 800));
const snap = await api.getProjections();
const auniati = snap.settlements.features.find((f) => f.properties.settlementId === '10692764768');
if (!auniati) throw new Error('Auniati (10692764768) not in the mock seed: Map & Data seed not merged yet?');
const [lng, lat] = auniati.geometry.coordinates;

async function submit(event) {
  const clientEventId = randomUUID();
  await api.submitEvents([{ clientEventId, occurredAt: new Date().toISOString(), reporterId: 'acceptance', deviceId: 'acceptance-device', ...event }]);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const [s] = await api.getEventStatus([clientEventId]);
    if (s?.state === 'applied') return s;
  }
  throw new Error('event not applied');
}

const external = [];
const browser = await chromium.launch();
const results = {};
for (const [w, h] of [[1366, 768], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1', ''].includes(u.hostname) && !['data:', 'blob:', 'about:'].includes(u.protocol)) external.push(r.url());
  });
  const tag = `${w}`;
  await page.goto(BASE);
  await page.getByTestId('overview').waitFor();
  results[`${tag} horizontal-scroll`] = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const before = await page.getByTestId('overview-count-disconnected').innerText();

  await submit({ type: 'road_blockage', roadId: '284824410', blockage: 'full', cause: 'submerged', location: { lat: 26.95, lng: 94.2 } });
  await page.getByTestId('overview-alert-road-284824410').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}overview-${tag}.png` });
  results[`${tag} overview after S1`] = { disconnectedBefore: before, impassable: await page.getByTestId('overview-count-impassable').innerText() };

  await page.getByTestId('nav-map').click();
  await page.getByTestId('map').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}map-${tag}.png` });

  await page.getByTestId('nav-routes').click();
  await page.getByTestId('section-routes').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}routes-s1-${tag}.png` });

  await submit({ type: 'water_level', gaugeId: 'near-auniati', levelCm: 8380, trend: 'rising', location: { lat, lng } });
  await page.getByTestId(`no-safe-route-10692764768`).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}routes-${tag}.png` });

  await page.getByTestId('nav-settlements').click();
  await page.getByTestId('section-settlements').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}settlements-${tag}.png` });

  await page.getByTestId('nav-events').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}events-${tag}.png` });

  await page.getByTestId('nav-audit').click();
  await page.getByTestId('section-audit').waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}audit-${tag}.png` });
  results[`${tag} scroll-x after`] = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
console.log('external requests:', external.length, external.slice(0, 5));
process.exit(external.length ? 1 : 0);
