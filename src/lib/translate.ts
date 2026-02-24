export interface TranslationRequest {
  id: string;
  title: string;
  body: string;
}

export interface TranslationResponse {
  title_et: string;
  body_et: string;
}

const STORAGE_PREFIX = 'tr_et:';
const inFlight = new Map<string, Promise<TranslationResponse | null>>();
let warnedMissingEndpoint = false;

function getTranslateApiUrl(): string {
  const env = import.meta.env as ImportMetaEnv & {
    TRANSLATE_API_URL?: string;
    VITE_TRANSLATE_API_URL?: string;
  };
  return String(env.VITE_TRANSLATE_API_URL || env.TRANSLATE_API_URL || '').trim();
}

function lightweightHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

export async function hash(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((n) => n.toString(16).padStart(2, '0')).join('');
  }
  return lightweightHash(text);
}

function cacheKey(id: string, digest: string): string {
  return `${STORAGE_PREFIX}${id}:${digest}`;
}

function readCache(key: string): TranslationResponse | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TranslationResponse>;
    return {
      title_et: String(parsed.title_et || ''),
      body_et: String(parsed.body_et || ''),
    };
  } catch {
    return null;
  }
}

function writeCache(key: string, value: TranslationResponse): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota and serialization errors.
  }
}

export async function translateToEstonian(input: TranslationRequest): Promise<TranslationResponse | null> {
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  const digest = await hash(`${title}\n\n${body}`);
  const key = cacheKey(input.id, digest);

  const cached = readCache(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const endpoint = getTranslateApiUrl();
  if (!endpoint) {
    if (!warnedMissingEndpoint && typeof console !== 'undefined') {
      console.warn('[translate] Missing TRANSLATE_API_URL / VITE_TRANSLATE_API_URL');
      warnedMissingEndpoint = true;
    }
    return null;
  }

  const request = fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: input.id,
      title,
      body,
    }),
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const payload = await res.json() as Partial<TranslationResponse>;
      const out = {
        title_et: String(payload.title_et || ''),
        body_et: String(payload.body_et || ''),
      };
      writeCache(key, out);
      return out;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}
