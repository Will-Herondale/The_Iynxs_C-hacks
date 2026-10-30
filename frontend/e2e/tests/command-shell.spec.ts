import { readFileSync } from 'node:fs';
import { test, expect, openCommand, backendDown, API_URL, COMMAND_VIEWPORTS, PROJECTIONS_GLOB } from '../fixtures';
import type { Page } from '@playwright/test';

const SECTIONS = ['overview', 'map', 'settlements', 'routes', 'events', 'audit'] as const;
const LAYERS = ['terrain', 'rivers', 'roads', 'settlements', 'shelters', 'flood', 'blocked', 'cutoff', 'observations', 'routes'];

const fixtureSnapshot = () =>
  JSON.parse(readFileSync(new URL('../../apps/command/src/testing/fixture-snapshot.json', import.meta.url), 'utf8')) as {
    version: number;
    routes: { features: Array<{ properties: { from: string; status: string; routeId: string } }> };
  };

/** Serve `body` as the projection snapshot (injection only; the fake server is untouched). */
async function serveSnapshot(page: Page, body: unknown) {
  await page.route(PROJECTIONS_GLOB, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) : route.fallback(),
  );
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const vp of COMMAND_VIEWPORTS) {
  test.describe(`command shell @ ${vp.width}x${vp.height}`, () => {
    test('six sections navigate; aria-current follows; no horizontal scroll', async ({ page }) => {
      await openCommand(page, vp);
      for (const s of SECTIONS) {
        await page.getByTestId(`nav-${s}`).click();
        await expect(page.getByTestId(`nav-${s}`)).toHaveAttribute('aria-current', 'page');
        for (const other of SECTIONS.filter((o) => o !== s)) await expect(page.getByTestId(`nav-${other}`)).not.toHaveAttribute('aria-current', 'page');
        expect(await noHScroll(page), `h-scroll on ${s}`).toBe(true);
      }
      await expect(page.getByTestId('audit-view')).toBeVisible();
    });

    test('Overview with an empty snapshot invents no counts and shows the empty state', async ({ page }) => {
      await openCommand(page, vp);
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', /live|polling/);
      await expect(page.getByTestId('overview')).toBeVisible();
      await expect(page.getByTestId('overview-no-alerts')).toBeVisible();
      await expect(page.getByTestId('situation-summary')).toHaveAttribute('data-all-clear', 'true');
      for (const id of ['stat-cut-off', 'stat-blocked-roads', 'stat-active-routes']) await expect(page.getByTestId(id)).toHaveText(/^\s*0\s*$/);
      for (const t of ['affected', 'disconnected', 'impassable', 'pending', 'evac']) await expect(page.getByTestId(`overview-count-${t}`)).not.toContainText(/[1-9]/);
      await expect(page.getByTestId('overview-event')).toHaveCount(0);
      await expect(page.locator('[data-testid^="overview-alert-"]')).toHaveCount(0);
    });

    test('backend down: unavailable banner and connection-status', async ({ page }) => {
      await backendDown(page);
      await openCommand(page, vp);
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'unavailable', { timeout: 20_000 });
      await expect(page.getByText('Backend unavailable').first()).toBeVisible();
      expect(await noHScroll(page)).toBe(true);
    });

    test('map renders with the bundled Majuli data and all 10 layer toggles work', async ({ page }) => {
      await openCommand(page, vp);
      await page.getByTestId('nav-map').click();
      const map = page.getByTestId('map');
      await expect(map).toBeVisible();
      await expect(map.locator('canvas').first()).toBeVisible();
      const box = await map.boundingBox();
      expect(box!.width).toBeGreaterThan(300);
      expect(box!.height).toBeGreaterThan(200);
      await expect(page.getByTestId('map-legend')).toBeVisible();
      await expect(page.getByTestId('map-legend-synthetic')).toBeAttached();
      await expect(page.getByTestId('map-layer-controls')).toBeVisible();
      for (const l of LAYERS) {
        const box = page.getByTestId(`layer-toggle-${l}`);
        await expect(box, l).toBeVisible();
        const before = await box.isChecked();
        await box.click();
        expect(await box.isChecked(), `${l} toggled`).toBe(!before);
        await box.click();
        expect(await box.isChecked(), `${l} restored`).toBe(before);
      }
      // The bundled basemap has no external tiles: the fixture guard covers requests; the map must still be alive.
      await expect(map.locator('canvas').first()).toBeVisible();
    });

    test('Settlements and Routes: empty snapshot shows empty states, no invented rows', async ({ page }) => {
      await openCommand(page, vp);
      await page.getByTestId('nav-settlements').click();
      await expect(page.getByTestId('settlements-section')).toBeVisible();
      await expect(page.getByTestId('settlements-count')).toContainText('0');
      await expect(page.locator('[data-testid^="settlement-row-"]')).toHaveCount(0);
      await page.getByTestId('nav-routes').click();
      await expect(page.getByTestId('routes-section')).toBeVisible();
      await expect(page.getByTestId('routes-count')).toContainText('0 of 0');
      await expect(page.locator('[data-testid^="route-row-"]')).toHaveCount(0);
      await expect(page.locator('[data-testid^="no-safe-route-"]')).toHaveCount(0);
    });
  });
}

test.describe('command: Settlements / Routes distinguish "No route listed" from "No safe route"', () => {
  test.use({ viewport: COMMAND_VIEWPORTS[0] });

  test('settlement without routes → No route listed; all routes unavailable → No safe route', async ({ page }) => {
    const snap = fixtureSnapshot();
    // S4 has routes but every one is unavailable; S5 has none at all.
    for (const f of snap.routes.features) if (f.properties.from === 'S4') f.properties.status = 'unavailable';
    snap.routes.features = snap.routes.features.filter((f) => f.properties.from !== 'S5');
    await serveSnapshot(page, snap);
    await openCommand(page);

    await page.getByTestId('nav-routes').click();
    await expect(page.getByTestId('no-safe-route-S4')).toBeVisible();
    await expect(page.getByTestId('no-safe-route-S4')).toContainText('No safe route');
    await expect(page.getByTestId('no-safe-route-S1')).toHaveCount(0);
    await expect(page.getByTestId('no-safe-route-S5')).toHaveCount(0);

    await page.getByTestId('nav-settlements').click();
    await expect(page.getByTestId('settlement-row-S4')).toHaveAttribute('data-status', 'no-safe-route');
    await expect(page.getByTestId('settlement-row-S5')).toHaveAttribute('data-status', 'no-route-listed');
    await expect(page.getByTestId('settlement-row-S5')).not.toHaveAttribute('data-status', 'no-safe-route');
  });
});

test('command: API base is the fake server (sanity)', async ({ page }) => {
  const reqs: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/')) reqs.push(r.url()); });
  await openCommand(page);
  await expect.poll(() => reqs.length).toBeGreaterThan(0);
  expect(reqs.every((u) => u.startsWith(API_URL))).toBe(true);
});
