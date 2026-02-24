const KEY = 'estbirding.translationApiUrl';
export const TRANSLATION_ENDPOINT_UPDATED_EVENT = 'translation-endpoint-updated';

export function getStoredEndpoint(): string {
  return (localStorage.getItem(KEY) || '').trim();
}

export function setStoredEndpoint(v: string): void {
  localStorage.setItem(KEY, (v || '').trim());
  window.dispatchEvent(new Event(TRANSLATION_ENDPOINT_UPDATED_EVENT));
}

export function getEnvEndpoint(): string {
  return String((import.meta as any).env?.VITE_TRANSLATE_API_URL || '').trim();
}

export function resolveEndpoint(currentInput?: string): string {
  const env = getEnvEndpoint();
  const raw = (currentInput?.trim() || getStoredEndpoint() || env || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

