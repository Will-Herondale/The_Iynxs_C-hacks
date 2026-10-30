import { test, expect, openField, openCommand, goOffline, goOnline } from '../fixtures/index.js';

test.describe('offline honesty and demo scenario action', () => {
  test('an offline field device says it only knows its own information, and the notice clears when back online', async ({ page }) => {
    await openField(page, 'home');
    await expect(page.getByTestId('local-only-notice')).toHaveCount(0);
    await goOffline(page);
    const notice = page.getByTestId('local-only-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-reason', 'offline');
    await expect(notice).toContainText('not the district-wide situation');
    await goOnline(page);
    await expect(page.getByTestId('local-only-notice')).toHaveCount(0, { timeout: 15_000 });
  });

  test('the notice follows the user to every screen', async ({ page }) => {
    await openField(page, 'home');
    await goOffline(page);
    for (const nav of ['nav-report', 'nav-map', 'nav-sync']) {
      await page.getByTestId(nav).click();
      await expect(page.getByTestId('local-only-notice')).toBeVisible();
    }
  });

  test('Command: "Open demo scenario" is disabled when the data has no synthetic features, and Majuli overview is always there', async ({ page }) => {
    await openCommand(page);
    await page.getByTestId('nav-map').click();
    await expect(page.getByTestId('show-overview')).toBeVisible();
    await expect(page.getByTestId('open-demo-scenario')).toBeDisabled();
  });
});
