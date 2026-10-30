import { test, expect, goOffline, goOnline, submitRoadBlockage } from '../fixtures/index.js';

test.describe('wave 3', () => {
  test('camp mode: offline registration reaches Confirmed and camp-info shows SH1', async ({ fieldPage: page }) => {
    await page.getByTestId('nav-camp').click();
    await page.getByTestId('camp-select').selectOption('SH1');
    await expect(page.getByTestId('camp-info')).toHaveAttribute('data-shelter-id', 'SH1');

    await goOffline(page);
    const form = page.getByTestId('camp-household-form');
    await expect(form).toBeVisible();
    await page.getByTestId('household-headName').fill('Test Family');
    await page.getByTestId('household-members').fill('4');
    await page.getByTestId('household-settlementId').selectOption({ index: 1 });
    await page.getByTestId('household-submit').click();

    const row = page.getByTestId('camp-household-row').first();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-status', 'queued');
    await expect(row.getByTestId('sync-status-label')).toHaveText('Saved locally');

    await goOnline(page);
    await expect(row).toHaveAttribute('data-status', 'synced', { timeout: 30_000 });
    await expect(row.getByTestId('sync-status-label')).toHaveText('Accepted');
  });

  test('report form has the cause select and a bridge option', async ({ fieldPage: page }) => {
    await page.getByTestId('nav-report').click();
    await page.getByTestId('report-type-road_blockage').click();
    await expect(page.getByTestId('field-cause')).toBeVisible();
    await expect(page.getByTestId('field-roadId').locator('option[value="B1"]')).toHaveCount(1);
    await expect(page.getByTestId('field-roadId').locator('option[value="B1"]')).toContainText(/Bridge/);
  });

  test('command: map legend, audit filters, and road_cleared on B1 reverts S4', async ({ fieldPage: field, commandPage: command }) => {
    await expect(command.getByTestId('map-legend')).toBeVisible();
    await expect(command.getByTestId('settlement-row-S4')).toHaveAttribute('data-accessibility', 'accessible', { timeout: 15_000 });

    // Block B1, then another road, so the audit has differing types/statuses.
    await field.getByTestId('nav-report').click();
    await field.getByTestId('report-type-road_blockage').click();
    await field.getByTestId('field-roadId').selectOption('B1');
    await field.getByTestId('field-blockage').selectOption('full');
    await field.getByTestId('field-cause').selectOption('submerged');
    await field.getByTestId('report-submit').click();
    await expect(command.getByTestId('settlement-row-S4')).toHaveAttribute('data-accessibility', 'cut_off', { timeout: 30_000 });

    await submitRoadBlockage(field, 'R7', 'full');
    await command.getByTestId('nav-audit').click();
    await expect(command.getByTestId('audit-row')).toHaveCount(2, { timeout: 30_000 });

    await command.getByTestId('audit-filter-type').selectOption('road_blockage');
    await expect(command.getByTestId('audit-row')).toHaveCount(2);
    await command.getByTestId('audit-filter-type').selectOption('water_level');
    await expect(command.getByTestId('audit-row')).toHaveCount(0);
    await command.getByTestId('audit-filter-type').selectOption('');
    await command.getByTestId('audit-filter-status').selectOption('synced');
    await expect(command.getByTestId('audit-row')).toHaveCount(2, { timeout: 20_000 });
    await command.getByTestId('audit-filter-status').selectOption('rejected');
    await expect(command.getByTestId('audit-row')).toHaveCount(0);
    await command.getByTestId('audit-filter-status').selectOption('');

    // road_cleared on B1 reverts S4.
    await field.getByTestId('nav-report').click();
    await field.getByTestId('report-type-road_cleared').click();
    await field.getByTestId('field-roadId').selectOption('B1');
    await field.getByTestId('report-submit').click();
    await command.getByTestId('nav-map').click();
    await expect(command.getByTestId('settlement-row-S4')).toHaveAttribute('data-accessibility', 'accessible', { timeout: 30_000 });
    await expect(command.getByTestId('road-row-B1')).not.toHaveAttribute('data-status', 'blocked');
  });
});
