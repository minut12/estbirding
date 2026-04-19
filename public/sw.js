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

// === Push Notification Handler ===
self.addEventListener('push', function(event) {
  let data = { species: 'Tundmatu liik' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    try {
      data = { species: event.data.text() };
    } catch (e2) {}
  }

  const species = data.species || 'Tundmatu liik';
  const title = 'EstBirding';
  const options = {
    body: species + ' on märgatud!',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: 'estbirding-' + species.replace(/[^a-zA-ZäöüõÄÖÜÕ0-9]/g, '-'),
    data: { url: '/', species: species },
    vibrate: [200, 100, 200],
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(function() {
      return self.clients.matchAll({ type: 'window' });
    }).then(function(allClients) {
      allClients.forEach(function(client) {
        try {
          client.postMessage({ type: 'PUSH_RECEIVED', species: species });
        } catch (e) {}
      });
    }).catch(function() {})
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var urlToOpen = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});

// Chrome periodically rotates push subscriptions. Without this handler the
// rotation is silent and the old endpoint in push_subscriptions is orphaned.
self.addEventListener('pushsubscriptionchange', function(event) {
  event.waitUntil((async () => {
    try {
      var oldSub = event.oldSubscription;
      var appServerKey =
        (event.newSubscription && event.newSubscription.options && event.newSubscription.options.applicationServerKey) ||
        (oldSub && oldSub.options && oldSub.options.applicationServerKey) ||
        null;

      var newSub = event.newSubscription;
      if (!newSub) {
        newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      }

      var clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      var payload = {
        type: 'PUSH_SUBSCRIPTION_ROTATED',
        oldEndpoint: oldSub ? oldSub.endpoint : null,
        newSubscription: newSub ? newSub.toJSON() : null,
        at: new Date().toISOString(),
      };
      clientList.forEach(function(c) { try { c.postMessage(payload); } catch (e) {} });
    } catch (e) {
      // Silent — startup reconciliation is the safety net.
    }
  })());
});
