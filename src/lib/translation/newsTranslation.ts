import { normalizeLocale } from '@/lib/locale';

export interface NewsTranslationInput {
  id: string;
  title?: string | null;
  body?: string | null;
  sourceLang?: string | null;
}

export interface NewsTranslationResult {
  title_et: string;
  body_et: string;
}

interface CachedTranslation extends NewsTranslationResult {
  updatedAt: number;
}

const STORAGE_KEY = 'news_translation_cache_v1';
const inFlight = new Map<string, Promise<NewsTranslationResult | null>>();

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function getApiUrl(): string {
  const env = import.meta.env as ImportMetaEnv & {
    TRANSLATE_API_URL?: string;
    VITE_TRANSLATE_API_URL?: string;
  };
  return String(env.TRANSLATE_API_URL || env.VITE_TRANSLATE_API_URL || '').trim();
}

function getCache(): Record<string, CachedTranslation> {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CachedTranslation>): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write failures.
  }
}

function sanitizeText(value?: string | null): string {
  return (value || '').trim();
}

function normalizeLanguage(value?: string | null): string {
  return normalizeLocale(value || '');
}

export function needsEstonianTranslation(locale: string | null | undefined, sourceLang?: string | null): boolean {
  if (normalizeLocale(locale) !== 'et') return false;
  const normalizedSource = normalizeLanguage(sourceLang);
  if (!normalizedSource) return false;
  return normalizedSource !== 'et';
}

export async function buildTranslationHash(title?: string | null, body?: string | null): Promise<string> {
  const payload = `${sanitizeText(title)}\n\n${sanitizeText(body)}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  return payload;
}

export async function getNewsTranslationCacheKey(input: Pick<NewsTranslationInput, 'id' | 'title' | 'body'>): Promise<string> {
  const hash = await buildTranslationHash(input.title, input.body);
  return `${input.id}:${hash}`;
}

export function getCachedNewsTranslation(cacheKey: string): NewsTranslationResult | null {
  const cache = getCache();
  const entry = cache[cacheKey];
  if (!entry) return null;
  return { title_et: entry.title_et, body_et: entry.body_et };
}

function setCachedNewsTranslation(cacheKey: string, value: NewsTranslationResult): void {
  const cache = getCache();
  cache[cacheKey] = {
    ...value,
    updatedAt: Date.now(),
  };
  saveCache(cache);
}

async function fetchNewsTranslation(input: NewsTranslationInput): Promise<NewsTranslationResult | null> {
  const apiUrl = getApiUrl();
  if (!apiUrl) return null;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: input.id,
      title: sanitizeText(input.title),
      body: sanitizeText(input.body),
      target: 'et',
    }),
  });

  if (!response.ok) {
    throw new Error(`Translation request failed (${response.status})`);
  }

  const data = await response.json() as Partial<NewsTranslationResult>;
  const title_et = sanitizeText(data.title_et);
  const body_et = sanitizeText(data.body_et);
  if (!title_et && !body_et) {
    return null;
  }
  return { title_et, body_et };
}

export async function translateNewsItemToEstonian(input: NewsTranslationInput): Promise<NewsTranslationResult | null> {
  const cacheKey = await getNewsTranslationCacheKey(input);
  const cached = getCachedNewsTranslation(cacheKey);
  if (cached) return cached;

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const request = fetchNewsTranslation(input)
    .then((result) => {
      if (result) {
        setCachedNewsTranslation(cacheKey, result);
      }
      return result;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, request);
  return request;
}
