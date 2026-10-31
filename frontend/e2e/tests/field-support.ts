import { expect, goOffline, goOnline, openField, test as base } from '../fixtures';
import type { Page, Route } from '@playwright/test';

/** Mobile viewport used by every field spec (360×740). */
export const FIELD_VIEWPORT = { viewport: { width: 360, height: 740 }, hasTouch: true } as const;
export const FAKE_API = 'http://localhost:8099';
export const BATCH = '**/api/v1/events:batch';
export const PROJECTIONS = '**/api/v1/projections**';

export interface SentEvent { clientEventId: string; type: string; [k: string]: unknown }

/** Lead fixtures (fake server reset + external-request guard) plus `sent`: every event POSTed to events:batch, retries included. */
export const test = base.extend<{ sent: SentEvent[] }>({
  sent: async ({ page }, use) => {
    const sent: SentEvent[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/v1/events:batch')) {
        try { sent.push(...((r.postDataJSON() as { events: SentEvent[] }).events)); } catch { /* ignore */ }
      }
    });
    await use(sent);
  },
});
export { expect, goOffline, goOnline, openField };

export const item = (page: Page, id: string) => page.locator(`[data-testid="queue-item"][data-client-event-id="${id}"]`);

async function fillLocation(page: Page, lat = '26.9512', lng = '94.1701') {
  await page.getByTestId('field-lat').fill(lat);
  await page.getByTestId('field-lng').fill(lng);
}

/** Open the report form, pick a category and fill the minimum fields. Does not submit. */
export async function fillReport(page: Page, category: 'water_level' | 'flood_report' | 'road_blockage' | 'submerged_bridge', opts: { road?: string; levelCm?: string; severity?: string; skipPick?: boolean } = {}): Promise<void> {
  // skipPick: the form is already open with the type chosen (the wizard is on its Details step).
  if (!opts.skipPick) {
    await page.getByTestId('nav-report').click();
    await page.getByTestId(`report-type-${category}`).click();
    await expect(page.getByTestId(`report-type-${category}`)).toHaveAttribute('aria-checked', 'true');
  }
  if (category === 'water_level') await page.getByTestId('field-levelCm').fill(opts.levelCm ?? '120');
  if (category === 'flood_report') await page.getByTestId('field-severity').fill(opts.severity ?? '3');
  if (category === 'road_blockage') await page.getByTestId('field-roadId').selectOption(opts.road ?? 'R1');
  if (category === 'submerged_bridge') await page.getByTestId('field-roadId').selectOption(opts.road ?? 'B1');
  // Wizard: details -> location -> notes (the last step shows the Save button).
  await page.getByTestId('wizard-next').click();
  await fillLocation(page);
  await page.getByTestId('wizard-next').click();
}

/** Fill + submit; returns the clientEventId of the saved report. */
export async function submitReport(page: Page, category: Parameters<typeof fillReport>[1], opts: Parameters<typeof fillReport>[2] = {}): Promise<string> {
  await fillReport(page, category, opts);
  await page.getByTestId('report-submit').click();
  await expect(page.getByTestId('report-saved-label')).toHaveText(/Saved locally/);
  return (await page.getByTestId('report-saved').getAttribute('data-client-event-id')) ?? '';
}

export async function openSync(page: Page): Promise<void> {
  await page.getByTestId('nav-sync').click();
  await expect(page.getByTestId('queue-list')).toBeVisible();
}

/** Fulfil events:batch with an ack of the given kind for every posted event. */
export function ackRoute(result: 'conflict' | 'rejected', extra: Record<string, unknown> = {}) {
  return async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const events = (route.request().postDataJSON() as { events: SentEvent[] }).events;
    const acks = events.map((e) => result === 'conflict'
      ? { clientEventId: e.clientEventId, result, eventId: `evt_x_${e.clientEventId.slice(0, 6)}`, reason: 'Road already marked open by a later report', ...extra }
      : { clientEventId: e.clientEventId, result, errors: [{ path: 'roadId', message: 'Unknown road' }], ...extra });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ acks }) });
  };
}


const fc = (version: number, features: unknown[]) => ({ type: 'FeatureCollection', version, generatedAt: new Date().toISOString(), features });
const point = (lng: number, lat: number) => ({ type: 'Point', coordinates: [lng, lat] });

/** A tiny snapshot (one camp, one village) injected through `page.route` on /projections; the fake server's own snapshot is empty. */
export function snapshotWithCamp(version = 1) {
  return {
    version,
    generatedAt: new Date().toISOString(),
    flood: fc(version, []),
    roads: fc(version, []),
    settlements: fc(version, [{ type: 'Feature', geometry: point(94.17, 26.95), properties: { settlementId: 'S-TEST-1', name: 'Testpur', population: 100, accessibility: 'accessible', households: 20, needs: [] } }]),
    routes: fc(version, []),
    shelters: fc(version, [{ type: 'Feature', geometry: point(94.18, 26.96), properties: { shelterId: 'CAMP-1', name: 'Test Relief Camp', capacity: 0, occupancy: 0, open: true } }]),
  };
}

export async function mockProjections(page: Page, snapshot = snapshotWithCamp()): Promise<void> {
  await page.route(PROJECTIONS, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(snapshot) });
  });
}

export async function registerHousehold(page: Page, name: string, opts: { members?: string; settlement?: string; shelter?: string } = {}): Promise<string> {
  await page.getByTestId('household-headName').fill(name);
  await page.getByTestId('household-members').fill(opts.members ?? '4');
  if (opts.settlement) await page.getByTestId('household-settlementId').selectOption(opts.settlement);
  if (opts.shelter) await page.getByTestId('household-shelterId').selectOption(opts.shelter);
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('household-vulnerable-elderly').check();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('field-lat').fill('26.95');
  await page.getByTestId('field-lng').fill('94.17');
  await page.getByTestId('household-submit').click();
  await expect(page.getByTestId('households-saved').or(page.getByTestId('camp-household-row').first())).toBeVisible();
  return '';
}
