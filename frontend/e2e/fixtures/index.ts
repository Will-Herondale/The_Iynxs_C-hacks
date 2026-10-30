import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

export const FIELD_URL = 'http://localhost:5173';
export const COMMAND_URL = 'http://localhost:5174';
export const RELAY_URL = 'http://127.0.0.1:5199';

/** Clear the shared mock relay state (field <-> command store) back to the seed scenario. */
export async function resetMockState(): Promise<void> {
  try {
    const cur = (await (await fetch(`${RELAY_URL}/state`)).json()) as { rev: number };
    await fetch(`${RELAY_URL}/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseRev: cur.rev, state: null }),
    });
  } catch {
    /* relay down: apps fall back to local-only */
  }
}

/** Open `path` with a `?mock=` toggle (e.g. 'offline', '5xx:1', 'delay:3000', 'conflict', 'reject', 'off'). Persisted in localStorage. */
export async function setMock(page: Page, toggle: string, base = page.url().startsWith('http') ? new URL(page.url()).origin : FIELD_URL): Promise<void> {
  await page.goto(`${base}/?mock=${encodeURIComponent(toggle).replace(/%2C/g, ',').replace(/%3A/g, ':')}`);
}

/** Change the toggle without losing the page: set via URL then keep the queue (localStorage persists). */
export async function changeMock(page: Page, toggle: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  await setMock(page, toggle, origin);
}

export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

/** Fill and submit a road_blockage report from the field app (assumes the field app is loaded). */
export async function submitRoadBlockage(page: Page, roadId: string, blockage: 'partial' | 'full' = 'full'): Promise<void> {
  await page.getByTestId('nav-report').click();
  await page.getByTestId('report-type-road_blockage').click();
  await page.getByTestId('field-roadId').selectOption(roadId);
  await page.getByTestId('field-blockage').selectOption(blockage);
  await page.getByTestId('report-submit').click();
}

/** Wait for a queue item (by clientEventId or 0-based index) to reach a ClientSyncStatus; returns its clientEventId. */
export async function waitForQueueStatus(page: Page, target: string | number, status: string, timeout = 15_000): Promise<string> {
  const items = page.getByTestId('queue-item');
  const item = typeof target === 'number' ? items.nth(target) : page.locator(`[data-testid="queue-item"][data-client-event-id="${target}"]`);
  await expect(item).toHaveAttribute('data-status', status, { timeout });
  return (await item.getAttribute('data-client-event-id')) ?? '';
}

export async function pendingCount(page: Page): Promise<number> {
  return Number((await page.getByTestId('pending-count').innerText()).trim());
}

type Fixtures = {
  /** A page on the field app, with fresh shared mock state. */
  fieldPage: Page;
  /** A second page (same context) on the command centre. */
  commandPage: Page;
  context: BrowserContext;
};

export const test = base.extend<Fixtures>({
  fieldPage: async ({ context }, use) => {
    await resetMockState();
    const page = await context.newPage();
    await page.goto(`${FIELD_URL}/?mock=off`);
    await use(page);
  },
  commandPage: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto(`${COMMAND_URL}/?mock=off`);
    await use(page);
  },
});

export { expect };
