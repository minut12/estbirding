const LS_KEY = 'translate_api_url_override';
export const TRANSLATE_ENDPOINT_UPDATED_EVENT = 'translate-endpoint-updated';

export function getTranslateEndpointOverride(): string {
  return (localStorage.getItem(LS_KEY) || '').trim();
}

export function setTranslateEndpointOverride(value: string): void {
  const v = (value || '').trim();
  if (!v) localStorage.removeItem(LS_KEY);
  else localStorage.setItem(LS_KEY, v);
  window.dispatchEvent(new Event(TRANSLATE_ENDPOINT_UPDATED_EVENT));
}

export function getEnvTranslateEndpoint(): string {
  const env = (import.meta as any).env || {};
  return String(env.VITE_TRANSLATE_API_URL || env.TRANSLATE_API_URL || '').trim();
}

export function getTranslateEndpoint(): string {
  const fromLS = getTranslateEndpointOverride();
  const fromEnv = getEnvTranslateEndpoint();
  const endpoint = (fromLS || fromEnv || '').trim();

  if (!endpoint) return '';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint.replace(/\/+$/, '');
  }
  if (endpoint.startsWith('/')) {
    return `${window.location.origin}${endpoint}`.replace(/\/+$/, '');
  }
  return endpoint;
}
