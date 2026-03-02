const KEY = "estbirding.proxyBase";
const LS_RESOLVED_PROXY_BASE = "resolved_proxy_base_v1";
export const PROXY_ENDPOINT_UPDATED_EVENT = "proxy-endpoint-updated";
export const FALLBACK_PROXY_BASE = "https://api.allorigins.win/raw?url=";

function storeResolvedProxyBase(v: string): void {
  try {
    const s = String(v || "").trim();
    if (s) localStorage.setItem(LS_RESOLVED_PROXY_BASE, s);
  } catch {
    // Ignore storage failures.
  }
}

function normalizeProxyBase(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return trimmed;
}

function buildDefaultSupabaseProxyBase(): string {
  const supabaseUrl = String((import.meta as any).env?.VITE_SUPABASE_URL || "").trim();
  if (!supabaseUrl) return "";
  try {
    const u = new URL(supabaseUrl);
    return `${u.origin}/functions/v1/proxy?url=`;
  } catch {
    return "";
  }
}

export function getStoredProxyBase(): string {
  return (localStorage.getItem(KEY) || "").trim();
}

export function setStoredProxyBase(value: string): void {
  const normalized = normalizeProxyBase(value);
  localStorage.setItem(KEY, normalized);
  window.dispatchEvent(new Event(PROXY_ENDPOINT_UPDATED_EVENT));
}

export function getEnvProxyBase(): string {
  return normalizeProxyBase(String((import.meta as any).env?.VITE_PROXY_BASE || "").trim());
}

export function getDefaultProxyBase(): string {
  return getEnvProxyBase() || buildDefaultSupabaseProxyBase() || FALLBACK_PROXY_BASE;
}

export function resolveProxyBase(currentInput?: string): string {
  const raw = String(currentInput || "").trim() || getStoredProxyBase() || getDefaultProxyBase();
  const resolved = normalizeProxyBase(raw);
  storeResolvedProxyBase(resolved);
  return resolved;
}

export function buildProxyUrl(targetUrl: string, baseOverride?: string): string {
  const base = resolveProxyBase(baseOverride);
  const encodedTarget = encodeURIComponent(String(targetUrl || "").trim());
  if (!base) return String(targetUrl || "").trim();
  if (base.includes("{url}")) return base.replace("{url}", encodedTarget);
  if (/[?&]url=/.test(base)) return `${base}${encodedTarget}`;
  return `${base}?url=${encodedTarget}`;
}

export function getProxyMode(base?: string): "supabase" | "fallback" | "custom" | "none" {
  const resolved = String(base || resolveProxyBase()).trim();
  if (!resolved) return "none";
  if (resolved.includes("/functions/v1/proxy")) return "supabase";
  if (resolved.includes("allorigins.win")) return "fallback";
  return "custom";
}
