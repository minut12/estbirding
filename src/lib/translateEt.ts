import { getEnvEndpoint, getStoredEndpoint, getTranslateEndpoint } from '@/config/translationEndpoint';

export interface TranslateEtInput {
  id: string;
  title: string;
  body: string;
  sourceLang?: string;
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
const NON_JSON_PREVIEW_CHARS = 120;

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

async function buildCacheKey(text: string): Promise<string> {
  const digest = await hash(`et:${text}`);
  return `tr_et_text:${digest}`;
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

async function translateText(endpoint: string, text: string, sourceLang?: string): Promise<string> {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  const cacheKey = await buildCacheKey(normalized);
  const cached = localStorage.getItem(cacheKey);
  if (cached !== null) return cached;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: normalized, targetLang: 'et', sourceLang: sourceLang || undefined }),
  });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const raw = await response.text();
  if (!contentType.includes('application/json')) {
    throw new Error(`NON_JSON_RESPONSE_${response.status}: ${raw.slice(0, NON_JSON_PREVIEW_CHARS)}`);
  }
  let parsed: { ok?: boolean; translatedText?: unknown };
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`NON_JSON_RESPONSE_${response.status}: ${raw.slice(0, NON_JSON_PREVIEW_CHARS)}`);
  }
  if (response.status !== 200) {
    const preview = String((parsed as any)?.error || raw || '').slice(0, MAX_ERROR_PREVIEW_CHARS).replace(/\s+/g, ' ');
    throw new TranslateEtHttpError(response.status, `status=${response.status}. endpoint=${endpoint}. ${preview || '[empty body]'}`);
  }
  if (parsed.ok !== true || typeof parsed.translatedText !== 'string') {
    throw new Error('BAD_JSON_RESPONSE');
  }
  try {
    localStorage.setItem(cacheKey, parsed.translatedText);
  } catch {
    // Ignore storage failures.
  }
  return parsed.translatedText;
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
  const endpoint = String(endpointOverride || getTranslateEndpoint() || '').trim();
  if (!endpoint) {
    throw new Error('TRANSLATE_ENDPOINT_MISSING');
  }
  if (!loggedEndpoint && import.meta.env.DEV) {
    loggedEndpoint = true;
    const stored = getStoredEndpoint() || '(empty)';
    const env = getEnvEndpoint() || '(empty)';
    const resolved = getTranslateEndpoint() || '(empty)';
    console.info('[translate] stored=', stored, 'env=', env, 'resolved=', resolved);
  }

  const combinedCacheKey = await hash(`tr_et_pair:${normalized.id}:${normalized.title}\n\n${normalized.body}`);
  const cacheKey = `tr_et_pair:${combinedCacheKey}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const request = Promise.all([
    translateText(endpoint, normalized.title, normalized.sourceLang),
    translateText(endpoint, normalized.body, normalized.sourceLang),
  ])
    .then(([title_et, body_et]) => {
      const result = { title_et, body_et };
      writeCache(cacheKey, result);
      return result;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[translate] failed. URL=${endpoint}. Error=${message}`, error);
      if (error instanceof TranslateEtHttpError) throw error;
      throw new Error(`Translate failed. endpoint=${endpoint}. error=${message}`);
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, request);
  return request;
}
