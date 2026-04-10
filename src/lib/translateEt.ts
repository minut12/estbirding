import {
  getActiveTranslationEndpoint,
  getDefaultTranslationEndpoint,
  getEnvEndpoint,
  getStoredTranslationEndpoint,
  getTranslateEndpoint,
} from '@/config/translationEndpoint';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Pass user JWT if available, fall back to anon key
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const anon = String((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || '').trim();
  if (anon) {
    headers.apikey = anon;
    if (!token) headers.Authorization = `Bearer ${anon}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    mode: 'cors',
    headers,
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

function isNetworkLikeError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return message.includes('networkerror')
    || message.includes('failed to fetch')
    || message.includes('fetch resource')
    || message.includes('aborterror')
    || message.includes('aborted')
    || message.includes('load failed');
}

function isNonJsonError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '');
  return message.includes('NON_JSON_RESPONSE_') || message.startsWith('NON_JSON_');
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
  const storedEndpoint = getStoredTranslationEndpoint();
  const builtinEndpoint = getDefaultTranslationEndpoint();
  const endpoint = String(endpointOverride || getActiveTranslationEndpoint() || '').trim();
  if (!endpoint) {
    throw new Error('TRANSLATE_ENDPOINT_MISSING');
  }
  if (!loggedEndpoint && import.meta.env.DEV) {
    loggedEndpoint = true;
    const stored = getStoredTranslationEndpoint() || '(empty)';
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

  const tryTranslatePair = async (activeEndpoint: string): Promise<TranslateEtOutput> => {
    const [title_et, body_et] = await Promise.all([
      translateText(activeEndpoint, normalized.title, normalized.sourceLang),
      translateText(activeEndpoint, normalized.body, normalized.sourceLang),
    ]);
    return { title_et, body_et };
  };

  const request = tryTranslatePair(endpoint)
    .catch(async (error) => {
      const canFallbackToBuiltin = Boolean(
        storedEndpoint
        && builtinEndpoint
        && endpoint === storedEndpoint
        && storedEndpoint !== builtinEndpoint
        && (isNetworkLikeError(error) || isNonJsonError(error)),
      );
      if (!canFallbackToBuiltin) throw error;
      return tryTranslatePair(builtinEndpoint);
    })
    .then((result) => {
      writeCache(cacheKey, result);
      return result;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[translate] failed. URL=${endpoint}. Error=${message}`, error);
      if (isNetworkLikeError(error)) {
        toast.error('Võrgupoliitika (CSP) võib blokeerida supabase.co päringud. Kontrolli CSP connect-src.');
      }
      if (error instanceof TranslateEtHttpError) throw error;
      throw new Error(`Translate failed. endpoint=${endpoint}. error=${message}`);
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, request);
  return request;
}
