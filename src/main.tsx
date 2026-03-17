import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

// Hidden debug shortcut: ?reset=1 triggers full reset
import { fullReset, doHardReload } from './lib/cache-reset';
const BUILTIN_TRANSLATE_ENDPOINT = 'https://eenwcyuyugyrjgpivxrq.supabase.co/functions/v1/translate-et';
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

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(RUNTIME_BUILD_MARKER)}`).catch(() => {
      // SW registration failed — app still works
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
