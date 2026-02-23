/** Persistent settings stored in localStorage */

export interface AppSettings {
  newsSourceUrl: string;
  eventsSourceUrl: string;
  autoTranslateToEstonian: boolean;
}

const STORAGE_KEY = 'estbirding-settings';

const defaults: AppSettings = {
  newsSourceUrl: '',          // TODO: set real news feed URL
  eventsSourceUrl: '',        // TODO: set real events feed URL
  autoTranslateToEstonian: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
