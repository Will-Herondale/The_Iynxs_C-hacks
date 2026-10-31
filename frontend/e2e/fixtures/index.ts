import { test as base, expect, type BrowserContext, type Page, type Route, type Request } from '@playwright/test';
import { startFakeServer, type FakeServer, type FakeServerOptions } from '@setu/api-client/testing';

export const FIELD_URL = 'http://localhost:5173';
export const COMMAND_URL = 'http://localhost:5174';
export const API_URL = 'http://localhost:8099';
export const BATCH_GLOB = '**/api/v1/events:batch';
export const PROJECTIONS_GLOB = '**/api/v1/projections**';
export const FIELD_VIEWPORT = { width: 360, height: 740 };
export const COMMAND_VIEWPORTS = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }];

const isLocal = (url: string) => {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) && !/^wss?:$/.test(u.protocol)) return true;
  return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
};

type Fixtures = {
  /** Fails the test at the end if any page in the context requested a non-localhost URL. */
  noExternalRequests: string[];
  /** The page, with `noExternalRequests` active. */
  page: Page;
};
type WorkerFixtures = { fakeServer: FakeServer };

export const test = base.extend<Fixtures, WorkerFixtures>({
  // In-process fake contract server on :8099 (same one the apps were built/started against).
  fakeServer: [
    async ({}, use) => {
      // startFakeServer emits an uncatchable 'error' on a busy port, so probe first.
      const busy = await fetch(`${API_URL}/api/v1/health`).then(() => true, () => false);
      let server: FakeServer | undefined;
      if (busy) console.warn('[e2e] :8099 already in use; using the external fake server (state is NOT reset between tests)');
      else server = await startFakeServer({ port: 8099 });
      await use(server ?? ({ reset() {}, options: {} } as unknown as FakeServer));
      await server?.close();
    },
    { scope: 'worker', auto: true },
  ],
  // Reset server state + tuning before every test.
  noExternalRequests: [
    async ({ context, fakeServer }, use) => {
      fakeServer.reset();
      Object.assign(fakeServer.options, { latencyMs: 0, applyDelayMs: 0, fail5xx: 0, conflict: undefined, reject: undefined } satisfies FakeServerOptions);
      const external: string[] = [];
      context.on('request', (r) => { if (!isLocal(r.url())) external.push(r.url()); });
      await use(external);
      expect(external, 'non-localhost requests').toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page }, use) => {
    await use(page);
  },
});

export { expect };

export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

/** Open the field app on a hash route (e.g. 'home', 'report', 'sync') at phone size. */
export async function openField(page: Page, hash = 'home', base = FIELD_URL): Promise<void> {
  await page.setViewportSize(FIELD_VIEWPORT);
  await page.goto(`${base}/#/${hash}`);
  await expect(page.getByTestId('connectivity-status').first()).toBeVisible();
}

export async function openCommand(page: Page, viewport = { width: 1366, height: 768 }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(COMMAND_URL);
  await expect(page.getByTestId('connection-status')).toBeVisible();
}

/**
 * Submit a road/bridge report from the field app. Category = water_level | flood_report | road_blockage | submerged_bridge | road_cleared.
 * Fills the first real option of field-roadId when `roadId` is omitted (the fake server starts empty, apps list bundled Majuli roads).
 * Returns the clientEventId from the confirmation.
 */
export async function submitReport(page: Page, category = 'road_blockage', opts: { roadId?: string; levelCm?: string } = {}): Promise<string> {
  await page.getByTestId('nav-report').click();
  await page.getByTestId(`report-type-${category}`).click();
  if (category === 'water_level') {
    await page.getByTestId('field-levelCm').fill(opts.levelCm ?? '120');
  } else {
    const sel = page.getByTestId('field-roadId');
    if (opts.roadId) await sel.selectOption(opts.roadId);
    else await sel.selectOption({ index: 1 });
  }
  await page.getByTestId('wizard-next').click(); // Details -> Location
  if (await page.getByTestId('field-lat').inputValue() === '') {
    await page.getByTestId('field-lat').fill('26.9512');
    await page.getByTestId('field-lng').fill('94.1701');
  }
  await page.getByTestId('wizard-next').click(); // Location -> Notes (Save appears on the last step)
  await page.getByTestId('report-submit').click();
  const saved = page.getByTestId('report-saved');
  await expect(saved).toBeVisible();
  return (await saved.getAttribute('data-client-event-id')) ?? '';
}

/** Wait for a queue item on the Sync screen to reach a data-status. */
export async function expectQueueStatus(page: Page, clientEventId: string, status: string, timeout = 15_000): Promise<void> {
  await expect(page.locator(`[data-testid="queue-item"][data-client-event-id="${clientEventId}"]`)).toHaveAttribute('data-status', status, { timeout });
}

// ---- route-injection helpers (no server changes) ----

export interface BatchBody { events?: Array<{ clientEventId: string; [k: string]: unknown }> }
export const batchBody = (req: Request): BatchBody => { try { return req.postDataJSON() as BatchBody; } catch { return {}; } };

/** Record every events:batch request (does not alter traffic). Returns the live array. */
export async function recordBatches(page: Page): Promise<Request[]> {
  const seen: Request[] = [];
  await page.route(BATCH_GLOB, (route) => { seen.push(route.request()); return route.fallback(); });
  return seen;
}

/** Fail the next `times` batch POSTs with `status` (default 503), then let traffic through. Use times=Infinity for "always". */
export async function failBatch(page: Page, times = 1, status = 503): Promise<void> {
  let n = 0;
  await page.route(BATCH_GLOB, (route) => (route.request().method() === 'POST' && n++ < times ? route.fulfill({ status, contentType: 'application/json', body: '{"error":"injected"}' }) : route.fallback()));
}

/** Abort (network error / timeout-like) the next `times` batch POSTs. */
export async function abortBatch(page: Page, times = 1): Promise<void> {
  let n = 0;
  await page.route(BATCH_GLOB, (route) => (route.request().method() === 'POST' && n++ < times ? route.abort('timedout') : route.fallback()));
}

/** Answer batch POSTs with a per-event ack of `kind` (conflict | rejected) instead of reaching the server. */
export async function ackBatch(page: Page, kind: 'conflict' | 'rejected', detail = 'e2e injected'): Promise<void> {
  await page.route(BATCH_GLOB, (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const events = batchBody(route.request()).events ?? [];
    const acks = events.map((e) =>
      kind === 'conflict'
        ? { clientEventId: e.clientEventId, result: 'conflict', reason: detail }
        : { clientEventId: e.clientEventId, result: 'rejected', errors: [{ path: 'payload', message: detail }] },
    );
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ acks }) });
  });
}

/** Make the Command app see the backend as down (health + projections abort). */
export async function backendDown(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'));
}

export type { BrowserContext };
