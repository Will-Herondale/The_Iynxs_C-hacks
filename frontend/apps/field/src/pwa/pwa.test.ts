import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NEVER_CACHE, pwaOptions } from '../../pwa.config.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = pwaOptions.manifest as Record<string, unknown> & {
  icons: { src: string; sizes: string; purpose?: string }[];
  shortcuts: { name: string; url: string }[];
};

describe('manifest', () => {
  it('is complete and installable', () => {
    for (const k of ['id', 'name', 'short_name', 'description', 'lang', 'scope', 'start_url', 'theme_color', 'background_color']) {
      expect(manifest[k], k).toBeTruthy();
    }
    expect(manifest.display).toBe('standalone');
    const sizes = manifest.icons.map((i) => `${i.sizes}/${i.purpose}`);
    expect(sizes).toContain('192x192/any');
    expect(sizes).toContain('512x512/any');
    expect(sizes).toContain('512x512/maskable');
    for (const i of manifest.icons) expect(existsSync(path.join(root, 'public', i.src)), i.src).toBe(true);
  });
  it('has a New report shortcut', () => {
    expect(manifest.shortcuts.find((s) => s.name === 'New report')?.url).toBe('/#/report');
  });
  it('uses prompt-based updates', () => {
    expect(pwaOptions.registerType).toBe('prompt');
  });
});

describe('caching rules', () => {
  it('never caches /api or /stream', () => {
    for (const p of ['/api/v1/events', '/stream']) expect(NEVER_CACHE.some((r) => r.test(p)), p).toBe(true);
    expect(NEVER_CACHE.some((r) => r.test('/index.html'))).toBe(false);
    const w = pwaOptions.workbox!;
    expect(w.navigateFallbackDenylist).toBe(NEVER_CACHE);
    expect(w.navigateFallback).toBe('index.html');
  });
});

// Needs a prior `vite build`; the Playwright acceptance script covers the same ground end-to-end.
const sw = path.join(root, 'dist', 'sw.js');
describe.skipIf(!existsSync(sw))('built precache list', () => {
  it('contains the shell and geo data', () => {
    const src = readFileSync(sw, 'utf8');
    expect(src).toContain('index.html');
    expect(src).toMatch(/assets\/index-[^"']+\.js/);
    expect(readdirSync(path.join(root, 'dist', 'assets')).some((f) => /geo|hillshade|\.geojson|\.webp/.test(f))).toBe(true);
    expect(src).toMatch(/geo|hillshade|\.geojson|\.webp/);
    expect(src).not.toMatch(/"\/?api\//);
  });
});
