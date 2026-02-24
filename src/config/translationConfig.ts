export const STORAGE_KEY = 'translation_api_url';
const LEGACY_STORAGE_KEY = 'translate_api_url_override';
export const TRANSLATION_API_URL_UPDATED_EVENT = 'translation-api-url-updated';

type CapacitorPreferences = {
  get?: (options: { key: string }) => Promise<{ value?: string | null }>;
  set?: (options: { key: string; value: string }) => Promise<void>;
  remove?: (options: { key: string }) => Promise<void>;
};

function getPreferencesPlugin(): CapacitorPreferences | null {
  const cap = (window as any)?.Capacitor;
  const plugin = cap?.Plugins?.Preferences;
  return plugin || null;
}

let hydratedFromPreferences = false;

function hydrateFromPreferences(): void {
  if (hydratedFromPreferences) return;
  hydratedFromPreferences = true;
  const preferences = getPreferencesPlugin();
  if (!preferences?.get) return;
  preferences.get({ key: STORAGE_KEY })
    .then((result) => {
      const value = String(result?.value || '').trim();
      if (!value) return;
      localStorage.setItem(STORAGE_KEY, value);
      window.dispatchEvent(new Event(TRANSLATION_API_URL_UPDATED_EVENT));
    })
    .catch(() => {
      // Ignore Preferences read failures; localStorage remains fallback source.
    });
}

export function getTranslationApiUrl(): string {
  hydrateFromPreferences();
  const current = String(localStorage.getItem(STORAGE_KEY) || '').trim();
  if (current) return current;
  const legacy = String(localStorage.getItem(LEGACY_STORAGE_KEY) || '').trim();
  if (legacy) {
    localStorage.setItem(STORAGE_KEY, legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacy;
  }
  return '';
}

export function setTranslationApiUrl(url: string): void {
  const value = String(url || '').trim();
  if (value) localStorage.setItem(STORAGE_KEY, value);
  else localStorage.removeItem(STORAGE_KEY);

  const preferences = getPreferencesPlugin();
  if (preferences?.set && value) {
    preferences.set({ key: STORAGE_KEY, value }).catch(() => {});
  } else if (preferences?.remove && !value) {
    preferences.remove({ key: STORAGE_KEY }).catch(() => {});
  }

  window.dispatchEvent(new Event(TRANSLATION_API_URL_UPDATED_EVENT));
}
