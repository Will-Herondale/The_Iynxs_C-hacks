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

test.describe('step-by-step forms', () => {
  test('the report form is a four-step wizard: Next, Back, and a failed save jumps to the step to fix', async ({ page }) => {
    await openField(page, 'report');
    const label = page.getByTestId('wizard-step-label');
    await expect(label).toContainText('Step 1 of 4');
    await expect(page.getByTestId('report-submit')).toBeHidden();
    await page.getByTestId('report-type-water_level').click(); // choosing a type moves on
    await expect(label).toContainText('Step 2 of 4');
    await page.getByTestId('wizard-back').click();
    await expect(label).toContainText('Step 1 of 4');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();
    await expect(label).toContainText('Step 4 of 4');
    await expect(page.getByTestId('report-submit')).toBeVisible();
    await page.getByTestId('report-submit').click(); // no water level or location yet
    await expect(page.getByTestId('form-error')).toBeVisible();
    await expect(label).toContainText(/Step [23] of 4/);
  });

  test('the household form is a three-step wizard', async ({ page }) => {
    await openField(page, 'households/new');
    await expect(page.getByTestId('wizard-step-label')).toContainText('Step 1 of 3');
    await expect(page.getByTestId('household-headName')).toBeVisible();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('household-vulnerable-elderly')).toBeVisible();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('field-lat')).toBeVisible();
    await expect(page.getByTestId('household-submit')).toBeVisible();
  });
});
