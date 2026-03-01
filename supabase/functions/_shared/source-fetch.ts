import { normalizeRssItem, parseRss, type NormalizedRssItem } from "./rss-normalize.ts";

export interface FetchSourceInput {
  id?: string;
  slug?: string;
  name?: string;
  source_key?: string;
  key?: string;
  kind?: string;
  type?: string;
  feed_url?: string;
  url?: string;
}

export class SourceFetchError extends Error {
  status?: number;
  sourceName: string;
  details?: Record<string, unknown>;

  constructor(sourceName: string, message: string, status?: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "SourceFetchError";
    this.sourceName = sourceName;
    this.status = status;
    this.details = details;
  }
}

export function normalizeSourceUrl(url: string): string {
  const trimmed = String(url || "").trim();
  const feedMatch = trimmed.match(/^https?:\/\/rss\.app\/feed\/([A-Za-z0-9_-]+)\/?$/);
  if (feedMatch) {
    return `https://rss.app/feeds/${feedMatch[1]}.xml`;
  }

  const feedsMatch = trimmed.match(/^https?:\/\/rss\.app\/feeds\/([A-Za-z0-9_-]+)\/?$/);
  if (feedsMatch) {
    return `https://rss.app/feeds/${feedsMatch[1]}.xml`;
  }

  return trimmed.replace(/(\.(?:xml|rss|atom|json))(\/+)(?=$|[?#])/i, "$1");
}

function resolveSourceName(source: FetchSourceInput): string {
  return String(source.name || source.slug || source.id || source.source_key || source.key || "unknown").trim() || "unknown";
}

function buildProxyUrl(targetUrl: string, proxyBase: string): string {
  const base = String(proxyBase || "").trim();
  if (!base) return targetUrl;
  const encoded = encodeURIComponent(targetUrl);
  if (base.includes("{url}")) return base.replace("{url}", encoded);
  if (/[?&]url=/.test(base)) return `${base}${encoded}`;
  return `${base}?url=${encoded}`;
}

type RssFetchResult = {
  ok: boolean;
  text: string;
  viaProxy: boolean;
  status: number;
  contentType: string;
  blocked: boolean;
  bodySnippet: string;
  finalUrl: string;
};

function looksLikeHtmlChallenge(contentType: string, body: string): boolean {
  const sample = String(body || "").slice(0, 400).toLowerCase();
  const ct = String(contentType || "").toLowerCase();
  return ct.includes("text/html")
    || sample.startsWith("<!doctype html")
    || sample.includes("cf_chl")
    || sample.includes("captcha");
}

function bodySnippet(body: string): string {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const DESKTOP_UA_RETRY = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

function makeBrowserHeaders(targetUrl: string, extra: Record<string, string> = {}): Record<string, string> {
  const isRssApp = /(^|\.)rss\.app$/i.test((() => {
    try { return new URL(targetUrl).hostname; } catch { return ""; }
  })());
  return {
    "user-agent": BROWSER_UA,
    "accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    ...(isRssApp ? { "referer": "https://rss.app/", "origin": "https://rss.app" } : {}),
    ...extra,
  };
}

async function fetchRssText(url: string, proxyBase = ""): Promise<RssFetchResult> {
  const mobileHeaders = makeBrowserHeaders(url);
  const desktopHeaders = {
    ...makeBrowserHeaders(url),
    "user-agent": DESKTOP_UA_RETRY,
  };

  const fetchDirect = async (targetUrl: string): Promise<RssFetchResult> => {
    let direct = await fetch(targetUrl, { method: "GET", headers: mobileHeaders, redirect: "follow" });
    if (!direct.ok && /rss\.app\/feeds\//i.test(targetUrl) && (direct.status === 403 || direct.status === 404)) {
      direct = await fetch(targetUrl, { method: "GET", headers: desktopHeaders, redirect: "follow" });
    }
    const directText = await direct.text();
    const directType = String(direct.headers.get("content-type") || "");
    const directBlocked = looksLikeHtmlChallenge(directType, directText);
    return {
      ok: direct.ok && !directBlocked,
      text: directText,
      viaProxy: false,
      status: direct.status,
      contentType: directType,
      blocked: directBlocked,
      bodySnippet: bodySnippet(directText),
      finalUrl: targetUrl,
    };
  };

  let directResult = await fetchDirect(url);
  if (directResult.status === 404 && /\/$/.test(url)) {
    directResult = await fetchDirect(url.replace(/\/+$/, ""));
  }
  if (directResult.ok) return directResult;
  if (!proxyBase) return directResult;

  const fetchViaProxy = async (targetUrl: string): Promise<RssFetchResult> => {
    const proxiedUrl = buildProxyUrl(targetUrl, proxyBase);
    const proxied = await fetch(proxiedUrl, { method: "GET", headers: mobileHeaders, redirect: "follow" });
    const proxiedText = await proxied.text();
    const proxiedType = String(proxied.headers.get("content-type") || "");
    const proxiedBlocked = looksLikeHtmlChallenge(proxiedType, proxiedText);
    return {
      ok: proxied.ok && !proxiedBlocked,
      text: proxiedText,
      viaProxy: true,
      status: proxied.status,
      contentType: proxiedType,
      blocked: proxiedBlocked,
      bodySnippet: bodySnippet(proxiedText),
      finalUrl: proxiedUrl,
    };
  };

  let proxiedResult = await fetchViaProxy(url);
  if (proxiedResult.status === 404 && /\/$/.test(url)) {
    proxiedResult = await fetchViaProxy(url.replace(/\/+$/, ""));
  }
  if (!proxiedResult.ok) {
    console.error("[source-fetch] RSS fetch failed", {
      targetUrl: url,
      finalUrl: proxiedResult.finalUrl,
      status: proxiedResult.status,
      snippet: proxiedResult.bodySnippet.slice(0, 200),
    });
  }
  return proxiedResult;
}

function normalizeUrl(url: string, baseUrl: string): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function extractMetaImage(html: string, pageUrl: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i);
  if (og?.[1]) return normalizeUrl(og[1], pageUrl);

  const tw = html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i);
  if (tw?.[1]) return normalizeUrl(tw[1], pageUrl);
  return null;
}

async function enrichMissingImages(items: NormalizedRssItem[], proxyBase: string): Promise<NormalizedRssItem[]> {
  const cache = new Map<string, string | null>();
  const out: NormalizedRssItem[] = [];

  for (const item of items) {
    if (item.image_url) {
      out.push(item);
      continue;
    }
    const link = String(item.permalink_url || "").trim();
    if (!link) {
      out.push(item);
      continue;
    }
    if (cache.has(link)) {
      out.push({ ...item, image_url: cache.get(link) || null });
      continue;
    }
    try {
      const target = buildProxyUrl(link, proxyBase);
      const res = await fetch(target, {
        headers: { "User-Agent": "EstBirding/1.0", "Accept": "text/html,application/xhtml+xml,*/*" },
      });
      if (!res.ok) {
        cache.set(link, null);
        out.push(item);
        continue;
      }
      const html = await res.text();
      const metaImg = extractMetaImage(html, link);
      cache.set(link, metaImg);
      out.push(metaImg ? { ...item, image_url: metaImg } : item);
    } catch {
      cache.set(link, null);
      out.push(item);
    }
  }
  return out;
}

export async function fetchSourceItems(source: FetchSourceInput, proxyBase = ""): Promise<NormalizedRssItem[]> {
  const kind = String(source.kind || source.type || "rss").toLowerCase();
  const sourceName = resolveSourceName(source);
  if (kind !== "rss") {
    throw new SourceFetchError(sourceName, `${sourceName}: unsupported source kind \"${kind}\"`);
  }

  const sourceUrl = normalizeSourceUrl(String(source.feed_url || source.url || ""));
  if (!sourceUrl) {
    throw new SourceFetchError(sourceName, `${sourceName}: missing feed url`);
  }

  const fetched = await fetchRssText(sourceUrl, proxyBase);
  if (!fetched.ok) {
    if (fetched.status >= 400) {
      console.error("[source-fetch] feed HTTP failure", {
        source: sourceName,
        finalUrl: fetched.finalUrl,
        status: fetched.status,
        snippet: fetched.bodySnippet,
      });
    }
    const message = fetched.blocked
      ? `${sourceName}: Feed blocked / returned HTML challenge`
      : `${sourceName}: HTTP ${fetched.status}`;
    throw new SourceFetchError(sourceName, message, fetched.status, {
      source: sourceName,
      status: fetched.status,
      contentType: fetched.contentType,
      bodySnippet: fetched.bodySnippet,
      viaProxy: fetched.viaProxy,
      blocked: fetched.blocked,
      finalUrl: fetched.finalUrl,
      snippet: fetched.bodySnippet,
    });
  }

  const xml = fetched.text;
  try {
    const normalized = parseRss(xml).map(normalizeRssItem);
    if (normalized.length === 0 && proxyBase && !fetched.viaProxy) {
      const proxyRetry = await fetchRssText(sourceUrl, proxyBase);
      if (proxyRetry.ok) {
        const retried = parseRss(proxyRetry.text).map(normalizeRssItem);
        return await enrichMissingImages(retried, proxyBase);
      }
    }
    if (/birding poland|facebook_birdingpoland/i.test(sourceName) && normalized.length > 0) {
      normalized.slice(0, 3).forEach((s) => {
        const raw = (s.raw_json || {}) as Record<string, unknown>;
        console.log("[birding-poland:image-debug]", {
          title: s.title || null,
          link: s.permalink_url || raw.link || null,
          extractedImageUrl: s.image_url || null,
          strategy: s.image_strategy || null,
        });
      });
    }
    return await enrichMissingImages(normalized, proxyBase);
  } catch {
    throw new SourceFetchError(sourceName, `${sourceName}: RSS parse error`, fetched.status, {
      source: sourceName,
      status: fetched.status,
      contentType: fetched.contentType,
      bodySnippet: fetched.bodySnippet,
      viaProxy: fetched.viaProxy,
      finalUrl: fetched.finalUrl,
      snippet: fetched.bodySnippet,
    });
  }
}

const SOURCE_URL_NORMALIZATION_CHECK = "https://rss.app/feeds/75MPfQwrc0XNIjzd.xml";
if (normalizeSourceUrl(` ${SOURCE_URL_NORMALIZATION_CHECK} `) !== SOURCE_URL_NORMALIZATION_CHECK) {
  console.error("[source-fetch] normalizeSourceUrl check failed for Birding Poland URL");
}
