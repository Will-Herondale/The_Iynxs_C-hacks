import { FIELD_VIEWPORT, expect, goOffline, goOnline, mockProjections, openField, registerHousehold, test } from './field-support';

test.use(FIELD_VIEWPORT);

test.describe('field households and camp', () => {
  test('offline register → search → reconnect → synced', async ({ page, sent }) => {
    await mockProjections(page);
    await openField(page, '#/home');
    await page.waitForTimeout(500); // let the projection cache fill
    await goOffline(page);
    await page.getByTestId('nav-households').click();
    await page.getByTestId('households-register').click();
    await registerHousehold(page, 'Rupam Das', { settlement: 'S-TEST-1' });
    await expect(page.getByTestId('households-saved')).toContainText('Saved locally');
    await page.getByTestId('households-cancel').click();

    const row = page.getByTestId('household-row').filter({ hasText: 'Rupam Das' });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-status', 'queued');
    await expect(row.getByTestId('sync-status-label')).toHaveText(/Saved locally/);

    await page.getByTestId('households-search').fill('rupam');
    await expect(page.getByTestId('household-row')).toHaveCount(1);
    await page.getByTestId('households-search').fill('zzz-nobody');
    await expect(page.getByTestId('households-no-match')).toBeVisible();
    await page.getByTestId('households-search').fill('');

    await page.reload();
    await expect(page.getByTestId('household-row').filter({ hasText: 'Rupam Das' })).toHaveCount(1);

    await goOnline(page);
    await expect(page.getByTestId('household-row').filter({ hasText: 'Rupam Das' })).toHaveAttribute('data-status', 'synced', { timeout: 20_000 });
    expect(sent.filter((e) => e.type === 'household_registration')).toHaveLength(1);
  });

  test('household form validates required fields', async ({ page }) => {
    await openField(page, '#/households/new');
    await page.getByTestId('household-submit').click();
    await expect(page.getByTestId('form-error')).toBeVisible();
    await expect(page.getByTestId('household-row')).toHaveCount(0);
  });

  test('member names and duplicate review are shown as blocked, not invented', async ({ page }) => {
    await openField(page, '#/households');
    await expect(page.getByTestId('household-member-names-blocked-summary')).toBeVisible();
    await expect(page.getByTestId('household-duplicates-blocked')).toBeVisible();
  });

  test('camp summary counts households and people and tracks pending', async ({ page }) => {
    await mockProjections(page);
    await openField(page, '#/camp');
    await page.getByTestId('camp-select').selectOption('CAMP-1');
    await expect(page.getByTestId('camp-info')).toHaveAttribute('data-shelter-id', 'CAMP-1');
    await expect(page.getByTestId('camp-capacity')).toContainText('not published');
    await expect(page.getByTestId('camp-summary-households')).toHaveText('0');

    await goOffline(page);
    await page.getByTestId('camp-household-form').waitFor();
    await registerHousehold(page, 'Mina Gogoi', { members: '3' });
    await registerHousehold(page, 'Bhaskar Pegu', { members: '5' });
    await expect(page.getByTestId('camp-household-row')).toHaveCount(2);
    await expect(page.getByTestId('camp-summary-households')).toHaveText('2');
    await expect(page.getByTestId('camp-summary-people')).toHaveText('8');
    await expect(page.getByTestId('camp-summary-pending')).toHaveText('2');

    await goOnline(page);
    await expect(page.getByTestId('camp-summary-pending')).toHaveText('0', { timeout: 20_000 });
    await expect(page.getByTestId('camp-household-row').first()).toHaveAttribute('data-status', 'synced');
  });

  test('camp selection is remembered on the device', async ({ page }) => {
    await mockProjections(page);
    await openField(page, '#/camp');
    await page.getByTestId('camp-select').selectOption('CAMP-1');
    await page.reload();
    await expect(page.getByTestId('camp-select')).toHaveValue('CAMP-1');
  });
});
