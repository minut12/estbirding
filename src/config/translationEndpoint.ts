import { resolveProxyBase } from './proxyEndpoint';

export const LS_TRANSLATE_ENDPOINT = 'translate_endpoint_v1';
export const TRANSLATION_ENDPOINT_UPDATED_EVENT = 'translation-endpoint-updated';
export const WORKER_DEFAULT_ENDPOINT = '';

function proxyBaseToTranslateEndpoint(proxyBase: string): string {
  const raw = String(proxyBase || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname || '';
    if (!pathname.includes('/functions/v1/proxy')) return '';
    parsed.pathname = pathname.replace(/\/+$/, '').replace(/\/translate-et$/, '') + '/translate-et';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeTranslateEndpoint(raw: string): string {
  const input = String(raw || '').trim();
  if (!input) return '';
  const fromProxy = proxyBaseToTranslateEndpoint(input);
  return fromProxy || input;
}

export function getTranslateEndpoint(): string {
  const stored = (localStorage.getItem(LS_TRANSLATE_ENDPOINT) || '').trim();
  if (stored) return normalizeTranslateEndpoint(stored);

  const env = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TRANSLATE_API_URL
    ? String(import.meta.env.VITE_TRANSLATE_API_URL).trim()
    : '';
  if (env) return normalizeTranslateEndpoint(env);

  const proxyDerived = proxyBaseToTranslateEndpoint(resolveProxyBase());
  if (proxyDerived) return proxyDerived;

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
  if (input) return normalizeTranslateEndpoint(input);
  return getTranslateEndpoint();
}

export function resolveEndpoint(currentInput?: string): string {
  return resolveBaseEndpoint(currentInput);
}

export function getProxyOrigin(): string {
  const base = String(resolveProxyBase() || '').trim();
  if (!base) return '';
  try {
    const parsed = new URL(base);
    if (!(parsed.pathname || '').includes('/functions/v1/proxy')) return '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    const raw = String(base.split('?')[0] || '').trim().replace(/\/+$/, '');
    return raw.includes('/functions/v1/proxy') ? raw : '';
  }
}

export function getProxyTranslateEndpoint(): string {
  const proxyOrigin = getProxyOrigin();
  if (!proxyOrigin) return '';
  if (proxyOrigin.endsWith('/translate-et')) return proxyOrigin;
  return `${proxyOrigin}/translate-et`;
}

export function resolveHealthUrl(_endpoint?: string): string {
  return '';
}
