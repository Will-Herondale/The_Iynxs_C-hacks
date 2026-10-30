// SETU Service Worker - Offline-First Caching
// Caches application shell and geo data for offline operation

const CACHE_NAME = 'setu-v1';
const OFFLINE_CACHE = 'setu-offline-v1';

// Application shell resources to cache
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline/majuli_hand_bundle.json',
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== OFFLINE_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(OFFLINE_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline: return cached response
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // Return offline indicator
            return new Response(
              JSON.stringify({ error: 'offline', message: 'No cached data available' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Static resources: cache first, network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Message handler for sync requests
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC') {
    // Notify all clients to sync
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SYNC_REQUESTED' });
      });
    });
  }
});

// Periodic sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'setu-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'PERIODIC_SYNC' });
        });
      })
    );
  }
});
