const SUPABASE_URL_OVERRIDE_KEY = "dev_supabase_url_override";
const SUPABASE_KEY_OVERRIDE_KEY = "dev_supabase_key_override";
const SUPABASE_LEGACY_ANON_OVERRIDE_KEY = "dev_supabase_anon_key_override";

function getLocalStorageValue(key: string): string {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(key) || "").trim();
}

function firstNonEmpty(values: Array<unknown>): string | null {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function resolveSupabaseUrl(): string | null {
  return firstNonEmpty([
    getLocalStorageValue(SUPABASE_URL_OVERRIDE_KEY),
    import.meta.env.VITE_SUPABASE_URL,
  ]);
}

export function resolveSupabaseKey(): string | null {
  return firstNonEmpty([
    getLocalStorageValue(SUPABASE_KEY_OVERRIDE_KEY),
    getLocalStorageValue(SUPABASE_LEGACY_ANON_OVERRIDE_KEY),
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    import.meta.env.VITE_SUPABASE_KEY,
  ]);
}

export function validateSupabaseConfig(): {
  ok: boolean;
  url?: string;
  key?: string;
  error?: string;
} {
  const url = resolveSupabaseUrl();
  const key = resolveSupabaseKey();

  if (!url) return { ok: false, error: "Supabase URL puudub (VITE_SUPABASE_URL)." };
  if (!url.startsWith("https://")) {
    return { ok: false, error: `Supabase URL vigane: peab algama https:// (${url})` };
  }
  if (!url.includes(".supabase.co")) {
    return { ok: false, error: `Supabase URL vigane: peab sisaldama .supabase.co (${url})` };
  }
  if (!key || key.length <= 20) {
    return {
      ok: false,
      error: "Supabase key puudub/vigane (VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_KEY).",
    };
  }

  return { ok: true, url, key };
}

export {
  SUPABASE_KEY_OVERRIDE_KEY,
  SUPABASE_LEGACY_ANON_OVERRIDE_KEY,
  SUPABASE_URL_OVERRIDE_KEY,
};
