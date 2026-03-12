/** Persistent settings stored in localStorage */

export interface AppSettings {
  newsSourceUrl: string;
  eventsSourceUrl: string;
  autoTranslateToEstonian: boolean;
  enableSpeciesPredictionBeta: boolean;
}

const STORAGE_KEY = 'estbirding-settings';
export const NEWS_AUTO_TRANSLATE_ET_KEY = 'news_auto_translate_et';

const defaults: AppSettings = {
  newsSourceUrl: '',          // TODO: set real news feed URL
  eventsSourceUrl: '',        // TODO: set real events feed URL
  autoTranslateToEstonian: true,
  enableSpeciesPredictionBeta: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const keyValue = localStorage.getItem(NEWS_AUTO_TRANSLATE_ET_KEY);
    const autoTranslateToEstonian = keyValue == null
      ? parsed.autoTranslateToEstonian
      : keyValue === '1';
    return { ...defaults, ...parsed, autoTranslateToEstonian };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  localStorage.setItem(NEWS_AUTO_TRANSLATE_ET_KEY, settings.autoTranslateToEstonian ? '1' : '0');
}

export function isAutoTranslateNewsToEtEnabled(): boolean {
  const keyValue = localStorage.getItem(NEWS_AUTO_TRANSLATE_ET_KEY);
  if (keyValue != null) return keyValue === '1';
  return loadSettings().autoTranslateToEstonian;
}
