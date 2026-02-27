const SUPABASE_URL_OVERRIDE_KEY = "dev_supabase_url_override";
const SUPABASE_ANON_KEY_OVERRIDE_KEY = "dev_supabase_anon_key_override";

function getLocalStorageValue(key: string): string {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(key) || "").trim();
}

function getEnvUrl(): string {
  return String(import.meta.env.VITE_SUPABASE_URL || "").trim();
}

function getEnvAnonKey(): string {
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
}

export function getSupabaseUrl(): string {
  const override = getLocalStorageValue(SUPABASE_URL_OVERRIDE_KEY);
  return override || getEnvUrl();
}

export function getSupabaseAnonKey(): string {
  const override = getLocalStorageValue(SUPABASE_ANON_KEY_OVERRIDE_KEY);
  return override || getEnvAnonKey();
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function isSupabaseHttpUrl(url: string): boolean {
  const input = String(url || "").trim();
  if (!input) return false;
  try {
    const parsed = new URL(input);
    return parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function getSupabaseAuthHeaders(): Record<string, string> {
  const anon = getSupabaseAnonKey();
  if (!anon) {
    throw new Error("Supabase anon key missing (check VITE_SUPABASE_ANON_KEY)");
  }
  return {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
  };
}

export function getSupabaseAuthHeadersForUrl(url: string): Record<string, string> {
  return isSupabaseHttpUrl(url) ? getSupabaseAuthHeaders() : {};
}

export async function supabaseFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = resolveRequestUrl(input);
  const authHeaders = getSupabaseAuthHeadersForUrl(url);
  const mergedHeaders = new Headers(init.headers || {});
  for (const [key, value] of Object.entries(authHeaders)) {
    mergedHeaders.set(key, value);
  }
  return fetch(input, { ...init, headers: mergedHeaders });
}

export function getFunctionsBaseUrl(): string {
  const url = getSupabaseUrl().replace(/\/+$/, "");
  return `${url}/functions/v1`;
}

export function broadcastSupabaseConfigToMapIframes(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();
  const targetOrigin = window.location.origin;
  const iframes = Array.from(
    document.querySelectorAll('iframe[data-map-iframe="true"]'),
  ) as HTMLIFrameElement[];

  for (const iframe of iframes) {
    if (!iframe.contentWindow) continue;
    try {
      iframe.contentWindow.postMessage(
        { type: "SUPABASE_CONFIG", supabaseUrl, supabaseAnonKey },
        targetOrigin,
      );
      iframe.contentWindow.postMessage({ type: "MAP_PING" }, targetOrigin);
    } catch {
      // no-op: iframe may be unloading
    }
  }
}

export function validateSupabaseConfig(): { ok: boolean; error?: string; url?: string } {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (!url) return { ok: false, error: "Supabase URL puudub (VITE_SUPABASE_URL).", url };
  if (!url.startsWith("https://")) return { ok: false, error: `Supabase URL vigane: peab algama https:// (${url})`, url };
  if (!url.includes(".supabase.co")) return { ok: false, error: `Supabase URL vigane: peab sisaldama .supabase.co (${url})`, url };
  if (!key || key.length <= 20) return { ok: false, error: "Supabase anon key puudub/vigane (VITE_SUPABASE_ANON_KEY).", url };

  return { ok: true, url };
}

export {
  SUPABASE_URL_OVERRIDE_KEY,
  SUPABASE_ANON_KEY_OVERRIDE_KEY,
};
