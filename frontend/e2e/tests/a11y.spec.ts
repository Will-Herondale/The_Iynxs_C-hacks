import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// axe on key screens of both apps: serious/critical fail, moderate/minor are listed in the report.
const FIELD = process.env.FIELD_URL ?? 'http://localhost:5173';
const COMMAND = process.env.COMMAND_URL ?? 'http://localhost:5174';

const fieldScreens = ['home', 'report', 'map', 'households', 'sync', 'camp'];
const commandSections = ['overview', 'map', 'settlements', 'routes', 'events', 'audit'];

async function scan(page: Page, name: string) {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && !['localhost', '127.0.0.1'].includes(u.hostname)) external.push(r.url());
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const brief = (v: (typeof violations)[number]) => `${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`;
  const minor = violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
  if (minor.length) test.info().annotations.push({ type: 'a11y-moderate', description: `${name}: ${minor.map(brief).join('; ')}` });
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking.map(brief), `${name} serious/critical axe violations`).toEqual([]);
  expect(external).toEqual([]);
}

test.describe('a11y: Field (360×740)', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  for (const s of fieldScreens) {
    test(`field #/${s}`, async ({ page }) => {
      await page.goto(`${FIELD}/#/${s}`);
      await expect(page.locator('main, [data-testid$="-screen"]').first()).toBeVisible();
      await scan(page, `field/${s}`);
    });
  }
});

test.describe('a11y: Command (1366×768)', () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  test.beforeEach(async ({ page }) => { await page.goto(COMMAND); await expect(page.getByTestId('nav-overview')).toBeVisible(); });
  for (const s of commandSections) {
    test(`command ${s}`, async ({ page }) => {
      await page.getByTestId(`nav-${s}`).click();
      await expect(page.getByTestId(`nav-${s}`)).toHaveAttribute('aria-current', 'page');
      await scan(page, `command/${s}`);
    });
  }
});
