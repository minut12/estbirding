import { buildProxyUrl, resolveProxyBase } from "@/config/proxyEndpoint";

type NewsImageItem = {
  display_image_url?: string | null;
  cached_image_url?: string | null;
  image_url?: string | null;
};

function cleanUrl(value: string | null | undefined): string {
  return String(value || "").trim();
}

function normalizeProxyBase(base?: string): string {
  const resolved = cleanUrl(base || resolveProxyBase());
  if (!resolved) return "";
  if (/[?&]url=/.test(resolved) || resolved.includes("{url}")) return resolved;
  if (resolved.includes("?")) return `${resolved}&url=`;
  return `${resolved}?url=`;
}

export function getProxyBase(): string {
  return normalizeProxyBase(resolveProxyBase());
}

export function getProxiedImageUrl(url: string | null | undefined, proxyBase?: string): string {
  const clean = cleanUrl(url);
  if (!clean) return "";
  const base = normalizeProxyBase(proxyBase);
  if (!base) return clean;
  return buildProxyUrl(clean, base);
}

export function isProxiedImageUrl(url: string | null | undefined, proxyBase?: string): boolean {
  const clean = cleanUrl(url);
  if (!clean) return false;
  const base = normalizeProxyBase(proxyBase);
  if (!base) return false;
  return clean.startsWith(base) || clean.includes("/functions/v1/proxy?url=");
}

export function getNewsImageSrc(item: NewsImageItem, proxyBase?: string): string {
  const display = cleanUrl(item.display_image_url);
  const cached = cleanUrl(item.cached_image_url);
  const image = cleanUrl(item.image_url);
  if (display) return display;
  if (image) return getProxiedImageUrl(image, proxyBase);
  return cached || image || "";
}

