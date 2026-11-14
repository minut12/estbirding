/** Cache / storage reset utilities for PWA */

export interface ResetReport {
  clearedCaches: string[];
  clearedStorage: boolean;
  clearedSession: boolean;
  clearedIdb: string[];
  unregisteredSw: number;
  errors: string[];
}

function emptyReport(): ResetReport {
  return { clearedCaches: [], clearedStorage: false, clearedSession: false, clearedIdb: [], unregisteredSw: 0, errors: [] };
}

// P183f: offline caches that survive deploys; the update banner keeps them.
const OFFLINE_CACHE_PREFIXES = ['estbirding-lib-', 'estbirding-tiles-', 'estbirding-avatars-', 'estbirding-data-'];

async function clearCacheStorage(report: ResetReport, keep?: (name: string) => boolean) {
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !(keep && keep(k))).map(async (k) => {
      await caches.delete(k);
      report.clearedCaches.push(k);
    }));
  } catch (e: any) {
    report.errors.push(`Cache Storage: ${e.message ?? e}`);
  }
}

async function unregisterServiceWorkers(report: ResetReport) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      await reg.unregister();
      report.unregisteredSw++;
    }
  } catch (e: any) {
    report.errors.push(`Service Worker: ${e.message ?? e}`);
  }
}

function clearLocalStorage(report: ResetReport) {
  try { localStorage.clear(); report.clearedStorage = true; } catch (e: any) {
    report.errors.push(`localStorage: ${e.message ?? e}`);
  }
}

function clearSessionStorage(report: ResetReport) {
  try { sessionStorage.clear(); report.clearedSession = true; } catch (e: any) {
    report.errors.push(`sessionStorage: ${e.message ?? e}`);
  }
}

async function clearIndexedDB(report: ResetReport) {
  if (!('indexedDB' in window)) return;
  try {
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name);
          report.clearedIdb.push(db.name);
        }
      }
    } else {
      report.errors.push('IndexedDB: databases() pole toetatud – jäeti vahele');
    }
  } catch (e: any) {
    report.errors.push(`IndexedDB: ${e.message ?? e}`);
  }
}

/** Soft reset: caches + SW + reload. keepOffline keeps the deploy-surviving offline caches. */
export async function clearAppCaches(opts?: { keepOffline?: boolean }): Promise<ResetReport> {
  const report = emptyReport();
  await clearCacheStorage(report, opts?.keepOffline ? (k) => OFFLINE_CACHE_PREFIXES.some((p) => k.startsWith(p)) : undefined);
  await unregisterServiceWorkers(report);
  return report;
}

/** Hard reset: caches + SW + storage + IDB */
export async function fullReset(): Promise<ResetReport> {
  const report = emptyReport();
  await clearCacheStorage(report);
  await unregisterServiceWorkers(report);
  clearLocalStorage(report);
  clearSessionStorage(report);
  await clearIndexedDB(report);
  return report;
}

export function doSoftReload() {
  window.location.reload();
}

export function doHardReload() {
  window.location.href = window.location.pathname + '?v=' + Date.now();
}
