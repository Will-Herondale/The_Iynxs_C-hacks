import { test, expect } from '../fixtures/index.js';

test('field and command load', async ({ fieldPage, commandPage }) => {
  await expect(fieldPage.getByTestId('online-indicator')).toBeVisible();
  await expect(commandPage.getByTestId('map')).toBeVisible();
});
