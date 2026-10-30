import type { Page } from '@playwright/test';
import {
  test,
  expect,
  goOffline,
  goOnline,
  pendingCount,
  setMock,
  submitRoadBlockage,
  waitForQueueStatus,
} from '../fixtures/index.js';

const PENDING = ['queued', 'sending', 'accepted', 'failed'];

async function openQueue(page: Page): Promise<void> {
  await page.getByTestId('nav-queue').click();
}

/** Wait until the service worker controls the page, so an offline reload can be served from cache. */
async function waitForServiceWorker(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const regs = await Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 15_000)),
    ]);
    return regs;
  });
}

test.describe('offline sync', () => {
  test('online submit goes queued/sending -> accepted -> synced (accepted is observed before synced)', async ({ fieldPage: page }) => {
    // Apply delay is 3s, so the "accepted but not yet applied" window is wide enough to observe.
    await setMock(page, 'delay:3000');
    await expect(page.getByTestId('online-indicator')).toHaveAttribute('data-online', 'true');

    await submitRoadBlockage(page, 'R7', 'full');
    await openQueue(page);

    const item = page.getByTestId('queue-item').first();
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('data-type', 'road_blockage');

    // An HTTP 2xx / accepted ack is NOT synced: it must sit in `accepted` first.
    await expect(item).toHaveAttribute('data-status', 'accepted', { timeout: 10_000 });
    expect(await pendingCount(page)).toBeGreaterThanOrEqual(1);
    await expect(item).not.toHaveAttribute('data-status', 'synced');

    await expect(item).toHaveAttribute('data-status', 'synced', { timeout: 15_000 });
    await expect(page.getByTestId('pending-count')).toHaveText('0');
    await expect(page.getByTestId('last-synced')).not.toHaveAttribute('data-ts', '');
  });

  test('offline submit stays queued, pending-count increments, online-indicator is data-online=false', async ({ fieldPage: page }) => {
    await expect(page.getByTestId('pending-count')).toHaveText('0');
    await goOffline(page);
    await expect(page.getByTestId('online-indicator')).toHaveAttribute('data-online', 'false');

    await submitRoadBlockage(page, 'R4', 'full');
    await openQueue(page);
    await waitForQueueStatus(page, 0, 'queued');
    await expect(page.getByTestId('pending-count')).toHaveText('1');

    await submitRoadBlockage(page, 'R3', 'partial');
    await openQueue(page);
    await expect(page.getByTestId('queue-item')).toHaveCount(2);
    await waitForQueueStatus(page, 1, 'queued');
    await expect(page.getByTestId('pending-count')).toHaveText('2');

    // Stays queued: offline must not silently advance the status.
    await page.waitForTimeout(2_500);
    for (const i of [0, 1]) {
      await expect(page.getByTestId('queue-item').nth(i)).toHaveAttribute('data-status', 'queued');
    }
    await expect(page.getByTestId('online-indicator')).toHaveAttribute('data-online', 'false');
  });

  test('back online syncs automatically without clicking sync-now', async ({ fieldPage: page }) => {
    await goOffline(page);
    await submitRoadBlockage(page, 'R7', 'full');
    await openQueue(page);
    await waitForQueueStatus(page, 0, 'queued');
    await expect(page.getByTestId('pending-count')).toHaveText('1');

    await goOnline(page);
    await expect(page.getByTestId('online-indicator')).toHaveAttribute('data-online', 'true');

    // No click on sync-now / queue-retry here.
    await waitForQueueStatus(page, 0, 'synced', 20_000);
    await expect(page.getByTestId('pending-count')).toHaveText('0');
  });

  test('queued items survive a reload while offline (mock-offline toggle, no service worker needed)', async ({ fieldPage: page }) => {
    await setMock(page, 'offline');
    await submitRoadBlockage(page, 'R7', 'full');
    await openQueue(page);
    const id = await waitForQueueStatus(page, 0, 'queued');
    expect(id).not.toBe('');

    await page.reload();
    await openQueue(page);
    await expect(page.getByTestId('queue-item')).toHaveCount(1);
    const item = page.locator(`[data-testid="queue-item"][data-client-event-id="${id}"]`);
    await expect(item).toHaveAttribute('data-status', 'queued');
    await expect(page.getByTestId('pending-count')).toHaveText('1');
  });

  test('queued items survive a reload with the network actually down, and sync after reconnect', async ({ fieldPage: page }) => {
    const swReady = await waitForServiceWorker(page);
    test.skip(!swReady, 'no service worker registered; covered by the PWA test failure');

    await goOffline(page);
    await submitRoadBlockage(page, 'R7', 'full');
    await openQueue(page);
    const id = await waitForQueueStatus(page, 0, 'queued');

    await page.reload();
    await expect(page.getByTestId('online-indicator')).toHaveAttribute('data-online', 'false');
    await openQueue(page);
    const item = page.locator(`[data-testid="queue-item"][data-client-event-id="${id}"]`);
    await expect(item).toHaveAttribute('data-status', 'queued');
    await expect(page.getByTestId('pending-count')).toHaveText('1');

    await goOnline(page);
    await expect(item).toHaveAttribute('data-status', 'synced', { timeout: 20_000 });
    await expect(page.getByTestId('pending-count')).toHaveText('0');
  });

  test('PWA: the app shell loads offline after the first load', async ({ fieldPage: page }) => {
    expect(await waitForServiceWorker(page), 'a service worker must be registered and ready after first load').toBe(true);
    // Make sure the page is controlled (a reload gives the SW control on first install).
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByTestId('online-indicator')).toBeVisible();
    await expect(page.getByTestId('online-indicator')).toHaveAttribute('data-online', 'false');
    await expect(page.getByTestId('nav-report')).toBeVisible();
    await expect(page.getByTestId('nav-queue')).toBeVisible();
    await expect(page.getByTestId('report-submit')).toBeAttached();

    await page.context().setOffline(false);
  });

  test('pending states are never reported as synced while the server has not applied the event', async ({ fieldPage: page }) => {
    await setMock(page, 'delay:3000');
    await submitRoadBlockage(page, 'R7', 'full');
    await openQueue(page);
    const item = page.getByTestId('queue-item').first();
    await expect(item).toHaveAttribute('data-status', /queued|sending|accepted/);
    const status = await item.getAttribute('data-status');
    expect(PENDING).toContain(status);
    expect(Number(await page.getByTestId('pending-count').innerText())).toBeGreaterThanOrEqual(1);
  });
});
