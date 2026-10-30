import { test, expect, changeMock, waitForQueueStatus, submitRoadBlockage, COMMAND_URL } from '../fixtures/index.js';
import type { Page } from '@playwright/test';

const queueItems = (page: Page) => page.getByTestId('queue-item');

async function openQueue(page: Page) {
  await page.getByTestId('nav-queue').click();
}

/** Submit a road_cleared report (used to set up the server-side state the conflict toggle needs). */
async function submitRoadCleared(page: Page, roadId: string) {
  await page.getByTestId('nav-report').click();
  await page.getByTestId('report-type-road_cleared').click();
  await page.getByTestId('field-roadId').selectOption(roadId);
  await page.getByTestId('report-submit').click();
}

async function incidentCount(commandPage: Page, clientEventId?: string) {
  const sel = clientEventId
    ? `[data-testid="incident-item"][data-client-event-id="${clientEventId}"]`
    : '[data-testid="incident-item"]';
  return commandPage.locator(sel).count();
}

test.describe('duplicates', () => {
  test('double-click submit yields exactly one queue item and one incident', async ({ fieldPage, commandPage }) => {
    await fieldPage.getByTestId('nav-report').click();
    await fieldPage.getByTestId('report-type-road_blockage').click();
    await fieldPage.getByTestId('field-roadId').selectOption('R7');
    await fieldPage.getByTestId('field-blockage').selectOption('full');
    await fieldPage.getByTestId('report-submit').dblclick();

    await openQueue(fieldPage);
    const id = await waitForQueueStatus(fieldPage, 0, 'synced');
    await expect(queueItems(fieldPage)).toHaveCount(1);

    await expect(
      commandPage.locator(`[data-testid="incident-item"][data-client-event-id="${id}"]`),
    ).toHaveCount(1, { timeout: 15_000 });
    // allow any stray duplicate to arrive, then re-assert
    await commandPage.waitForTimeout(2_000);
    expect(await incidentCount(commandPage)).toBe(1);
    expect(await incidentCount(commandPage, id)).toBe(1);
  });

  test('retry after a timeout does not create a second event', async ({ fieldPage, commandPage }) => {
    await changeMock(fieldPage, 'timeout:1');
    await submitRoadBlockage(fieldPage, 'R7', 'full');
    await openQueue(fieldPage);

    // Transport failed: item is not synced and nothing reached the server.
    const id = await fieldPage.getByTestId('queue-item').first().getAttribute('data-client-event-id');
    expect(id).toBeTruthy();
    await expect(queueItems(fieldPage).first()).not.toHaveAttribute('data-status', 'synced');
    expect(await incidentCount(commandPage)).toBe(0);

    // Clear the fault; retry (manual if the item is parked as failed, else auto).
    await changeMock(fieldPage, 'off');
    await openQueue(fieldPage);
    const retry = queueItems(fieldPage).first().getByTestId('queue-retry');
    if (await retry.isVisible().catch(() => false)) await retry.click();
    else await fieldPage.getByTestId('sync-now').click().catch(() => undefined);

    await waitForQueueStatus(fieldPage, 0, 'synced', 20_000);
    await expect(queueItems(fieldPage)).toHaveCount(1);
    await expect(queueItems(fieldPage).first()).toHaveAttribute('data-client-event-id', id!);

    await expect(
      commandPage.locator(`[data-testid="incident-item"][data-client-event-id="${id}"]`),
    ).toHaveCount(1, { timeout: 15_000 });
    expect(await incidentCount(commandPage)).toBe(1);
  });
});

test.describe('conflicts', () => {
  test('conflict shows status + panel, and "keep mine" resolves it', async ({ fieldPage }) => {
    await submitRoadCleared(fieldPage, 'R7');
    await openQueue(fieldPage);
    await waitForQueueStatus(fieldPage, 0, 'synced');

    await changeMock(fieldPage, 'conflict');
    await submitRoadBlockage(fieldPage, 'R7', 'full');
    await openQueue(fieldPage);
    const conflicted = fieldPage.locator('[data-testid="queue-item"][data-status="conflict"]');
    await expect(conflicted).toHaveCount(1, { timeout: 20_000 });
    await expect(conflicted.getByTestId('conflict-panel')).toBeVisible();
    await expect(conflicted.getByTestId('conflict-keep-mine')).toBeVisible();
    await expect(conflicted.getByTestId('conflict-accept-server')).toBeVisible();

    // Resolve as "keep mine": it must leave the conflict state (re-queued under a new id / resubmitted).
    await changeMock(fieldPage, 'off');
    await openQueue(fieldPage);
    await fieldPage.locator('[data-testid="queue-item"][data-status="conflict"]').getByTestId('conflict-keep-mine').click();
    await expect(fieldPage.locator('[data-testid="queue-item"][data-status="conflict"]')).toHaveCount(0, { timeout: 20_000 });
  });

  test('conflict "accept server" discards my change', async ({ fieldPage }) => {
    await submitRoadCleared(fieldPage, 'R7');
    await openQueue(fieldPage);
    await waitForQueueStatus(fieldPage, 0, 'synced');

    await changeMock(fieldPage, 'conflict');
    await submitRoadBlockage(fieldPage, 'R7', 'full');
    await openQueue(fieldPage);
    const conflicted = fieldPage.locator('[data-testid="queue-item"][data-status="conflict"]');
    await expect(conflicted).toHaveCount(1, { timeout: 20_000 });
    const conflictId = await conflicted.getAttribute('data-client-event-id');

    await conflicted.getByTestId('conflict-accept-server').click();
    await expect(
      fieldPage.locator(`[data-testid="queue-item"][data-client-event-id="${conflictId}"][data-status="conflict"]`),
    ).toHaveCount(0);
    await expect(fieldPage.locator('[data-testid="queue-item"][data-status="conflict"]')).toHaveCount(0);
  });
});

