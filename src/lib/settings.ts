/** Persistent settings stored in localStorage */

export interface AppSettings {
  newsSourceUrl: string;
  eventsSourceUrl: string;
  enableSpeciesPredictionBeta: boolean;
  gpsEnabled: boolean;
}

const STORAGE_KEY = 'estbirding-settings';
const LEGACY_NEWS_AUTO_TRANSLATE_ET_KEY = 'news_auto_translate_et';

const defaults: AppSettings = {
  newsSourceUrl: '',          // TODO: set real news feed URL
  eventsSourceUrl: '',        // TODO: set real events feed URL
  enableSpeciesPredictionBeta: false,
  gpsEnabled: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const { autoTranslateToEstonian: _legacy, ...rest } = parsed ?? {};
    localStorage.removeItem(LEGACY_NEWS_AUTO_TRANSLATE_ET_KEY);
    return { ...defaults, ...rest };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isSpeciesPredictionEnabled(): boolean {
  return loadSettings().enableSpeciesPredictionBeta === true;
}

export function isGpsEnabled(): boolean {
  return loadSettings().gpsEnabled === true;
}

