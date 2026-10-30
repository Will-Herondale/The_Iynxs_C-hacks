import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Ported from apps/field/scripts/pwa-e2e.mjs. Runs in the `pwa` project (vite preview build).
const BRIDGE = process.env.SMOKE_BRIDGE ?? '284824410';

test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, serviceWorkers: 'allow' });

function guardExternal(ctx: BrowserContext): string[] {
  const external: string[] = [];
  ctx.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && !['localhost', '127.0.0.1'].includes(u.hostname)) external.push(r.url());
  });
  return external;
}

async function swActive(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
}

test.describe('@pwa field offline', () => {
  test('manifest, icons and service worker', async ({ page, context }) => {
    const external = guardExternal(context);
    await page.goto('/#/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await swActive(page);
    const href = await page.getAttribute('link[rel=manifest]', 'href');
    const res = await page.request.get(new URL(href!, page.url()).toString());
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    for (const k of ['id', 'name', 'short_name', 'start_url', 'scope', 'display', 'description', 'lang', 'icons', 'shortcuts']) {
      expect(manifest[k], `manifest.${k}`).toBeTruthy();
    }
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}/${i.purpose ?? 'any'}`).join(' ');
    expect(sizes).toMatch(/192x192/);
    expect(sizes).toMatch(/512x512/);
    expect(sizes).toMatch(/maskable/);
    for (const i of manifest.icons) {
      const r = await page.request.get(new URL(i.src, page.url()).toString());
      expect(r.ok(), `icon ${i.src}`).toBe(true);
      expect(r.headers()['content-type']).toMatch(/image\//);
    }
    expect(manifest.shortcuts.some((s: { url: string }) => /#\/report/.test(s.url))).toBe(true);
    expect(external).toEqual([]);
  });

  test('install button is hidden without a beforeinstallprompt', async ({ page }) => {
    await page.goto('/#/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expect(page.getByTestId('install-app')).toHaveCount(0);
  });

  test('install button appears on beforeinstallprompt', async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
        ev.prompt = async () => {};
        ev.userChoice = Promise.resolve({ outcome: 'dismissed' });
        setTimeout(() => window.dispatchEvent(ev), 300);
      });
    });
    await page.goto('/#/home');
    await expect(page.getByTestId('install-app')).toBeVisible();
  });

  test('/api and /stream are never cached by the service worker', async ({ page }) => {
    await page.goto('/#/home');
    await swActive(page);
    await page.reload();
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await page.waitForTimeout(1500); // let the projection fetch and SSE connect
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(r.url);
      return urls;
    });
    expect(cached.length).toBeGreaterThan(0); // app shell is precached
    expect(cached.filter((u) => /\/api\/|\/stream/.test(u))).toEqual([]);
  });

  test('offline lifecycle: shell, submit, reload, stale warning, reconnect → Accepted', async ({ page, context }) => {
    test.setTimeout(120_000);
    const external = guardExternal(context);
    await page.goto('/#/home');
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await swActive(page);
    await page.reload();
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await page.waitForTimeout(1500); // first projection fetch fills the cache

    // shell loads offline
    await context.setOffline(true);
    await page.goto('/#/home');
    await page.reload();
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expect(page.getByTestId('connectivity-status').first()).toHaveAttribute('data-state', 'offline');

    // offline submit → Saved locally
    await page.getByTestId('home-new-report').click();
    await page.getByTestId('report-type-submerged_bridge').click();
    await page.getByTestId('field-roadId').selectOption(BRIDGE);
    await page.getByTestId('field-lat').fill('26.9512');
    await page.getByTestId('field-lng').fill('94.1701');
    await page.getByTestId('report-submit').click();
    await expect(page.getByTestId('report-saved-label')).toContainText('Saved locally');
    const id = (await page.getByTestId('report-saved').getAttribute('data-client-event-id'))!;
    expect(id).toBeTruthy();

    // reload offline → still pending
    await page.goto('/#/sync');
    await page.reload();
    const item = page.locator(`[data-testid=queue-item][data-client-event-id="${id}"]`);
    await expect(item).toBeVisible();
    expect(await item.getAttribute('data-status')).not.toBe('synced');

    // stale warning: age cachedAt past 60 min (seed an empty snapshot if none cached)
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('setu-field-cache');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('projections', 'readwrite');
        const store = tx.objectStore('projections');
        const get = store.get('latest');
        get.onsuccess = () => {
          const now = new Date().toISOString();
          const fc = { type: 'FeatureCollection', version: 0, generatedAt: now, features: [] };
          const row = get.result ?? { key: 'latest', snapshot: { version: 0, generatedAt: now, flood: fc, roads: fc, settlements: fc, routes: fc, shelters: fc } };
          store.put({ ...row, cachedAt: Date.now() - 90 * 60_000 });
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }));
    await page.goto('/#/home');
    await page.reload();
    await expect(page.getByTestId('stale-warning').first()).toHaveAttribute('data-level', 'red');

    // reconnect → Accepted automatically
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByTestId('nav-sync').click();
    const synced = page.locator(`[data-testid=queue-item][data-client-event-id="${id}"]`);
    await expect(synced).toHaveAttribute('data-status', 'synced', { timeout: 30_000 });
    await expect(synced).toHaveAttribute('data-spec-label', /Accepted/);
    expect(external).toEqual([]);
  });
});
