const CACHE_NAME = 'estbirding-v2-runtime-diagnostics';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/map-placeholder.html',
];

// Never cache the reset page
const DENY_CACHE = ['/reset/', '/reset/index.html'];
const NETWORK_FIRST_PATHS = ['/maps/shared/species-prediction-panel.js', '/maps/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always fetch /reset/ from network
  if (DENY_CACHE.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (NETWORK_FIRST_PATHS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
