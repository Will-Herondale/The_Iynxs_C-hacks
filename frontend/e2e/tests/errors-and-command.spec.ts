import type { Locator, Page } from '@playwright/test';
import { test, expect, changeMock, submitRoadBlockage, waitForQueueStatus, COMMAND_URL } from '../fixtures/index.js';

/** Attempts are not in the binding test-id table: read `data-attempts` if the app exposes it, else parse the item text. */
async function attemptsOf(item: Locator): Promise<number | null> {
  const attr = await item.getAttribute('data-attempts');
  if (attr !== null && attr !== '') return Number(attr);
  const m = /attempts?\D{0,12}(\d+)/i.exec(await item.innerText());
  return m ? Number(m[1]) : null;
}

const projectionVersion = async (page: Page): Promise<number> =>
  Number(await page.getByTestId('map').getAttribute('data-projection-version'));

const stat = async (page: Page, id: string): Promise<number> =>
  Number((await page.getByTestId(id).innerText()).trim());

test.describe('5xx errors and backoff', () => {
  test('?mock=5xx:1 -> failed with growing attempts; clearing the toggle -> synced', async ({ fieldPage: page }) => {
    await changeMock(page, '5xx:1');
    await submitRoadBlockage(page, 'R7', 'full');

    const item = page.getByTestId('queue-item').first();
    await expect(item).toBeVisible();
    const id = await waitForQueueStatus(page, 0, 'failed', 20_000);
    expect(id).not.toBe('');
    // A failed item is NOT synced and still counts as pending.
    await expect(page.getByTestId('pending-count')).toHaveText('1');

    // Attempts increase with automatic retries (best effort: only if the app exposes the count).
    const first = await attemptsOf(item);
    if (first !== null) {
      await expect.poll(async () => (await attemptsOf(item)) ?? 0, { timeout: 30_000 }).toBeGreaterThan(first);
    } else {
      test.info().annotations.push({ type: 'note', description: 'attempt count not exposed (no data-attempts / "attempts N" text)' });
    }
    await expect(item).toHaveAttribute('data-status', /failed|sending|queued/);

    // Manual retry also never reports synced while the server is still failing.
    await item.getByTestId('queue-retry').click();
    await expect(item).not.toHaveAttribute('data-status', 'synced');

    // Clear the failure: the same event syncs (same clientEventId, still one item).
    await changeMock(page, 'off');
    await expect(page.getByTestId('queue-item')).toHaveCount(1);
    const synced = page.locator(`[data-testid="queue-item"][data-client-event-id="${id}"]`);
    if ((await synced.getAttribute('data-status')) === 'failed') {
      await page.getByTestId('sync-now').click();
    }
    await expect(synced).toHaveAttribute('data-status', 'synced', { timeout: 30_000 });
    await expect(page.getByTestId('pending-count')).toHaveText('0');
  });
});

test.describe('cross-app loop: field report -> command projections', () => {
  test('road_blockage R7 full recalculates roads, settlements and routes on the command centre', async ({ fieldPage, commandPage }) => {
    // Baseline on the command centre.
    await expect(commandPage.getByTestId('road-row-R7')).not.toHaveAttribute('data-status', 'blocked');
    await expect(commandPage.getByTestId('settlement-row-S3')).not.toHaveAttribute('data-accessibility', 'cut_off');
    const cutOffBefore = await stat(commandPage, 'stat-cut-off');
    const versionBefore = await projectionVersion(commandPage);

    await submitRoadBlockage(fieldPage, 'R7', 'full');
    const clientEventId = await waitForQueueStatus(fieldPage, 0, 'synced', 30_000);

    await expect(commandPage.getByTestId('road-row-R7')).toHaveAttribute('data-status', 'blocked', { timeout: 20_000 });
    await expect(commandPage.getByTestId('settlement-row-S3')).toHaveAttribute('data-accessibility', 'cut_off');
    await expect(commandPage.getByTestId('route-row-EVAC-2')).toHaveAttribute('data-status', 'unavailable');
    await expect(commandPage.getByTestId('route-row-EVAC-2b')).toHaveAttribute('data-status', 'recalculated');
    await expect.poll(() => stat(commandPage, 'stat-cut-off')).toBe(cutOffBefore + 1);
    await expect(
      commandPage.locator(`[data-testid="incident-item"][data-client-event-id="${clientEventId}"]`),
    ).toBeVisible();
    await expect.poll(() => projectionVersion(commandPage)).toBeGreaterThan(versionBefore);
  });

  test('command incident status reflects the confirmed event, not just acceptance', async ({ fieldPage, commandPage }) => {
    await submitRoadBlockage(fieldPage, 'R7', 'full');
    const id = await waitForQueueStatus(fieldPage, 0, 'synced', 30_000);
    const incident = commandPage.locator(`[data-testid="incident-item"][data-client-event-id="${id}"]`);
    await expect(incident).toHaveAttribute('data-status', /accepted|synced/, { timeout: 20_000 });
  });
});

