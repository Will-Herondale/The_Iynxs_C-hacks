import { fileURLToPath } from 'node:url';
import { test, expect, goOffline, goOnline } from '../fixtures/index.js';

const SHOTS = fileURLToPath(new URL('../../docs/demo/', import.meta.url));
const shot = (name: string) => ({ path: `${SHOTS}${name}`, fullPage: true });

test.describe('demo: bridge B1 submerged, reported offline', () => {
  test('field report syncs and the command centre shows B1 blocked, S4 cut off and why', async ({ fieldPage: field, commandPage: command }) => {
    // 1. Field loaded online once, then goes offline.
    await expect(field.getByTestId('online-indicator')).toHaveAttribute('data-online', 'true');
    await goOffline(field);
    await expect(field.getByTestId('online-indicator')).toHaveAttribute('data-online', 'false');
    await expect(field.getByTestId('offline-banner')).toBeVisible();

    // 2. Report B1 full, cause submerged.
    await field.getByTestId('nav-report').click();
    await field.getByTestId('report-type-road_blockage').click();
    await field.getByTestId('field-roadId').selectOption('B1');
    await field.getByTestId('field-blockage').selectOption('full');
    await field.getByTestId('field-cause').selectOption('submerged');
    await field.getByTestId('report-submit').click();

    // 3. Saved on device, offline banner visible.
    await field.getByTestId('nav-queue').click();
    const item = field.getByTestId('queue-item').first();
    await expect(item).toHaveAttribute('data-status', 'queued');
    await expect(item.getByTestId('sync-status-label')).toHaveText('Saved on device');
    await expect(field.getByTestId('offline-banner')).toBeVisible();
    const clientEventId = (await item.getAttribute('data-client-event-id')) ?? '';
    expect(clientEventId).not.toBe('');
    await field.screenshot(shot('01-field-offline-saved.png'));

    // 4. Back online: reaches Confirmed.
    await goOnline(field);
    await expect(item).toHaveAttribute('data-status', 'synced', { timeout: 30_000 });
    await expect(item.getByTestId('sync-status-label')).toHaveText('Confirmed');
    await expect(field.getByTestId('offline-banner')).toHaveCount(0);
    await field.screenshot(shot('02-field-confirmed.png'));

    // 5. Command centre.
    await expect(command.getByTestId('road-row-B1')).toHaveAttribute('data-kind', 'bridge', { timeout: 30_000 });
    await expect(command.getByTestId('road-row-B1')).toHaveAttribute('data-passability', 'impassable', { timeout: 30_000 });
    await expect(command.getByTestId('road-row-B1')).toHaveAttribute('data-status', 'blocked');
    await expect(command.getByTestId('settlement-row-S4')).toHaveAttribute('data-accessibility', 'cut_off');
    await expect(command.getByTestId('explain-cutoff-S4').first()).toContainText(/B1|Bharalu/);
    await expect(command.getByTestId('route-row-EVAC-3')).toHaveAttribute('data-status', 'unavailable');
    await expect(command.getByTestId('explain-refusal-EVAC-3').first()).toBeVisible();
    await expect(command.getByTestId('deadline-S4')).toHaveAttribute('data-deadline', /.+/);
    await expect(command.getByTestId('situation-summary')).toContainText(/Bharalu|B1/);

    await command.getByTestId('road-row-B1').click();
    await expect(command.getByTestId('feature-panel')).toHaveAttribute('data-feature-id', 'B1');
    const prov = command.getByTestId('provenance-B1');
    await expect(prov).toBeVisible();
    await expect(prov.locator(`[data-client-event-id="${clientEventId}"]`)).toHaveCount(1);
    await command.screenshot(shot('03-command-bridge-cutoff.png'));

    // Audit carries the same clientEventId.
    await command.getByTestId('nav-audit').click();
    const row = command.locator(`[data-testid="audit-row"][data-client-event-id="${clientEventId}"]`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-status', 'synced');
    await command.screenshot(shot('04-command-audit.png'));
  });
});
