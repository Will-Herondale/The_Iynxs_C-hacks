import { test, expect, openField, openCommand, submitReport, expectQueueStatus, goOffline, goOnline, COMMAND_URL } from '../fixtures';

test.describe('cross-app: Field → fake backend → Command', () => {
  test('report submitted offline in Field syncs and appears in Command Events and Audit with the original payload', async ({ page, context }) => {
    // Field (phone) offline submit
    await openField(page, 'home');
    await goOffline(page);
    const cid = await submitReport(page, 'water_level', { levelCm: '137' });
    await expect(page.getByTestId('report-saved-label')).toHaveText('Saved locally');
    await goOnline(page);
    await page.getByTestId('nav-sync').click();
    await expectQueueStatus(page, cid, 'synced', 30_000);

    // Command (desk) sees it
    const desk = await context.newPage();
    await openCommand(desk, { width: 1366, height: 768 });
    await desk.getByTestId('nav-events').click();
    const item = desk.locator(`[data-testid="feed-item"][data-client-event-id="${cid}"]`);
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(item).toHaveAttribute('data-type', 'water_level');
    await desk.getByTestId(`feed-open-${await item.getAttribute('data-event-id')}`).click();
    const payload = JSON.parse(await desk.getByTestId('event-payload').innerText()) as Record<string, unknown>;
    expect(payload).toMatchObject({ clientEventId: cid, type: 'water_level', levelCm: 137 });

    await desk.getByTestId('nav-audit').click();
    await expect(desk.locator(`[data-testid="audit-row"][data-client-event-id="${cid}"]`)).toBeVisible();
    expect(desk.url().startsWith(COMMAND_URL)).toBe(true);
  });

  test('Command goes "Backend unavailable" when the API drops and recovers when it returns', async ({ page }) => {
    let down = false;
    await page.route('**/api/v1/**', (route) => (down ? route.abort('connectionrefused') : route.fallback()));
    await openCommand(page);
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', /live|polling/);
    down = true;
    await page.reload();
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'unavailable', { timeout: 20_000 });
    down = false;
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', /live|polling/, { timeout: 30_000 });
  });
});
