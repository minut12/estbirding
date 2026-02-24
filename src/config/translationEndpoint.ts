const KEY = 'estbirding.translationApiUrl';
const LEGACY_KEY = 'translate_api_url_override';
export const WORKER_DEFAULT_ENDPOINT = '';
export const TRANSLATION_ENDPOINT_UPDATED_EVENT = 'translation-endpoint-updated';

export function getStoredEndpoint(): string {
  return (localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '').trim();
}

export function setStoredEndpoint(v: string): void {
  const input = String(v || '').trim();
  const normalized = normalizeBaseUrl(input);
  localStorage.setItem(KEY, normalized);
  window.dispatchEvent(new Event(TRANSLATION_ENDPOINT_UPDATED_EVENT));
}

export function getEnvEndpoint(): string {
  return String((import.meta as any).env?.VITE_TRANSLATE_API_URL || '').trim();
}

function normalizeEndpoint(raw: string): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const search = parsed.search || '';
    return `${parsed.origin}/translate-et${search}`;
  } catch {
    return trimmed;
  }
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    let path = parsed.pathname || '/';
    if (path.endsWith('/translate-et')) path = path.slice(0, -'/translate-et'.length) || '/';
    if (path.endsWith('/health')) path = path.slice(0, -'/health'.length) || '/';
    parsed.pathname = path;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return trimmed;
  }
}

export function resolveBaseEndpoint(currentInput?: string): string {
  const hardcoded = WORKER_DEFAULT_ENDPOINT;
  const env = getEnvEndpoint();
  const stored = (localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '').trim();
  const raw = (currentInput?.trim() || stored || env.trim() || hardcoded).trim();
  return normalizeBaseUrl(raw);
}

export function resolveEndpoint(currentInput?: string): string {
  return normalizeEndpoint(resolveBaseEndpoint(currentInput));
}

export function resolveHealthUrl(endpoint?: string): string {
  const resolved = String(endpoint || resolveBaseEndpoint()).trim();
  try {
    const parsed = new URL(resolved);
    const search = parsed.search || '';
    return `${parsed.origin}/health${search}`;
  } catch {
    return `${resolved.replace(/\/+$/, '')}/health`;
  }
}
