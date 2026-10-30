/* global navigator, console, process, fetch, setTimeout, URL */
// Production-build SW check: node apps/field/scripts/pwa-sw-check.mjs  (after `npm run build -w @setu/field`)
// Proves: manifest valid, SW active, shell loads offline, zero non-localhost requests.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.PWA_PORT ?? 5481);
const base = `http://localhost:${PORT}`;
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: dir, stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(base)).ok) break; } catch { /* not up */ }
  await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, serviceWorkers: 'allow' });
const page = await ctx.newPage();
const external = [];
page.on('request', (r) => { if (!/^(http:\/\/localhost|data:|blob:)/.test(r.url())) external.push(r.url()); });
const fail = (m) => { console.error('✘', m); process.exitCode = 1; };
try {
  await page.goto(base);
  const href = await page.getAttribute('link[rel=manifest]', 'href');
  const man = await (await fetch(new URL(href, base))).json();
  for (const k of ['id', 'name', 'scope', 'description', 'lang', 'start_url']) if (!man[k]) fail(`manifest.${k} missing`);
  if (man.display !== 'standalone') fail('display');
  if (!man.shortcuts?.some((s) => s.url === '/#/report')) fail('shortcut');
  for (const i of man.icons) if (!(await fetch(new URL(i.src, base))).ok) fail(`icon ${i.src}`);
  console.log('✔ manifest valid');
  const state = await page.evaluate(async () => {
    const sw = (await navigator.serviceWorker.ready).active;
    for (let i = 0; i < 50 && sw?.state !== 'activated'; i++) await new Promise((r) => setTimeout(r, 100));
    return sw?.state;
  });
  if (state !== 'activated') fail(`sw state ${state}`); else console.log('✔ service worker active');
  await page.reload(); // let the SW control the page
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#root *', { timeout: 10000 });
  console.log('✔ shell loads offline');
  await ctx.setOffline(false);
  if (external.length) fail(`external requests: ${external.join(', ')}`); else console.log('✔ zero non-localhost requests');
} finally {
  await browser.close();
  server.kill();
}
