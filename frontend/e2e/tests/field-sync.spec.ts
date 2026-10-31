import { ackRoute, BATCH, FAKE_API, FIELD_VIEWPORT, expect, goOffline, item, openField, openSync, submitReport, test } from './field-support';

test.use(FIELD_VIEWPORT);

const LABEL = (p: import('@playwright/test').Page, id: string) => item(p, id).getByTestId('sync-status-label');

test.describe('field offline queue and sync', () => {
  test('offline submit → Saved locally → reload → still pending → reconnect → Accepted', async ({ page }) => {
    await openField(page);
    await goOffline(page);
    const id = await submitReport(page, 'submerged_bridge');
    await openSync(page);
    await expect(item(page, id)).toHaveAttribute('data-status', 'queued');
    await expect(LABEL(page, id)).toHaveText(/Saved locally/);
    await expect(page.getByTestId('connectivity-status')).toHaveAttribute('data-state', 'offline');

    // The dev server is unreachable while offline, so reload with the network back but the sync endpoint blocked.
    await page.context().setOffline(false);
    await page.route(BATCH, (route) => route.abort('connectionrefused'));
    await page.reload();
    await expect(item(page, id)).toBeVisible();
    await expect(item(page, id)).not.toHaveAttribute('data-status', 'synced');
    await page.waitForTimeout(1500);
    await expect(item(page, id)).not.toHaveAttribute('data-status', 'synced');

    await page.unroute(BATCH);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(item(page, id)).toHaveAttribute('data-status', 'synced', { timeout: 30_000 });
    await expect(LABEL(page, id)).toHaveText(/Accepted/);
    await expect(page.getByTestId('last-synced').first()).toHaveAttribute('data-ts', /\d{4}-/);
  });

  test('double-click on Save sends and stores exactly one event', async ({ page, sent }) => {
    await openField(page);
    await page.getByTestId('nav-report').click();
    await page.getByTestId('report-type-water_level').click();
    await page.getByTestId('field-levelCm').fill('150');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('field-lat').fill('26.95');
    await page.getByTestId('field-lng').fill('94.17');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('report-submit').dblclick();
    await expect(page.getByTestId('report-saved')).toBeVisible();
    await openSync(page);
    await expect(page.getByTestId('queue-item')).toHaveCount(1);
    await expect(page.getByTestId('queue-item')).toHaveAttribute('data-status', 'synced', { timeout: 20_000 });
    expect(new Set(sent.map((e) => e.clientEventId)).size).toBe(1);
  });

  test('retry after a 5xx reuses the same clientEventId', async ({ page, sent }) => {
    let failures = 2;
    await page.route(BATCH, (route) => {
      if (route.request().method() === 'POST' && failures-- > 0) return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"error":"x"}' });
      return route.fallback();
    });
    await openField(page);
    const id = await submitReport(page, 'water_level');
    await openSync(page);
    // Backoff may delay the automatic retry; the manual button retries immediately.
    await expect.poll(async () => {
      if (await page.getByTestId('queue-sync-now').isEnabled()) await page.getByTestId('queue-sync-now').click();
      return item(page, id).getAttribute('data-status');
    }, { timeout: 30_000, intervals: [500] }).toBe('synced');
    const attempts = sent.filter((e) => e.type === 'water_level');
    expect(attempts.length).toBeGreaterThanOrEqual(3);
    expect(new Set(attempts.map((e) => e.clientEventId))).toEqual(new Set([id]));
  });

  test('retry after a network timeout/abort reuses the same clientEventId', async ({ page, sent }) => {
    let aborts = 1;
    await page.route(BATCH, (route) => {
      if (route.request().method() === 'POST' && aborts-- > 0) return route.abort('timedout');
      return route.fallback();
    });
    await openField(page);
    const id = await submitReport(page, 'flood_report');
    await openSync(page);
    await expect.poll(async () => {
      if (await page.getByTestId('queue-sync-now').isEnabled()) await page.getByTestId('queue-sync-now').click();
      return item(page, id).getAttribute('data-status');
    }, { timeout: 30_000, intervals: [500] }).toBe('synced');
    const ids = sent.filter((e) => e.type === 'flood_report').map((e) => e.clientEventId);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids)).toEqual(new Set([id]));
  });

  test('a lost ack (server got it, client saw an error) does not create a duplicate on the server', async ({ page, request }) => {
    let first = true;
    await page.route(BATCH, async (route) => {
      if (route.request().method() === 'POST' && first) {
        first = false;
        await route.fetch(); // server applies it
        return route.abort('connectionreset');
      }
      return route.fallback();
    });
    await openField(page);
    const id = await submitReport(page, 'water_level', { levelCm: '77' });
    await openSync(page);
    await expect.poll(async () => {
      if (await page.getByTestId('queue-sync-now').isEnabled()) await page.getByTestId('queue-sync-now').click();
      return item(page, id).getAttribute('data-status');
    }, { timeout: 30_000, intervals: [500] }).toBe('synced');
    const res = await request.get(`${FAKE_API}/api/v1/events?limit=500`);
    const events = ((await res.json()) as { events: { event: { clientEventId: string } }[] }).events;
    expect(events.filter((e) => e.event.clientEventId === id)).toHaveLength(1);
  });

  test('conflict → Requires review panel → keep mine resolves', async ({ page }) => {
    await page.route(BATCH, ackRoute('conflict'));
    await openField(page);
    const id = await submitReport(page, 'road_blockage', { road: 'R2' });
    await openSync(page);
    await expect(item(page, id)).toHaveAttribute('data-status', 'conflict', { timeout: 20_000 });
    await expect(LABEL(page, id)).toHaveText(/Requires review/);
    await expect(item(page, id).getByTestId('conflict-panel')).toBeVisible();
    await expect(item(page, id).getByTestId('conflict-accept-server')).toBeVisible();
    await page.unroute(BATCH);
    await item(page, id).getByTestId('conflict-keep-mine').click();
    // "Keep mine" resubmits as a NEW report (new clientEventId); the original is archived as superseded.
    await expect(page.locator('[data-testid="queue-item"][data-status="conflict"]')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId('queue-item')).toHaveCount(1);
    await expect(page.getByTestId('queue-item')).toHaveAttribute('data-status', 'synced', { timeout: 30_000 });
    expect(await page.getByTestId('queue-item').getAttribute('data-client-event-id')).not.toBe(id);
  });

  test('conflict panel does not overflow the 360px viewport horizontally', async ({ page }) => {
    await page.route(BATCH, ackRoute('conflict'));
    await openField(page);
    const id = await submitReport(page, 'road_blockage', { road: 'R2' });
    await openSync(page);
    await expect(item(page, id).getByTestId('conflict-panel')).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('conflict → accept server version removes the review state', async ({ page }) => {
    await page.route(BATCH, ackRoute('conflict'));
    await openField(page);
    const id = await submitReport(page, 'road_blockage', { road: 'R3' });
    await openSync(page);
    await expect(item(page, id)).toHaveAttribute('data-status', 'conflict', { timeout: 20_000 });
    await item(page, id).getByTestId('conflict-accept-server').click();
    await expect(page.getByTestId('conflict-panel')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('[data-testid="queue-item"][data-status="conflict"]')).toHaveCount(0);
  });

  test('rejected → edit → resubmit creates a linked replacement that syncs', async ({ page, sent }) => {
    let reject = true;
    await page.route(BATCH, (route) => (reject ? ackRoute('rejected')(route) : route.fallback()));
    await openField(page);
    const id = await submitReport(page, 'water_level', { levelCm: '90' });
    await openSync(page);
    await expect(item(page, id)).toHaveAttribute('data-status', 'rejected', { timeout: 20_000 });
    await expect(LABEL(page, id)).toHaveText(/Rejected/);
    reject = false;
    await item(page, id).getByTestId('queue-edit').click();
    await page.getByTestId('field-levelCm').fill('95');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('report-submit').click();
    await expect(page.getByTestId('report-saved-label')).toHaveText(/Saved locally/);
    await openSync(page);
    // The replacement is the only live queue item; it gets its own clientEventId.
    await expect(page.getByTestId('queue-item')).toHaveCount(1);
    const replacement = page.getByTestId('queue-item');
    await expect(replacement).toHaveAttribute('data-status', 'synced', { timeout: 20_000 });
    const newId = (await replacement.getAttribute('data-client-event-id')) ?? '';
    expect(newId).not.toBe(id);
    expect(sent.find((e) => e.clientEventId === newId)).toMatchObject({ type: 'water_level', levelCm: 95 });
    // The original is kept for the record, linked to its replacement.
    await page.goto(`/#/report/${id}`);
    await expect(page.getByTestId('report-detail')).toHaveAttribute('data-status', 'superseded');
    await expect(page.getByTestId('provenance-superseded')).toBeVisible();
    await page.getByTestId('provenance-open-replacement').click();
    await expect(page.getByTestId('report-detail')).toHaveAttribute('data-client-event-id', newId);
    await expect(page.getByTestId('provenance-supersedes')).toBeVisible();
  });

  // Known app bug (reported to lead): the "saved" confirmation of an edited report shows the form's id, but the queue stores the
  // replacement under a freshly minted clientEventId (sync/queue.ts), so "View report" would open a report that does not exist.
  test('edited report: confirmation id matches the queued replacement', async ({ page }) => {
    await page.route(BATCH, ackRoute('rejected'));
    await openField(page);
    const id = await submitReport(page, 'water_level', { levelCm: '90' });
    await openSync(page);
    await expect(item(page, id)).toHaveAttribute('data-status', 'rejected', { timeout: 20_000 });
    await page.unroute(BATCH);
    await item(page, id).getByTestId('queue-edit').click();
    await page.getByTestId('field-levelCm').fill('96');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('report-submit').click();
    const savedId = (await page.getByTestId('report-saved').getAttribute('data-client-event-id')) ?? '';
    await openSync(page);
    await expect(item(page, savedId)).toHaveCount(1);
  });

  test('discard asks for confirmation; Keep report keeps it, Discard removes it', async ({ page }) => {
    await openField(page);
    await goOffline(page);
    const id = await submitReport(page, 'water_level');
    await openSync(page);
    await item(page, id).getByTestId('queue-discard').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep report' }).click();
    await expect(item(page, id)).toBeVisible();
    await item(page, id).getByTestId('queue-discard').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Discard report' }).click();
    await expect(item(page, id)).toHaveCount(0);
  });

  test('Failed status offers retry and shows the exact vocabulary', async ({ page }) => {
    await page.route(BATCH, (route) => route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"error":"bad"}' }));
    await openField(page);
    const id = await submitReport(page, 'water_level');
    await openSync(page);
    await expect.poll(() => item(page, id).getAttribute('data-status'), { timeout: 30_000 }).not.toBe('queued');
    const status = await item(page, id).getAttribute('data-status');
    test.info().annotations.push({ type: 'status-after-400', description: String(status) });
    expect(['failed', 'rejected']).toContain(status);
    await expect(LABEL(page, id)).toHaveText(status === 'failed' ? /Failed — retry available/ : /Rejected/);
    if (status === 'failed') await expect(item(page, id).getByTestId('queue-retry')).toBeVisible();
  });
});
