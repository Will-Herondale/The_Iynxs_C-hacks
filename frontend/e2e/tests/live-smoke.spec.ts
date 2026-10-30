import { expect, test } from '@playwright/test';
import { EventRecordSchema, ProjectionSnapshotSchema } from '@setu/contract';

// Read-only smoke against a real backend. Only runs when LIVE_API_URL is set; never writes.
const LIVE = process.env.LIVE_API_URL?.replace(/\/$/, '');
test.skip(!LIVE, 'LIVE_API_URL not set');

test.describe('live backend (read-only)', () => {
  test('GET /api/v1/projections matches the contract', async ({ request }) => {
    const res = await request.get(`${LIVE}/api/v1/projections`);
    expect(res.status()).toBe(200);
    const parsed = ProjectionSnapshotSchema.safeParse(await res.json());
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
  });

  test('GET /api/v1/events matches the contract', async ({ request }) => {
    const res = await request.get(`${LIVE}/api/v1/events`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const list = Array.isArray(body) ? body : body.events;
    expect(Array.isArray(list)).toBe(true);
    for (const e of list) {
      const parsed = EventRecordSchema.safeParse(e);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
    }
  });
});
