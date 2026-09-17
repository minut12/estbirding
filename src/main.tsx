import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

// Hidden debug shortcut: ?reset=1 triggers full reset
import { fullReset, doHardReload } from './lib/cache-reset';
import { log } from './lib/eventLog';
import { getSupabaseAnonKey, getSupabaseUrl } from './config/supabaseConfig';
import { reconcilePushSubscription } from './lib/pushReconcile';
const BUILTIN_TRANSLATE_ENDPOINT = 'https://rfjhrosxbaihyrnbmmbl.supabase.co/functions/v1/translate-et';
declare const __BUILD_TIME__: string;
const RUNTIME_BUILD_MARKER = `${__BUILD_TIME__}|app-runtime-c92cfa2`;

declare global {
  interface Window {
    __ESTBIRDING_RUNTIME_BUILD__?: string;
  }
}

window.__ESTBIRDING_RUNTIME_BUILD__ = RUNTIME_BUILD_MARKER;

if (new URLSearchParams(window.location.search).get('reset') === '1') {
  if (confirm('Täielik lähtestus – kõik andmed kustutatakse. Jätkata?')) {
    fullReset().then(() => doHardReload());
  } else {
    // Remove ?reset=1 without reloading
    history.replaceState(null, '', window.location.pathname);
  }
}

void (async function autoFixTranslateEndpoint() {
  try {
    const key = 'translate_endpoint_v1';
    const cur = (localStorage.getItem(key) || '').trim();

    // If empty or pointing to old netlify/api paths, set to Supabase default
    if (!cur || cur.startsWith('/') || cur.includes('/.netlify/') || cur.includes('/api/')) {
      localStorage.setItem(key, BUILTIN_TRANSLATE_ENDPOINT);
      console.log('[translate] set endpoint to', BUILTIN_TRANSLATE_ENDPOINT);
    }
  } catch {}
})();

// Register service worker for PWA. P35: the Supabase URL + publishable key ride
// along on the query string so the SW can upsert a rotated push subscription by
// itself, with no window open. `v` stays first — sw.js derives CACHE_NAME from it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl =
      `/sw.js?v=${encodeURIComponent(RUNTIME_BUILD_MARKER)}` +
      `&su=${encodeURIComponent(getSupabaseUrl())}` +
      `&sk=${encodeURIComponent(getSupabaseAnonKey())}`;
    navigator.serviceWorker.register(swUrl).catch(() => {
      // SW registration failed — app still works
    });
  });
}

log('⚙️ app started');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_RECEIVED') {
      log('🔔 PUSH: ' + event.data.species + ' on märgatud!');
    }
  });
}

// P35: reconcile subscription + DB row on every launch, and again when the app
// comes back to the foreground — the linnuliigid iframe may never be opened.
const RECONCILE_MIN_INTERVAL_MS = 10 * 60 * 1000;
let lastReconcileAt = 0;

function runPushReconcile(): void {
  lastReconcileAt = Date.now();
  void reconcilePushSubscription().catch(() => {
    // Fire-and-forget — reconcilePushSubscription logs its own failure branches.
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(() => runPushReconcile()).catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastReconcileAt < RECONCILE_MIN_INTERVAL_MS) return;
    runPushReconcile();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