test.describe('rejections', () => {
  test('rejected shows form-error; edit and resubmit works', async ({ fieldPage }) => {
    await changeMock(fieldPage, 'reject');
    await submitRoadBlockage(fieldPage, 'R7', 'full');
    await openQueue(fieldPage);
    const rejected = fieldPage.locator('[data-testid="queue-item"][data-status="rejected"]');
    await expect(rejected).toHaveCount(1, { timeout: 20_000 });
    const rejectedId = await rejected.getAttribute('data-client-event-id');
    await expect(rejected.getByTestId('queue-edit')).toBeVisible();
    // form-error is visible either in the item or after opening the edit form
    await rejected.getByTestId('queue-edit').click();
    // soft: remaining flow (edit -> resubmit) is still verified even while the form-error finding is open
    await expect.soft(fieldPage.getByTestId('form-error').first(), 'edit form should surface the server rejection as form-error').toBeVisible();

    await changeMock(fieldPage, 'off');
    await fieldPage.getByTestId('nav-report').click();
    await fieldPage.getByTestId('report-submit').click();
    await openQueue(fieldPage);
    await expect(fieldPage.locator('[data-testid="queue-item"][data-status="synced"]')).toHaveCount(1, { timeout: 20_000 });
    // the rejected original is not shown as synced
    await expect(
      fieldPage.locator(`[data-testid="queue-item"][data-client-event-id="${rejectedId}"][data-status="synced"]`),
    ).toHaveCount(0);
  });
});

test.describe('status distinctness', () => {
  test('pending, synced and conflict badges differ in label and class', async ({ fieldPage }) => {
    // synced
    await submitRoadCleared(fieldPage, 'R7');
    await openQueue(fieldPage);
    await waitForQueueStatus(fieldPage, 0, 'synced');
    // pending: slow apply keeps the event in accepted/queued/sending
    await changeMock(fieldPage, 'delay:8000');
    await submitRoadBlockage(fieldPage, 'R3', 'full');
    await openQueue(fieldPage);
    const pending = fieldPage.locator('[data-testid="queue-item"][data-status="accepted"], [data-testid="queue-item"][data-status="queued"], [data-testid="queue-item"][data-status="sending"]').first();
    await expect(pending).toBeVisible({ timeout: 10_000 });
    const pendingSig = await sigOf(pending);
    // conflict: R7 was cleared above, so blocking it again conflicts under the default rule
    await changeMock(fieldPage, 'conflict');
    await submitRoadBlockage(fieldPage, 'R7', 'full');
    await openQueue(fieldPage);
    const conflict = fieldPage.locator('[data-testid="queue-item"][data-status="conflict"]').first();
    await expect(conflict).toBeVisible({ timeout: 20_000 });

    const s = await sigOf(fieldPage.locator('[data-testid="queue-item"][data-status="synced"]').first());
    const c = await sigOf(conflict);
    expect(s.text).not.toBe(c.text);
    expect(s.cls).not.toBe(c.cls);
    expect(pendingSig.text).not.toBe(s.text);
    expect(pendingSig.text).not.toBe(c.text);
    // wave 3 vocabulary, asserted via the shared label test-id
    await expect(fieldPage.locator('[data-testid="queue-item"][data-status="synced"] [data-testid="sync-status-label"]').first()).toHaveText(/Confirmed/);
    await expect(conflict.getByTestId('sync-status-label').first()).toHaveText(/Disputed/);
  });
});

async function sigOf(item: ReturnType<Page['locator']>) {
  const badge = item.locator('[data-status], [role="status"], [class*="badge" i]').first();
  return {
    text: ((await badge.innerText().catch(() => '')) || (await item.innerText())).trim(),
    cls: (await badge.getAttribute('class').catch(() => '')) ?? '',
  };
}
