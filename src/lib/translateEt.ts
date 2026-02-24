import { getTranslationApiUrl } from '@/config/translationConfig';

export interface TranslateEtInput {
  id: string;
  title: string;
  body: string;
}

export interface TranslateEtOutput {
  title_et: string;
  body_et: string;
}

export class TranslateEtHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'TranslateEtHttpError';
  }
}

const inFlight = new Map<string, Promise<TranslateEtOutput | null>>();
let loggedEndpoint = false;
const MAX_ERROR_PREVIEW_CHARS = 200;

function weakHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16);
}

export async function hash(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((n) => n.toString(16).padStart(2, '0')).join('');
  }
  return weakHash(text);
}

async function buildCacheKey(input: TranslateEtInput): Promise<string> {
  const digest = await hash(`${input.title}\n\n${input.body}`);
  return `tr_et:${input.id}:${digest}`;
}

function readCache(cacheKey: string): TranslateEtOutput | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TranslateEtOutput>;
    return {
      title_et: String(parsed.title_et || ''),
      body_et: String(parsed.body_et || ''),
    };
  } catch {
    return null;
  }
}

function writeCache(cacheKey: string, value: TranslateEtOutput): void {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(value));
  } catch {
    // Ignore storage write failures.
  }
}

export async function translateEt(input: TranslateEtInput, endpointOverride?: string): Promise<TranslateEtOutput | null> {
  const normalized: TranslateEtInput = {
    id: String(input.id || '').trim(),
    title: String(input.title || '').trim(),
    body: String(input.body || '').trim(),
  };

  if (!normalized.id || (!normalized.title && !normalized.body)) {
    return null;
  }
  const endpoint = String(endpointOverride || getTranslationApiUrl() || '').trim();
  if (import.meta.env.DEV) {
    console.info('[translate] endpoint=', endpoint || '(empty)');
  }
  if (!endpoint) {
    throw new Error('Translation backend not configured. Set it in Settings.');
  }
  if (!loggedEndpoint) {
    loggedEndpoint = true;
    console.info(`[translate] endpoint resolved=${endpoint}`);
  }

  const cacheKey = await buildCacheKey(normalized);
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const request = fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized),
  })
    .then(async (res) => {
      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      const isJson = contentType.includes('application/json');
      if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        if (isJson) {
          const payload = await res.json() as { error?: unknown };
          if (payload?.error) errorMessage = `HTTP ${res.status} ${String(payload.error)}`;
        } else {
          const bodyText = (await res.text()).trim();
          if (bodyText) {
            const preview = bodyText.slice(0, MAX_ERROR_PREVIEW_CHARS).replace(/\s+/g, ' ');
            errorMessage = `HTTP ${res.status} Expected JSON, got ${contentType || 'unknown'}: ${preview}`;
          } else {
            errorMessage = `HTTP ${res.status} Expected JSON, got ${contentType || 'unknown'}`;
          }
        }
        throw new TranslateEtHttpError(res.status, errorMessage);
      }
      if (!isJson) {
        const bodyText = (await res.text()).trim();
        const preview = bodyText.slice(0, MAX_ERROR_PREVIEW_CHARS).replace(/\s+/g, ' ');
        throw new Error(`HTTP ${res.status} Expected JSON, got ${contentType || 'unknown'}: ${preview || '[empty body]'}`);
      }
      const parsed = await res.json() as Partial<TranslateEtOutput>;
      if (typeof parsed.title_et !== 'string' || typeof parsed.body_et !== 'string') {
        throw new Error(`HTTP ${res.status} Invalid JSON payload: required string fields title_et/body_et`);
      }
      const result = {
        title_et: parsed.title_et,
        body_et: parsed.body_et,
      };
      writeCache(cacheKey, result);
      return result;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[translate] failed. URL=${endpoint}. Error=${message}`, error);
      if (error instanceof TranslateEtHttpError) throw error;
      throw new Error(message);
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, request);
  return request;
}
