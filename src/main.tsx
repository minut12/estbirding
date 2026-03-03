import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

// Hidden debug shortcut: ?reset=1 triggers full reset
import { fullReset, doHardReload } from './lib/cache-reset';
const BUILTIN_TRANSLATE_ENDPOINT = '/.netlify/functions/translate-et';

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

    // Only auto-fix if it points to supabase.co (known failing in this environment)
    if (cur && cur.includes('.supabase.co/functions/v1/')) {
      // Try a lightweight ping to current endpoint (GET ?ping=1)
      let ok = false;
      try {
        const r = await fetch(cur + (cur.includes('?') ? '&' : '?') + 'ping=1', { method: 'GET' });
        ok = r.ok;
      } catch {
        ok = false;
      }

      if (!ok) {
        localStorage.setItem(key, BUILTIN_TRANSLATE_ENDPOINT);
        console.log('[translate] auto-switched to', BUILTIN_TRANSLATE_ENDPOINT);
      }
    }

    // If empty, set default
    if (!cur) {
      localStorage.setItem(key, BUILTIN_TRANSLATE_ENDPOINT);
    }
  } catch {}
})();

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — app still works
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
