/** App version based on build time – changes on every deploy */
declare const __BUILD_TIME__: string;
export const APP_VERSION: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev';

const VERSION_KEY = 'estbirding-lastSeenVersion';

export function checkVersionMismatch(): boolean {
  const last = localStorage.getItem(VERSION_KEY);
  return last !== null && last !== APP_VERSION;
}

export function markVersionSeen(): void {
  localStorage.setItem(VERSION_KEY, APP_VERSION);
}
