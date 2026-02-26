import {
  resolveSupabaseKey,
  resolveSupabaseUrl,
  SUPABASE_KEY_OVERRIDE_KEY,
  SUPABASE_LEGACY_ANON_OVERRIDE_KEY,
  SUPABASE_URL_OVERRIDE_KEY,
  validateSupabaseConfig as validateSupabaseConfigBase,
} from "@/integrations/supabase/config";

const SUPABASE_ANON_KEY_OVERRIDE_KEY = SUPABASE_LEGACY_ANON_OVERRIDE_KEY;

export function getSupabaseUrl(): string {
  return resolveSupabaseUrl() || "";
}

export function getSupabaseAnonKey(): string {
  return resolveSupabaseKey() || "";
}

export function getFunctionsBaseUrl(): string {
  const url = getSupabaseUrl().replace(/\/+$/, "");
  return `${url}/functions/v1`;
}

export function validateSupabaseConfig(): { ok: boolean; error?: string; url?: string } {
  const validation = validateSupabaseConfigBase();
  if (!validation.ok) return { ok: false, error: validation.error, url: validation.url };
  return { ok: true, url: validation.url };
}

export {
  SUPABASE_KEY_OVERRIDE_KEY,
  SUPABASE_URL_OVERRIDE_KEY,
  SUPABASE_ANON_KEY_OVERRIDE_KEY,
};
