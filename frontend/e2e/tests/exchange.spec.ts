import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, resetMockState, submitRoadBlockage, FIELD_URL } from '../fixtures/index.js';

const NOTE = 'Imported events are saved on this device and will appear in district projections after sync.';

test.describe('device-to-device exchange (JSONL)', () => {
  test('export on A, import on B, duplicate re-import, invalid line', async ({ browser }) => {
    await resetMockState();
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    for (const p of [a, b]) await p.goto(`${FIELD_URL}/?mock=offline`);

    // A: create a report offline and export it.
    await submitRoadBlockage(a, 'R7', 'full');
    await a.goto(`${FIELD_URL}/?mock=offline#/sync`);
    await a.getByTestId('nav-exchange').click();
    const [download] = await Promise.all([a.waitForEvent('download'), a.getByTestId('exchange-export').click()]);
    expect(download.suggestedFilename()).toMatch(/^setu-events-.+\.jsonl$/);
    const dir = mkdtempSync(join(tmpdir(), 'setu-exchange-'));
    const file = join(dir, 'events.jsonl');
    await download.saveAs(file);
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const ids = lines.map((l) => (JSON.parse(l) as { clientEventId: string }).clientEventId);

    // B: import, preview, confirm.
    await b.goto(`${FIELD_URL}/?mock=offline#/sync/exchange`);
    await b.getByTestId('exchange-import-file').setInputFiles(file);
    const rows = b.getByTestId('exchange-result-row');
    await expect(rows).toHaveCount(lines.length);
    await expect(rows.first()).toHaveAttribute('data-result', 'accepted');
    await b.getByTestId('exchange-import-confirm').click();
    await expect(b.getByTestId('exchange-note')).toHaveText(NOTE);

    // B: re-import the same file -> all duplicate.
    await b.getByTestId('exchange-import-file').setInputFiles(file);
    await expect(rows.first()).toHaveAttribute('data-result', 'duplicate');
    for (const id of ids) await expect(b.getByText(id).first()).toBeVisible();

    // Invalid line is rejected without blocking valid ones.
    const bad = join(dir, 'bad.jsonl');
    writeFileSync(bad, `${lines[0]}\n{not json}\n`);
    await b.getByTestId('exchange-import-file').setInputFiles(bad);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toHaveAttribute('data-result', 'rejected');
    await expect(b.getByTestId('exchange-note')).toContainText('district projections after sync');
  });
});
