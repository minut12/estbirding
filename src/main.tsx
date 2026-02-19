import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Hidden debug shortcut: ?reset=1 triggers full reset
import { fullReset, doHardReload } from './lib/cache-reset';

if (new URLSearchParams(window.location.search).get('reset') === '1') {
  if (confirm('Täielik lähtestus – kõik andmed kustutatakse. Jätkata?')) {
    fullReset().then(() => doHardReload());
  } else {
    // Remove ?reset=1 without reloading
    history.replaceState(null, '', window.location.pathname);
  }
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failed — app still works
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
