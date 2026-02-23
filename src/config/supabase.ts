const rawSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const rawSupabaseAnonKey = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
).trim();

const isLocalUrl = /(^https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(rawSupabaseUrl);
const isHttpsUrl = rawSupabaseUrl.startsWith("https://");
const includesSupabaseHost = rawSupabaseUrl.includes(".supabase.co");
const hasAnonKey = rawSupabaseAnonKey.length > 20;

let configError: string | null = null;
if (!rawSupabaseUrl || isLocalUrl) {
  configError = "Supabase URL is not set for mobile build. Check environment variables.";
} else if (!isHttpsUrl || !includesSupabaseHost) {
  configError = "Supabase URL must be https://<project-ref>.supabase.co";
} else if (!hasAnonKey) {
  configError = "Supabase anon key is missing or invalid.";
}

if (import.meta.env.DEV) {
  // Dev-only diagnostics for runtime env resolution issues in mobile/web builds.
  console.info("[SUPABASE CONFIG] url=", rawSupabaseUrl || "(empty)");
  console.info("[SUPABASE CONFIG] url_valid=", isHttpsUrl && includesSupabaseHost && !isLocalUrl);
  console.info("[SUPABASE CONFIG] key_present=", rawSupabaseAnonKey.length > 0, "key_len=", rawSupabaseAnonKey.length);
}

export const SUPABASE_URL = rawSupabaseUrl || "https://invalid.supabase.co";
export const SUPABASE_ANON_KEY = rawSupabaseAnonKey || "invalid-anon-key-placeholder";
export const SUPABASE_CONFIG_ERROR = configError;

