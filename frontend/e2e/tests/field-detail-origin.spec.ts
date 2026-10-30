import { FAKE_API, FIELD_VIEWPORT, expect, item, mockProjections, openField, openSync, submitReport, test } from './field-support';

test.use(FIELD_VIEWPORT);

test.describe('field report detail and local/remote origin', () => {
  test('report detail shows status, ids, payload and server ack', async ({ page }) => {
    await openField(page);
    const id = await submitReport(page, 'water_level', { levelCm: '133' });
    await page.getByTestId('report-view-detail').click();
    await expect(page.getByTestId('report-detail')).toHaveAttribute('data-client-event-id', id);
    await expect(page.getByTestId('report-detail')).toHaveAttribute('data-status', 'synced', { timeout: 20_000 });
    await expect(page.getByTestId('detail-status')).toContainText('Accepted');
    await expect(page.getByTestId('detail-client-event-id')).toHaveText(id);
    await expect(page.getByTestId('detail-event-id')).toBeVisible();
    await expect(page.getByTestId('detail-payload')).toContainText('133');
    await expect(page.getByTestId('detail-ack')).toBeVisible();
    await expect(page.getByTestId('detail-location')).toBeVisible();
    await expect(page.getByTestId('detail-observed')).toBeVisible();
    await page.getByTestId('detail-back').click();
  });

  test('pending report detail has no ack and no event id yet', async ({ page }) => {
    await openField(page);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const id = await submitReport(page, 'flood_report');
    await page.goto(`/#/report/${id}`);
    await expect(page.getByTestId('detail-status')).toContainText('Saved locally');
    await expect(page.getByTestId('detail-ack-none')).toBeVisible();
    await expect(page.getByTestId('detail-event-id-none')).toBeVisible();
  });

  test('queue item links to its detail page', async ({ page }) => {
    await openField(page);
    const id = await submitReport(page, 'water_level');
    await openSync(page);
    await item(page, id).getByTestId('queue-detail-link').click();
    await expect(page.getByTestId('report-detail')).toHaveAttribute('data-client-event-id', id);
  });

  test('unknown report id does not crash the app', async ({ page }) => {
    await openField(page, '#/report/does-not-exist');
    await expect(page.getByTestId('nav-home')).toBeVisible();
    await expect(page.getByTestId('report-detail')).toHaveCount(0);
  });

  test('own reports are marked Local, server events from others are marked Remote', async ({ page, request }) => {
    await mockProjections(page);
    // A report that did not originate on this device: post it straight to the server.
    const remoteId = '11111111-1111-4111-8111-111111111111';
    const res = await request.post(`${FAKE_API}/api/v1/events:batch`, {
      data: { events: [{ clientEventId: remoteId, type: 'water_level', levelCm: 210, trend: 'rising', occurredAt: new Date().toISOString(), reporterId: 'other-volunteer', deviceId: 'other-device', location: { lat: 26.95, lng: 94.17 } }] },
    });
    expect(res.ok()).toBe(true);

    await openField(page);
    const localId = await submitReport(page, 'flood_report');
    await openSync(page);
    await expect(item(page, localId)).toHaveAttribute('data-status', 'synced', { timeout: 20_000 });
    await expect(item(page, localId).getByTestId('origin-badge')).toHaveAttribute('data-origin', 'local');

    await page.getByTestId('nav-map').click();
    await expect(page.getByTestId('map-reports').getByTestId('origin-badge').first()).toHaveAttribute('data-origin', 'local');
    const remote = page.locator('[data-testid="origin-badge"][data-origin="remote"]');
    await expect(remote.first()).toBeVisible({ timeout: 15_000 });
    // Shape/label, not colour alone.
    await expect(remote.first()).toContainText(/Remote/);
    await expect(page.getByTestId('map-key')).toBeVisible();
  });
});
