const KEY = "estbirding.proxyBase";
export const PROXY_ENDPOINT_UPDATED_EVENT = "proxy-endpoint-updated";
export const DEFAULT_SUPABASE_PROXY_BASE = "https://eenwcyuyugyrjgpivxrq.supabase.co/functions/v1/proxy?url=";
export const FALLBACK_PROXY_BASE = "https://api.allorigins.win/raw?url=";

function normalizeProxyBase(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("{url}")) return trimmed;
  if (trimmed.includes("?url=") || trimmed.includes("&url=")) return trimmed;
  if (trimmed.endsWith("/proxy")) return `${trimmed}?url=`;
  if (trimmed.endsWith("/proxy/")) return `${trimmed}?url=`;
  return trimmed.endsWith("/") ? `${trimmed}?url=` : `${trimmed}/?url=`;
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
  return getEnvProxyBase() || buildDefaultSupabaseProxyBase() || DEFAULT_SUPABASE_PROXY_BASE || FALLBACK_PROXY_BASE;
}

export function resolveProxyBase(currentInput?: string): string {
  const raw = String(currentInput || "").trim() || getStoredProxyBase() || getDefaultProxyBase();
  return normalizeProxyBase(raw);
}

export function buildProxyUrl(targetUrl: string, baseOverride?: string): string {
  const base = resolveProxyBase(baseOverride);
  const encodedTarget = encodeURIComponent(String(targetUrl || "").trim());
  if (!base) return String(targetUrl || "").trim();
  if (base.includes("{url}")) return base.replace("{url}", encodedTarget);
  return `${base}${encodedTarget}`;
}

export function getProxyMode(base?: string): "supabase" | "fallback" | "custom" | "none" {
  const resolved = String(base || resolveProxyBase()).trim();
  if (!resolved) return "none";
  if (resolved.includes("/functions/v1/proxy")) return "supabase";
  if (resolved.includes("allorigins.win")) return "fallback";
  return "custom";
}
