import type { VitePWAOptions } from 'vite-plugin-pwa';

/** Never cached by the service worker: live API and the SSE stream must always hit the network. */
export const NEVER_CACHE = [/^\/api\//, /^\/stream(\/|$)/];

export const pwaOptions: Partial<VitePWAOptions> = {
  // 'prompt': a new SW waits until the volunteer taps "Reload" in the update toast (no mid-report reloads)
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['icon.svg', 'apple-touch-icon.png'],
  manifest: {
    id: '/',
    name: 'SETU Field',
    short_name: 'SETU',
    description: 'Offline-first field reporting for flood response volunteers.',
    lang: 'en-IN',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#0b5cad',
    background_color: '#ffffff',
    categories: ['utilities', 'productivity'],
    icons: [
      { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'New report',
        short_name: 'Report',
        description: 'Start a new field report',
        url: '/#/report',
        icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  },
  workbox: {
    // shell + @setu/geo district GeoJSON and hillshade image, so maps work offline
    globPatterns: ['**/*.{js,css,html,svg,png,json,geojson,webp,woff2}'],
    maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
    navigateFallback: 'index.html',
    navigateFallbackDenylist: NEVER_CACHE,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      { urlPattern: ({ url }) => /^\/api\//.test(url.pathname), handler: 'NetworkOnly' },
      { urlPattern: ({ url }) => /^\/stream(\/|$)/.test(url.pathname), handler: 'NetworkOnly' },
    ],
  },
  devOptions: { enabled: false },
};
