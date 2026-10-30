// Headless smoke run at 360x740 against `vite preview` on our own port.
//   npm run build -w @setu/field && node apps/field/scripts/smoke.mjs   (from frontend/)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.SMOKE_PORT ?? 5473);
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
const page = await ctx.newPage();
const step = (n, m) => console.log(`✔ ${n}. ${m}`);
const shot = (n) => page.screenshot({ path: path.join(docs, `${n}.png`), fullPage: false });

try {
  // first online load: caches shell + geo assets, fills the projection cache
  await page.goto(`${base}/#/home`);
  await page.waitForSelector('[data-testid=home-screen]');
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await page.reload();
  await page.waitForSelector('[data-testid=home-screen]');
  await shot('home');

  // 1. offline: New Report → Submerged bridge → bridge → submit → Saved locally
  await ctx.setOffline(true);
  await page.click('[data-testid=home-new-report]');
  await page.click('[data-testid=report-type-submerged_bridge]');
  await page.selectOption('[data-testid=field-roadId]', BRIDGE);
  await page.fill('[data-testid=field-lat]', '26.9512');
  await page.fill('[data-testid=field-lng]', '94.1701');
  await shot('report');
  await page.click('[data-testid=report-submit]');
  await page.waitForSelector('[data-testid=report-saved-label]');
  const label = await page.textContent('[data-testid=report-saved-label]');
  if (!/Saved locally/.test(label ?? '')) throw new Error(`expected "Saved locally", got ${label}`);
  const id = await page.getAttribute('[data-testid=report-saved]', 'data-client-event-id');
  step(1, `offline submit → "${label?.trim()}" (${id})`);

  // 2. reload (still offline) → still there
  await page.goto(`${base}/#/sync`);
  await page.reload();
  await page.waitForSelector(`a[href="#/report/${id}"]`);
  step(2, 'reload offline → report still in the queue');

  // Map renders offline, with the pending report
  await page.click('[data-testid=nav-map]');
  await page.waitForSelector('[data-testid=map-canvas]');
  await page.waitForTimeout(1500);
  await shot('map-offline');

  // 3. online → Accepted
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.click('[data-testid=nav-sync]');
  await page.waitForFunction(
    (cid) => document.querySelector(`[data-testid=queue-item][data-client-event-id="${cid}"]`)?.getAttribute('data-status') === 'synced',
    id,
    { timeout: 30_000 },
  );
  const badge = await page.getAttribute(`[data-testid=queue-item][data-client-event-id="${id}"]`, 'data-spec-label');
  if (!/Accepted/.test(badge ?? '')) throw new Error(`expected Accepted, got ${badge}`);
  await shot('sync');
  step(3, `online → "${badge?.trim()}"`);

  // 4. Map tab shows the report as accepted
  await page.click('[data-testid=nav-map]');
  await page.waitForSelector('[data-testid=map-reports] li[data-state=accepted]');
  await page.waitForTimeout(1200);
  await shot('map');
  step(4, 'map lists the report as Accepted');

  // 5. register household offline → search → syncs
  await ctx.setOffline(true);
  await page.click('[data-testid=nav-home]');
  await page.click('[data-testid=home-register-household]');
  await page.fill('[data-testid=household-headName]', 'Smoke Tester');
  await page.fill('[data-testid=household-members]', '4');
  await page.fill('[data-testid=field-lat]', '26.95');
  await page.fill('[data-testid=field-lng]', '94.17');
  await page.click('[data-testid=household-submit]');
  await page.waitForSelector('[data-testid=households-saved]');
  await page.fill('[data-testid=households-search]', 'smoke');
  await page.waitForSelector('[data-testid=household-row]');
  await shot('households');
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => document.querySelector('[data-testid=household-row]')?.getAttribute('data-status') === 'synced', null, { timeout: 30_000 });
  step(5, 'household registered offline → found by search → synced');
  console.log('SMOKE PASS');
} catch (e) {
  await page.screenshot({ path: path.join(docs, 'smoke-failure.png') }).catch(() => {});
  console.error('SMOKE FAIL:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  stop();
}
