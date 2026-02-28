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

  constructor(sourceName: string, message: string, status?: number) {
    super(message);
    this.name = "SourceFetchError";
    this.sourceName = sourceName;
    this.status = status;
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

  return trimmed;
}

function resolveSourceName(source: FetchSourceInput): string {
  return String(source.name || source.slug || source.id || source.source_key || source.key || "unknown").trim() || "unknown";
}

function buildProxyUrl(targetUrl: string, proxyBase: string): string {
  if (!proxyBase) return targetUrl;
  const encoded = encodeURIComponent(targetUrl);
  if (proxyBase.includes("{url}")) return proxyBase.replace("{url}", encoded);
  return `${proxyBase}${encoded}`;
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

  const targetUrl = buildProxyUrl(sourceUrl, proxyBase);
  const response = await fetch(targetUrl, {
    headers: { "User-Agent": "EstBirding/1.0", "Accept": "application/rss+xml, application/xml, text/xml, */*" },
  });

  if (!response.ok) {
    throw new SourceFetchError(sourceName, `${sourceName}: HTTP ${response.status}`, response.status);
  }

  const xml = await response.text();
  try {
    const normalized = parseRss(xml).map(normalizeRssItem);
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
    throw new SourceFetchError(sourceName, `${sourceName}: RSS parse error`);
  }
}