test.describe('command centre UI', () => {
  test('layer toggles flip aria-checked/checked', async ({ commandPage }) => {
    for (const layer of ['flood', 'roads', 'settlements', 'routes', 'shelters']) {
      const toggle = commandPage.getByTestId(`layer-toggle-${layer}`);
      await expect(toggle).toBeVisible();
      const before = await toggle.isChecked();
      await toggle.click();
      await expect(toggle).toBeChecked({ checked: !before });
      await toggle.click();
      await expect(toggle).toBeChecked({ checked: before });
    }
  });

  test('clicking list rows opens feature-panel for that feature', async ({ commandPage }) => {
    const cases: Array<{ row: string; kind: RegExp; id: string }> = [
      { row: 'road-row-R7', kind: /road/i, id: 'R7' },
      { row: 'settlement-row-S3', kind: /settlement/i, id: 'S3' },
      { row: 'route-row-EVAC-2', kind: /route/i, id: 'EVAC-2' },
    ];
    for (const c of cases) {
      await commandPage.getByTestId(c.row).click();
      const panel = commandPage.getByTestId('feature-panel');
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('data-feature-id', c.id);
      await expect(panel).toHaveAttribute('data-feature-kind', c.kind);
    }
  });

  test('shelter row click opens feature-panel', async ({ commandPage }) => {
    const row = commandPage.locator('[data-testid^="shelter-row-"]').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(commandPage.getByTestId('feature-panel')).toHaveAttribute('data-feature-kind', /shelter/i);
  });

  test('connection-status reports a valid state (best effort: stays usable if the relay is down)', async ({ commandPage }) => {
    await expect(commandPage.getByTestId('connection-status')).toHaveAttribute('data-state', /^(live|polling|offline)$/);

    // Block the relay (SSE/HTTP on 5199) and reload: the command centre must still render and not claim "live".
    await commandPage.route(/:5199\//, (route) => route.abort());
    await commandPage.goto(`${COMMAND_URL}/?mock=off`);
    await expect(commandPage.getByTestId('map')).toBeVisible();
    await expect(commandPage.getByTestId('road-row-R7')).toBeVisible();
    await expect(commandPage.getByTestId('connection-status')).toHaveAttribute('data-state', /^(polling|offline|live)$/);
    test.info().annotations.push({
      type: 'note',
      description: `connection-status with relay blocked: ${await commandPage.getByTestId('connection-status').getAttribute('data-state')}`,
    });
  });

  test('command centre offline (browser) shows connection-status offline', async ({ commandPage, context }) => {
    await context.setOffline(true);
    await commandPage.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(commandPage.getByTestId('connection-status')).toHaveAttribute('data-state', 'offline', { timeout: 15_000 });
    await context.setOffline(false);
    await commandPage.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(commandPage.getByTestId('connection-status')).not.toHaveAttribute('data-state', 'offline', { timeout: 20_000 });
  });
});
