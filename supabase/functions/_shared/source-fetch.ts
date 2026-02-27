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
    return parseRss(xml).map(normalizeRssItem);
  } catch {
    throw new SourceFetchError(sourceName, `${sourceName}: RSS parse error`);
  }
}
