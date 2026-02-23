type AnyRecord = Record<string, unknown>;

function getImportMetaEnv(): AnyRecord {
  try {
    return ((import.meta as unknown as { env?: AnyRecord })?.env || {}) as AnyRecord;
  } catch {
    return {};
  }
}

function getProcessEnv(): AnyRecord {
  try {
    // eslint-disable-next-line no-undef
    return (typeof process !== "undefined" ? ((process as unknown as { env?: AnyRecord }).env || {}) : {}) as AnyRecord;
  } catch {
    return {};
  }
}

function pickString(values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function sanitizeSupabaseUrl(rawValue: string): string {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  parsed.hostname = parsed.hostname.replace(/\.+$/, "");
  const cleaned = parsed.toString().replace(/\/+$/, "");
  return cleaned;
}

const importMetaEnv = getImportMetaEnv();
const processEnv = getProcessEnv();

// Resolution order: Vite -> Next -> Expo
const resolvedUrlRaw = pickString([
  importMetaEnv.VITE_SUPABASE_URL,
  processEnv.VITE_SUPABASE_URL,
  processEnv.NEXT_PUBLIC_SUPABASE_URL,
  processEnv.EXPO_PUBLIC_SUPABASE_URL,
]);
const resolvedUrl = sanitizeSupabaseUrl(resolvedUrlRaw);

const resolvedAnonKey = pickString([
  importMetaEnv.VITE_SUPABASE_ANON_KEY,
  importMetaEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  processEnv.VITE_SUPABASE_ANON_KEY,
  processEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
  processEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  processEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY,
]);

const isHttps = resolvedUrl.startsWith("https://");
const hasSupabaseHost = resolvedUrl.includes(".supabase.co");
const hasAnonKey = resolvedAnonKey.length > 20;

let hostname = "";
try {
  hostname = resolvedUrl ? new URL(resolvedUrl).hostname.toLowerCase() : "";
} catch {
  hostname = "";
}

const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
const isCustomDomainAllowed = isHttps && !!hostname && !isLocalHost;
const hasTrailingDotHostname = /\.$/.test(hostname);

const isValidUrl = Boolean(
  resolvedUrl &&
  isHttps &&
  !hasTrailingDotHostname &&
  !isLocalHost &&
  (hasSupabaseHost || isCustomDomainAllowed),
);

if (import.meta.env.DEV) {
  console.info("[SUPABASE ENV] SUPABASE_URL=", resolvedUrl || "(empty)");
  console.info("[SUPABASE ENV] URL startsWith https:// =", isHttps);
  console.info("[SUPABASE ENV] URL includes .supabase.co =", hasSupabaseHost);
  console.info("[SUPABASE ENV] ANON key present =", resolvedAnonKey.length > 0, "len=", resolvedAnonKey.length);
}

export const SUPABASE_URL = resolvedUrl;
export const SUPABASE_ANON_KEY = resolvedAnonKey;
export const SUPABASE_ANON_KEY_PRESENT = hasAnonKey;

let errorReason = "";
if (!resolvedUrl) errorReason = "missing url";
else if (!isHttps) errorReason = "url is not https";
else if (hasTrailingDotHostname) errorReason = "hostname ends with '.'";
else if (isLocalHost) errorReason = "localhost url is not allowed for mobile/cloud build";
else if (!(hasSupabaseHost || isCustomDomainAllowed)) errorReason = "invalid hostname";
else if (!hasAnonKey) errorReason = "anon key missing/invalid";

export const SUPABASE_ENV_ERROR = (!isValidUrl || !hasAnonKey)
  ? `Supabase URL/Key missing or invalid in this build (${errorReason}). SUPABASE_URL=${resolvedUrl || "(empty)"}`
  : null;

if (SUPABASE_ENV_ERROR) {
  throw new Error(SUPABASE_ENV_ERROR);
}
