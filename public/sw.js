// Cache name is derived from the SW's own URL: src/main.tsx registers
// /sw.js?v=<build marker>, so every build gets its own cache and `activate`
// evicts the previous one.
const SW_VERSION = (() => { try { return new URL(self.location.href).searchParams.get('v') || 'dev'; } catch (e) { return 'dev'; } })();
const CACHE_NAME = 'estbirding-' + SW_VERSION;

// P35: main.tsx also passes the Supabase URL (`su`) and publishable key (`sk`) so
// syncSubscriptionToSupabase() below can write a rotated subscription with no
// window open. searchParams is order-independent, so CACHE_NAME is unaffected.
const SW_PARAMS = (() => { try { return new URL(self.location.href).searchParams; } catch (e) { return null; } })();
const SB_URL = ((SW_PARAMS && SW_PARAMS.get('su')) || '').replace(/\/+$/, '');
const SB_KEY = (SW_PARAMS && SW_PARAMS.get('sk')) || '';
const PRECACHE_URLS = [
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

  // Navigations (index.html) are network-first so a deploy never leaves a
  // returning browser with an index.html that points at vanished asset hashes.
  // Cache fallback for offline; never cache a non-200.
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    // P21: only the top-level shell is cached under '/'. Iframe loads (/maps/**) are navigation
    // requests too and used to overwrite the shell entry with the map HTML.
    const isShell = url.pathname === '/' || url.pathname === '/index.html'
      || (event.request.destination === 'document' && !url.pathname.startsWith('/maps/'));
    event.respondWith(
      fetch(event.request).then((response) => {
        if (isShell && response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => {});
        }
        return response;
      }).catch(() => (isShell ? caches.match('/') : caches.match(event.request)))
    );
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
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    try {
      payload = { species: event.data.text() };
    } catch (e2) {}
  }

  const species = payload.species || '';
  const title = payload.title || 'EstBirds';
  const body = payload.body || ((species || 'Tundmatu liik') + ' on märgatud!');
  const url = payload.url || '/';
  const tag = payload.tag || ('estbirding-' + String(species).replace(/[^a-zA-ZäöüõÄÖÜÕ0-9]/g, '-'));

  const options = {
    body: body,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: tag,
    data: { url: url, species: species },
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

// Same iOS/Android/Desktop convention the linnuliigid iframe writes.
function swDeviceLabel() {
  var ua = (self.navigator && self.navigator.userAgent) || '';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  return 'Desktop';
}

// P35: write the rotated subscription to push_subscriptions from the SW itself.
// postMessage alone loses the rotation whenever the app is closed, which is how
// the last live subscription was orphaned. Carries the species list across from
// the old row, then removes it. Never throws — the app-shell reconcile is the
// next safety net.
async function syncSubscriptionToSupabase(subJson, oldEndpoint) {
  try {
    if (!SB_URL || !SB_KEY || !subJson || !subJson.endpoint) return;

    var headers = {
      'Content-Type': 'application/json',
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
    };
    var table = SB_URL + '/rest/v1/push_subscriptions';
    var species = [];

    if (oldEndpoint) {
      var oldFilter = '?endpoint=eq.' + encodeURIComponent(oldEndpoint);
      try {
        var prev = await fetch(table + oldFilter + '&select=subscribed_species,device_label', { headers: headers });
        var rows = prev.ok ? await prev.json() : [];
        if (Array.isArray(rows) && rows.length && Array.isArray(rows[0].subscribed_species)) {
          species = rows[0].subscribed_species;
        }
      } catch (e) {}
      try {
        await fetch(table + oldFilter, { method: 'DELETE', headers: headers });
      } catch (e) {}
    }

    await fetch(table + '?on_conflict=endpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        key_p256dh: subJson.keys ? subJson.keys.p256dh : null,
        key_auth: subJson.keys ? subJson.keys.auth : null,
        subscribed_species: species,
        device_label: swDeviceLabel(),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    // Silent by design — see above.
  }
}

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

      await syncSubscriptionToSupabase(
        newSub ? newSub.toJSON() : null,
        oldSub ? oldSub.endpoint : null
      );

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
