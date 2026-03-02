export const LS_TRANSLATE_ENDPOINT = 'translate_endpoint_v1';
export const TRANSLATION_ENDPOINT_UPDATED_EVENT = 'translation-endpoint-updated';
export const WORKER_DEFAULT_ENDPOINT = '';

export function getTranslateEndpoint(): string {
  const stored = (localStorage.getItem(LS_TRANSLATE_ENDPOINT) || '').trim();
  if (stored) return stored;

  const env = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TRANSLATE_API_URL
    ? String(import.meta.env.VITE_TRANSLATE_API_URL).trim()
    : '';
  if (env) return env;

  return '';
}

export function getStoredEndpoint(): string {
  return (localStorage.getItem(LS_TRANSLATE_ENDPOINT) || '').trim();
}

export function setStoredEndpoint(v: string): void {
  localStorage.setItem(LS_TRANSLATE_ENDPOINT, String(v || '').trim());
  window.dispatchEvent(new Event(TRANSLATION_ENDPOINT_UPDATED_EVENT));
}

export function getEnvEndpoint(): string {
  return String((import.meta as any).env?.VITE_TRANSLATE_API_URL || '').trim();
}

export function resolveBaseEndpoint(currentInput?: string): string {
  const input = String(currentInput || '').trim();
  if (input) return input;
  return getTranslateEndpoint();
}

export function resolveEndpoint(currentInput?: string): string {
  return resolveBaseEndpoint(currentInput);
}

export function resolveHealthUrl(_endpoint?: string): string {
  return '';
}
