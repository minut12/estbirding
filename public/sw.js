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
// P183: offline + slow-network caching.
// CACHE_NAME (per build, evicted on activate): shell, /assets/*, /maps/**, icons.
// The three caches below survive deploys and are size-capped.
const LIB_CACHE = 'estbirding-lib-v1';
const TILE_CACHE = 'estbirding-tiles-v1';
const AVATAR_CACHE = 'estbirding-avatars-v1';
const DATA_CACHE = 'estbirding-data-v1';
// Leaflet is the only third-party script the maps load; without it every map is blank offline.
const LIB_URLS = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'];
const KEEP_CACHES = [CACHE_NAME, LIB_CACHE, TILE_CACHE, AVATAR_CACHE, DATA_CACHE];
const TILE_MAX = 500;
const AVATAR_MAX = 1500;
const NET_TIMEOUT_MS = 3000;
const SB_HOST = (() => { try { return SB_URL ? new URL(SB_URL).host : ''; } catch (e) { return ''; } })();

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/map-placeholder.html',
  '/icon.png',
  '/icons/estbirds-96.png',
  '/maps/linnuliigid/index.html',
  '/maps/europe/index.html',
  '/maps/rariliin/index.html',
  '/maps/linnuliigid/species.json',
  '/maps/shared/map-tokens.css',
  '/maps/shared/et-strings.js',
  '/maps/shared/format-ee.js',
  '/maps/shared/gps-locate.js',
  '/maps/shared/map-hamburger-control.js',
  '/maps/shared/randeajad.js',
  '/maps/shared/rarity-style.js',
  '/maps/shared/species-meta.js',
  '/maps/shared/species-prediction-panel.js',
  '/maps/shared/migration-windows.json',
];

// Never cache the reset page
const DENY_CACHE = ['/reset/', '/reset/index.html'];
// Same-origin static files served cache-first from the build cache.
const CACHE_FIRST_SAME_ORIGIN = ['/assets/', '/icons/', '/icon.png', '/manifest.json', '/map-placeholder.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // One by one so a single missing file cannot fail the whole install.
    await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)));
    const lib = await caches.open(LIB_CACHE);
    await Promise.allSettled(LIB_URLS.map((u) => lib.add(new Request(u, { mode: 'cors', credentials: 'omit' }))));
    // Hashed bundle names are only known from the shell; pull them out of it.
    try {
      const shell = await cache.match('/');
      const html = shell ? await shell.text() : '';
      const assets = Array.from(new Set(html.match(/\/assets\/[^"'\s)]+/g) || []));
      await Promise.allSettled(assets.map((u) => cache.add(u)));
    } catch (e) {}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => KEEP_CACHES.indexOf(k) === -1).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first, but answer from cache once the full download has taken
// NET_TIMEOUT_MS (slow link) or failed (offline). The body is buffered so the
// timeout covers the whole transfer, not just the headers. A late network
// answer still refreshes the cache.
function networkFirst(event, key, cacheName) {
  let saved = Promise.resolve();
  const network = fetch(event.request).then((res) => {
    if (!res || !res.ok || res.redirected) return res;
    return res.blob().then((body) => {
      const init = { status: res.status, statusText: res.statusText, headers: res.headers };
      saved = caches.open(cacheName || CACHE_NAME).then((c) => c.put(key, new Response(body, init))).catch(() => {});
      return new Response(body, init);
    });
  });
  event.waitUntil(network.then(() => saved, () => {}));

  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
    const fromCache = () => caches.match(key);
    const timer = setTimeout(() => { fromCache().then(finish); }, NET_TIMEOUT_MS);
    network.then((res) => { clearTimeout(timer); finish(res); }, () => {
      clearTimeout(timer);
      fromCache().then((hit) => finish(hit || Response.error()));
    });
  });
}

// Cache first; on a miss fetch, keep a copy, trim to `max` entries.
// Cross-origin files are re-requested in CORS mode so the cached copy is a real
// response, not an opaque one (Chrome counts each opaque entry as ~7 MB of quota).
function cacheFirst(event, cacheName, max) {
  const req = event.request;
  const crossOrigin = new URL(req.url).origin !== self.location.origin;
  return caches.open(cacheName).then((cache) => cache.match(req, { ignoreVary: true }).then((hit) => {
    if (hit) return hit;
    const netReq = crossOrigin ? new Request(req.url, { mode: 'cors', credentials: 'omit' }) : req;
    return fetch(netReq).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        event.waitUntil(cache.put(req, copy).then(() => (max ? trimCache(cache, max) : null)).catch(() => {}));
      }
      return res;
    }, () => (crossOrigin ? fetch(req) : Response.error()));
  }));
}

// shortcut: evicts oldest-inserted (FIFO), not least-recently-used; upgrade if the cap is hit in practice.
function trimCache(cache, max) {
  return cache.keys().then((keys) =>
    Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)))
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (DENY_CACHE.some((p) => url.pathname.startsWith(p))) return;
    if (url.pathname.startsWith('/maps/')) {
      // Keyed by path so the ?v=/&spv=/&fv= cache-busters still hit offline.
      const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      event.respondWith(networkFirst(event, path));
      return;
    }
    if (CACHE_FIRST_SAME_ORIGIN.some((p) => url.pathname.startsWith(p))) {
      event.respondWith(cacheFirst(event, CACHE_NAME, 0));
      return;
    }
    // P21: only top-level documents are the shell; iframe navigations never overwrite '/'.
    if (req.mode === 'navigate' && req.destination === 'document') {
      event.respondWith(networkFirst(event, '/'));
    }
    return; // /api/, /.netlify/, /sw.js and anything else: browser default
  }

  if (url.hostname === 'unpkg.com') { event.respondWith(cacheFirst(event, LIB_CACHE, 0)); return; }
  if (/(^|\.)tile\.openstreetmap\.org$/.test(url.hostname)) { event.respondWith(cacheFirst(event, TILE_CACHE, TILE_MAX)); return; }
  // P183c: Elurikkus per-observation pins live only in the map's memory; keep the last answer for offline.
  if (SB_HOST && url.host === SB_HOST && url.pathname === '/functions/v1/get-elurikkus-recent-obs') {
    event.respondWith(networkFirst(event, url.origin + url.pathname + url.search, DATA_CACHE));
    return;
  }
  if (SB_HOST && url.host === SB_HOST && url.pathname.indexOf('/storage/v1/object/public/bird-avatars/') === 0) {
    event.respondWith(cacheFirst(event, AVATAR_CACHE, AVATAR_MAX));
    return;
  }
  // Supabase API, eBird, relay, xeno-canto, Windy: untouched.
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
    // P181: push_sub_rotate carries the species list across and drops the old
    // row in one call; the table itself is no longer open to anon.
    await fetch(SB_URL + '/rest/v1/rpc/push_sub_rotate', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        p_old_endpoint: oldEndpoint || null,
        p_endpoint: subJson.endpoint,
        p_p256dh: subJson.keys ? subJson.keys.p256dh : null,
        p_auth: subJson.keys ? subJson.keys.auth : null,
        p_device_label: swDeviceLabel(),
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
