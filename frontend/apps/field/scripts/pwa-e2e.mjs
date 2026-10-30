/* global document, window, Event, navigator, console, process, fetch, setTimeout, indexedDB, URL */
// Offline PWA acceptance (headless, production preview on our own port).
//   npm run build -w @setu/field && node apps/field/scripts/pwa-e2e.mjs   (from frontend/)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.PWA_PORT ?? 5483);
const BRIDGE = process.env.SMOKE_BRIDGE ?? '284824410';
const dir = path.dirname(fileURLToPath(import.meta.url));
const docs = path.join(dir, '..', 'docs');
const base = `http://localhost:${PORT}`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(dir, '..'), stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, serviceWorkers: 'allow' });
const external = [];
ctx.on('request', (r) => {
  const u = new URL(r.url());
  if (/^https?:$/.test(u.protocol) && !['localhost', '127.0.0.1'].includes(u.hostname)) external.push(r.url());
});
const page = await ctx.newPage();
const step = (n, m) => console.log(`✔ ${n}. ${m}`);
const shot = (n) => page.screenshot({ path: path.join(docs, `pwa-${n}.png`) });
const assert = (c, m) => { if (!c) throw new Error(m); };

try {
  // 1. manifest valid + SW active (first online visit)
  await page.goto(`${base}/#/home`);
  await page.waitForSelector('[data-testid=home-screen]');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.getRegistration().then((r) => r?.active?.state === 'activated'));
  const swState = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state);
  assert(swState === 'activated', `service worker not active: ${swState}`);
  const href = await page.getAttribute('link[rel=manifest]', 'href');
  const manifest = await (await fetch(new URL(href, base))).json();
  for (const k of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'description', 'lang', 'icons', 'shortcuts']) assert(manifest[k], `manifest missing ${k}`);
  assert(manifest.display === 'standalone', 'display not standalone');
  const sizes = manifest.icons.map((i) => `${i.sizes}/${i.purpose ?? 'any'}`).join(' ');
  assert(/192x192/.test(sizes) && /512x512/.test(sizes) && /maskable/.test(sizes), `icons incomplete: ${sizes}`);
  for (const i of manifest.icons) assert((await fetch(new URL(i.src, base))).ok, `icon missing ${i.src}`);
  assert(manifest.shortcuts.some((s) => /#\/report/.test(s.url)), 'no New report shortcut');
  step(1, `manifest valid (${manifest.icons.length} icons), SW ${swState}`);
  await page.reload();
  await page.waitForSelector('[data-testid=home-screen]');
  await page.waitForTimeout(1500); // let the first projection fetch fill the cache
  await shot('home-online');

  // 2. shell loads offline after a first visit
  await ctx.setOffline(true);
  await page.goto(`${base}/#/home`);
  await page.reload();
  await page.waitForSelector('[data-testid=home-screen]');
  await page.waitForSelector('[data-testid=connectivity-status][data-state=offline]');
  await shot('shell-offline');
  step(2, 'shell loads offline, status = offline');

  // 3. offline submit → Saved locally
  await page.click('[data-testid=home-new-report]');
  await page.click('[data-testid=report-type-submerged_bridge]');
  await page.selectOption('[data-testid=field-roadId]', BRIDGE);
  await page.fill('[data-testid=field-lat]', '26.9512');
  await page.fill('[data-testid=field-lng]', '94.1701');
  await page.click('[data-testid=report-submit]');
  await page.waitForSelector('[data-testid=report-saved-label]');
  const label = await page.textContent('[data-testid=report-saved-label]');
  assert(/Saved locally/.test(label ?? ''), `expected "Saved locally", got ${label}`);
  const id = await page.getAttribute('[data-testid=report-saved]', 'data-client-event-id');
  await shot('saved-locally');
  step(3, `offline submit → "${label?.trim()}" (${id})`);

  // 4. reload (still offline) → still pending
  await page.goto(`${base}/#/sync`);
  await page.reload();
  await page.waitForSelector(`[data-testid=queue-item][data-client-event-id="${id}"]`);
  const st = await page.getAttribute(`[data-testid=queue-item][data-client-event-id="${id}"]`, 'data-status');
  assert(st !== 'synced', `unexpected status ${st}`);
  await shot('pending-after-reload');
  step(4, `reload offline → still pending (${st})`);

  // 5. stale warning: age cachedAt past 60 min
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('setu-field-cache');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('projections', 'readwrite');
      const store = tx.objectStore('projections');
      const get = store.get('latest');
      get.onsuccess = () => {
        if (!get.result) { reject(new Error('no cached snapshot')); return; }
        store.put({ ...get.result, cachedAt: Date.now() - 90 * 60_000 });
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.goto(`${base}/#/home`);
  await page.reload();
  await page.waitForSelector('[data-testid=stale-warning][data-level=red]');
  await shot('stale-warning');
  step(5, 'aged cachedAt → red stale warning');

  // 6. reconnect → Accepted automatically
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.click('[data-testid=nav-sync]');
  await page.waitForFunction(
    (cid) => document.querySelector(`[data-testid=queue-item][data-client-event-id="${cid}"]`)?.getAttribute('data-status') === 'synced',
    id,
    { timeout: 30_000 },
  );
  const badge = await page.getAttribute(`[data-testid=queue-item][data-client-event-id="${id}"]`, 'data-spec-label');
  assert(/Accepted/.test(badge ?? ''), `expected Accepted, got ${badge}`);
  await shot('accepted');
  step(6, `reconnect → "${badge?.trim()}"`);

  assert(external.length === 0, `non-localhost requests: ${external.join(', ')}`);
  step(7, 'zero non-localhost requests');
  console.log('PWA E2E PASS');
} catch (e) {
  await page.screenshot({ path: path.join(docs, 'pwa-failure.png') }).catch(() => {});
  console.error('PWA E2E FAIL:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  stop();
}
