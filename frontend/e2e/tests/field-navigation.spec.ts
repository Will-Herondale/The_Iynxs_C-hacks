import { FIELD_VIEWPORT, expect, openField, submitReport, test } from './field-support';

test.use(FIELD_VIEWPORT);

test.describe('field shell, home and report categories', () => {
  test('bottom nav has the five tabs and marks the active one', async ({ page }) => {
    await openField(page);
    for (const id of ['home', 'report', 'map', 'households', 'sync']) {
      await page.getByTestId(`nav-${id}`).click();
      await expect(page.getByTestId(`nav-${id}`)).toHaveAttribute('aria-current', 'page');
    }
    await expect(page.getByTestId('nav-queue')).toHaveCount(0);
    await expect(page.getByTestId('nav-household')).toHaveCount(0);
  });

  test('no horizontal scroll at 360px on every tab', async ({ page }) => {
    await openField(page);
    for (const id of ['home', 'report', 'map', 'households', 'sync']) {
      await page.getByTestId(`nav-${id}`).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `tab ${id}`).toBeLessThanOrEqual(0);
    }
  });

  test('home starts empty and counts a saved report as pending', async ({ page }) => {
    await openField(page);
    await expect(page.getByTestId('home-screen')).toBeVisible();
    await expect(page.getByTestId('home-recent-empty')).toBeVisible();
    await expect(page.getByTestId('home-count-pending')).toContainText('0');
    await expect(page.getByTestId('home-count-attention')).toHaveAttribute('data-attention', 'false');
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await submitReport(page, 'water_level');
    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('home-count-pending')).toContainText('1');
    await expect(page.getByTestId('home-recent-item')).toHaveCount(1);
    await expect(page.getByTestId('home-connectivity')).toHaveAttribute('data-online', 'false');
  });

  test('home actions link to report and household registration', async ({ page }) => {
    await openField(page);
    await page.getByTestId('home-new-report').click();
    await expect(page).toHaveURL(/#\/report$/);
    await page.getByTestId('nav-home').click();
    await page.getByTestId('home-register-household').click();
    await expect(page).toHaveURL(/#\/households\/new/);
    await expect(page.getByTestId('household-submit')).toBeVisible();
  });

  test('report offers the four categories; unavailable ones are disabled', async ({ page }) => {
    await openField(page, '#/report');
    for (const c of ['water_level', 'flood_report', 'road_blockage', 'submerged_bridge', 'road_cleared']) {
      await expect(page.getByTestId(`report-type-${c}`)).toBeVisible();
    }
    for (const c of ['damaged_infrastructure', 'other']) {
      await expect(page.getByTestId(`report-category-${c}`)).toHaveAttribute('aria-disabled', 'true');
    }
  });

  for (const [category, event, field] of [
    ['water_level', 'water_level', 'field-levelCm'],
    ['flood_report', 'flood_report', 'field-severity'],
    ['road_blockage', 'road_blockage', 'field-blockage'],
    ['submerged_bridge', 'road_blockage', 'cause-fixed'],
  ] as const) {
    test(`category ${category} shows its fields and sends a ${event} event`, async ({ page, sent }) => {
      await openField(page, '#/report');
      await page.getByTestId(`report-type-${category}`).click();
      await expect(page.getByTestId(field)).toBeVisible();
      const id = await submitReport(page, category);
      await expect.poll(() => sent.some((e) => e.clientEventId === id), { timeout: 15_000 }).toBe(true);
      const e = sent.find((x) => x.clientEventId === id)!;
      expect(e.type).toBe(event);
      if (category === 'submerged_bridge') expect(e).toMatchObject({ cause: 'submerged', blockage: 'full' });
    });
  }

  test('invalid report shows form-error and saves nothing', async ({ page }) => {
    await openField(page, '#/report');
    await page.getByTestId('report-type-water_level').click();
    await page.getByTestId('report-submit').click();
    await expect(page.getByTestId('form-error')).toBeVisible();
    await expect(page.getByTestId('report-saved')).toHaveCount(0);
  });
});
