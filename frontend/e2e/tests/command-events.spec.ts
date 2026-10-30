import { randomUUID } from 'node:crypto';
import { test, expect, openCommand, API_URL, COMMAND_VIEWPORTS } from '../fixtures';

/** Post one valid event straight to the fake server (the "field device" side), return its clientEventId. */
export async function postEvent(event: Record<string, unknown>): Promise<string> {
  const clientEventId = randomUUID();
  const body = { clientEventId, occurredAt: new Date().toISOString(), reporterId: 'e2e-reporter', deviceId: 'e2e-device', location: { lat: 26.95, lng: 94.17 }, ...event };
  const res = await fetch(`${API_URL}/api/v1/events:batch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [body] }) });
  expect(res.ok).toBe(true);
  const { acks } = (await res.json()) as { acks: Array<{ result: string }> };
  expect(acks[0]?.result).toBe('accepted');
  return clientEventId;
}

for (const vp of COMMAND_VIEWPORTS) {
  test.describe(`command events @ ${vp.width}x${vp.height}`, () => {
    test('empty server: Events and Audit show empty states', async ({ page }) => {
      await openCommand(page, vp);
      await page.getByTestId('nav-events').click();
      await expect(page.getByTestId('events-section')).toBeVisible();
      await expect(page.getByTestId('feed-item')).toHaveCount(0);
      await page.getByTestId('nav-audit').click();
      await expect(page.getByTestId('audit-view')).toBeVisible();
      await expect(page.getByTestId('audit-row')).toHaveCount(0);
    });

    test('a field report shows in Events and Audit with its original payload; drawer opens/closes', async ({ page }) => {
      const cid = await postEvent({ type: 'road_blockage', roadId: 'R-E2E-1', blockage: 'full', cause: 'debris', note: 'e2e payload marker' });
      await openCommand(page, vp);

      await page.getByTestId('nav-events').click();
      const item = page.locator(`[data-testid="feed-item"][data-client-event-id="${cid}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await expect(item).toHaveAttribute('data-type', 'road_blockage');
      await expect(page.getByTestId('events-count')).toContainText(/\d+ events?/);

      const eventId = (await item.getAttribute('data-event-id'))!;
      await page.getByTestId(`feed-open-${eventId}`).click();
      const drawer = page.getByTestId('event-drawer');
      await expect(drawer).toHaveAttribute('data-event-id', eventId);
      await expect(page.getByTestId('event-drawer-id')).toHaveText(eventId);
      const payload = JSON.parse(await page.getByTestId('event-payload').innerText()) as Record<string, unknown>;
      expect(payload).toMatchObject({ clientEventId: cid, type: 'road_blockage', roadId: 'R-E2E-1', blockage: 'full', cause: 'debris', note: 'e2e payload marker' });
      await expect(page.getByTestId('event-changes')).toBeVisible();
      await page.getByTestId('event-drawer-close').click();
      await expect(drawer).toHaveCount(0);

      await page.getByTestId('nav-audit').click();
      const row = page.locator(`[data-testid="audit-row"][data-client-event-id="${cid}"]`);
      await expect(row).toBeVisible();
      expect(await row.getAttribute('data-event-id')).toBe(eventId);
      await page.getByTestId(`audit-open-${eventId}`).click();
      const p2 = JSON.parse(await page.getByTestId('event-payload').innerText()) as Record<string, unknown>;
      expect(p2).toMatchObject({ clientEventId: cid, roadId: 'R-E2E-1' });
    });

    test('audit filters: type, status, location and date narrow the list', async ({ page }) => {
      const a = await postEvent({ type: 'road_blockage', roadId: 'R-AAA', blockage: 'partial' });
      const b = await postEvent({ type: 'water_level', levelCm: 140, trend: 'rising' });
      await openCommand(page, vp);
      await page.getByTestId('nav-audit').click();
      const rows = page.getByTestId('audit-row');
      await expect(rows).toHaveCount(2, { timeout: 20_000 });
      await expect(page.getByTestId('audit-count')).toContainText('2 of 2');

      await page.getByTestId('audit-filter-type').selectOption('water_level');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute('data-client-event-id', b);
      await page.getByTestId('audit-filter-type').selectOption('');
      await expect(rows).toHaveCount(2);

      await page.getByTestId('audit-filter-status').selectOption('rejected');
      await expect(rows).toHaveCount(0);
      await page.getByTestId('audit-filter-status').selectOption('');
      await expect(rows).toHaveCount(2);

      await page.getByTestId('audit-filter-location').fill('R-AAA');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute('data-client-event-id', a);
      await page.getByTestId('audit-filter-location').fill('');
      await expect(rows).toHaveCount(2);

      // a window entirely in the past excludes both
      await page.getByTestId('audit-filter-to').fill('2020-01-01T00:00');
      await expect(rows).toHaveCount(0);
      await page.getByTestId('audit-filter-to').fill('');
      await expect(rows).toHaveCount(2);
    });
  });
}
