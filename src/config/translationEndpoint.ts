const KEY = 'estbirding.translationApiUrl';
const LEGACY_KEY = 'translate_api_url_override';
export const WORKER_DEFAULT_ENDPOINT = 'https://estbirding.kristian03.workers.dev';
export const TRANSLATION_ENDPOINT_UPDATED_EVENT = 'translation-endpoint-updated';

export function getStoredEndpoint(): string {
  return (localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '').trim();
}

export function setStoredEndpoint(v: string): void {
  localStorage.setItem(KEY, (v || '').trim());
  window.dispatchEvent(new Event(TRANSLATION_ENDPOINT_UPDATED_EVENT));
}

export function getEnvEndpoint(): string {
  return String((import.meta as any).env?.VITE_TRANSLATE_API_URL || '').trim();
}

export function resolveEndpoint(currentInput?: string): string {
  const hardcoded = WORKER_DEFAULT_ENDPOINT;
  const env = getEnvEndpoint();
  const stored = (localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '').trim();
  const raw = (currentInput?.trim() || stored || env.trim() || hardcoded).trim();
  return raw.replace(/\/+$/, '');
}
