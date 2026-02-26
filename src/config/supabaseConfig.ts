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
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
}

export function getSupabaseUrl(): string {
  const override = getLocalStorageValue(SUPABASE_URL_OVERRIDE_KEY);
  return override || getEnvUrl();
}

export function getSupabaseAnonKey(): string {
  const override = getLocalStorageValue(SUPABASE_ANON_KEY_OVERRIDE_KEY);
  return override || getEnvAnonKey();
}

export function getFunctionsBaseUrl(): string {
  const url = getSupabaseUrl().replace(/\/+$/, "");
  return `${url}/functions/v1`;
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
