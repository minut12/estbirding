export interface ParsedRssItem {
  title?: string;
  link?: string;
  guid?: string;
  description?: string;
  summary?: string;
  content?: string;
  "content:encoded"?: string;
  pubDate?: string;
  isoDate?: string;
  published?: string;
  updated?: string;
  enclosure?: { url?: string; "@_url"?: string; type?: string; "@_type"?: string } | Array<{ url?: string; "@_url"?: string; type?: string; "@_type"?: string }>;
  enclosures?: Array<{ url?: string; "@_url"?: string; type?: string; "@_type"?: string }>;
  "media:content"?: { url?: string; "@_url"?: string; type?: string; "@_type"?: string } | Array<{ url?: string; "@_url"?: string; type?: string; "@_type"?: string }>;
  "media:content:list"?: Array<{ url?: string; "@_url"?: string; type?: string; "@_type"?: string }>;
  "media:thumbnail"?: { url?: string; "@_url"?: string } | Array<{ url?: string; "@_url"?: string }>;
  "media:thumbnail:list"?: Array<{ url?: string; "@_url"?: string }>;
  "itunes:image"?: { href?: string; "@_href"?: string };
  media?: { content?: { url?: string } };
  image?: { url?: string };
  _raw?: string;
}

export interface NormalizedRssItem {
  external_id: string | null;
  title: string;
  permalink_url: string | null;
  published_at: string | null;
  image_url: string | null;
  body: string;
  body_html: string;
  raw_json: ParsedRssItem;
  image_strategy?: string | null;
}

export function parseRss(xml: string): ParsedRssItem[] {
  const items: ParsedRssItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = (match[1] || match[2] || "").trim();
    const get = (tag: string): string => {
      const r = new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
        "i",
      );
      const m = block.match(r);
      return (m?.[1] || m?.[2] || "").trim();
    };

    let link = get("link");
    if (!link) {
      const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkMatch) link = linkMatch[1].trim();
    }

    const attr = (tag: string, name: string): string => {
      const m = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
      return (m?.[1] || "").trim();
    };
    const enclosureTags = Array.from(block.matchAll(/<enclosure\b[^>]*>/gi)).map((m) => m[0]);
    const mediaContentTags = Array.from(block.matchAll(/<media:content\b[^>]*>/gi)).map((m) => m[0]);
    const mediaThumbnailTags = Array.from(block.matchAll(/<media:thumbnail\b[^>]*>/gi)).map((m) => m[0]);
    const enclosureObjs = enclosureTags
      .map((t) => ({ url: attr(t, "url"), type: attr(t, "type") }))
      .filter((x) => x.url);
    const mediaContentObjs = mediaContentTags
      .map((t) => ({ url: attr(t, "url"), type: attr(t, "type") }))
      .filter((x) => x.url);
    const mediaThumbObjs = mediaThumbnailTags
      .map((t) => ({ url: attr(t, "url") }))
      .filter((x) => x.url);
    const imageTag = get("image");
    const imageUrlMatch = imageTag.match(/<url[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/url>/i);
    const imageUrl = (imageUrlMatch?.[1] || imageTag || "").trim() || undefined;

    items.push({
      title: get("title"),
      link,
      guid: get("guid") || get("id") || link || undefined,
      description: get("description"),
      summary: get("summary"),
      content: get("content"),
      "content:encoded": get("content:encoded"),
      pubDate: get("pubDate"),
      isoDate: get("isoDate"),
      published: get("published"),
      updated: get("updated"),
      enclosure: enclosureObjs[0] || undefined,
      enclosures: enclosureObjs.length > 0 ? enclosureObjs : undefined,
      "media:content": mediaContentObjs[0] || undefined,
      "media:content:list": mediaContentObjs.length > 0 ? mediaContentObjs : undefined,
      "media:thumbnail": mediaThumbObjs[0] || undefined,
      "media:thumbnail:list": mediaThumbObjs.length > 0 ? mediaThumbObjs : undefined,
      media: mediaContentObjs[0] ? { content: { url: mediaContentObjs[0].url } } : undefined,
      image: imageUrl ? { url: imageUrl } : undefined,
      _raw: block,
    });
  }

  return items;
}

export function normalizeRssItem(item: ParsedRssItem): NormalizedRssItem {
  const bodyHtml = item["content:encoded"] || item.content || item.description || item.summary || "";
  const bodyText = htmlToText(bodyHtml);
  const imageInfo = extractImageInfo(item, bodyHtml, item.link || undefined);
  const imageUrl = imageInfo.url;
  const titleText = htmlToText(item.title || "");
  const title = titleText || bodyText.slice(0, 80) || "Untitled";

  return {
    external_id: item.guid || item.link || null,
    title,
    permalink_url: item.link || null,
    published_at: item.isoDate || item.pubDate || item.published || item.updated || null,
    image_url: imageUrl,
    body: bodyText,
    body_html: bodyHtml,
    raw_json: item,
    image_strategy: imageInfo.strategy,
  };
}

export function extractImageUrl(item: ParsedRssItem, bodyHtml?: string, baseUrl?: string): string | null {
  return extractImageInfo(item, bodyHtml, baseUrl).url;
}

function extractImageInfo(
  item: ParsedRssItem,
  bodyHtml?: string,
  baseUrl?: string,
): { url: string | null; strategy: string | null } {
  const candidates: Array<{ url: string; strategy: string; rank: number }> = [];
  const addCandidate = (url: string | null, strategy: string) => {
    if (!url) return;
    candidates.push({ url, strategy, rank: scoreImageCandidate(url, baseUrl) });
  };

  addCandidate(getImageFromRssItem(item, bodyHtml, baseUrl, "media:content"), "media:content");
  addCandidate(getImageFromRssItem(item, bodyHtml, baseUrl, "media:thumbnail"), "media:thumbnail");
  addCandidate(getImageFromRssItem(item, bodyHtml, baseUrl, "enclosure"), "enclosure");

  const raw = String(item._raw || "");
  addCandidate(cleanImageCandidate(item["itunes:image"]?.href || item["itunes:image"]?.["@_href"] || findItunesImageFromRaw(raw), baseUrl), "itunes:image");

  const htmlCandidates = [bodyHtml, item["content:encoded"], item.content, item.description, item.summary];
  for (const html of htmlCandidates) {
    addCandidate(extractFirstImageUrl(html || "", baseUrl), "html:first-img");
  }

  addCandidate(cleanImageCandidate(item.image?.url, baseUrl), "image:url");

  if (candidates.length === 0) return { url: null, strategy: null };
  candidates.sort((a, b) => b.rank - a.rank);
  return { url: candidates[0].url, strategy: candidates[0].strategy };
}

function scoreImageCandidate(url: string, baseUrl?: string): number {
  let score = 10;
  const host = hostname(url);
  const baseHost = hostname(baseUrl || "");

  if (host.includes("rss.app") || host.includes("rss2.app")) score += 100;
  if (baseHost && host === baseHost) score += 80;
  if (host.endsWith(".eoy.ee") || host === "eoy.ee" || host.endsWith(".estbirding.ee")) score += 60;
  if (/fbcdn\.net|facebook\.com|scontent-|cdninstagram|fb\.com/i.test(host)) score -= 120;
  if (/\.svg($|\?)/i.test(url)) score -= 10;

  return score;
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getImageFromRssItem(
  item: ParsedRssItem,
  bodyHtml: string | undefined,
  baseUrl: string | undefined,
  mode: "media:content" | "enclosure" | "media:thumbnail" | "html",
): string | null {
  const pickUrl = (v: any): string | null => cleanImageCandidate(v?.url || v?.["@_url"] || null, baseUrl);
  const asArray = (v: any): any[] => Array.isArray(v) ? v : (v ? [v] : []);
  const isImageLike = (v: any): boolean => {
    const type = String(v?.type || v?.["@_type"] || "").toLowerCase();
    const url = String(v?.url || v?.["@_url"] || "");
    return type.startsWith("image/") || /\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(url);
  };

  if (mode === "media:content") {
    const candidates = [
      ...asArray(item["media:content"]),
      ...asArray(item["media:content:list"]),
      ...asArray(item.media?.content),
    ];
    for (const c of candidates) {
      if (!isImageLike(c)) continue;
      const maybe = pickUrl(c);
      if (maybe && /^https?:\/\//i.test(maybe)) return maybe;
    }
    const raw = String(item._raw || "");
    const rawMatch = cleanImageCandidate(findMediaContentFromRaw(raw), baseUrl);
    return rawMatch && /^https?:\/\//i.test(rawMatch) ? rawMatch : null;
  }

  if (mode === "enclosure") {
    const candidates = [
      ...asArray(item.enclosure),
      ...asArray(item.enclosures),
    ];
    for (const c of candidates) {
      if (!isImageLike(c)) continue;
      const maybe = pickUrl(c);
      if (maybe && /^https?:\/\//i.test(maybe)) return maybe;
    }
    const raw = String(item._raw || "");
    const rawMatch = cleanImageCandidate(findEnclosureFromRaw(raw), baseUrl);
    return rawMatch && /^https?:\/\//i.test(rawMatch) ? rawMatch : null;
  }

  if (mode === "media:thumbnail") {
    const candidates = [
      ...asArray(item["media:thumbnail"]),
      ...asArray(item["media:thumbnail:list"]),
    ];
    for (const c of candidates) {
      const maybe = pickUrl(c);
      if (maybe && /^https?:\/\//i.test(maybe)) return maybe;
    }
    const raw = String(item._raw || "");
    const rawMatch = cleanImageCandidate(findMediaThumbnailFromRaw(raw), baseUrl);
    return rawMatch && /^https?:\/\//i.test(rawMatch) ? rawMatch : null;
  }

  const htmlCandidates = [bodyHtml, item["content:encoded"], item.description];
  for (const html of htmlCandidates) {
    const maybe = extractFirstImageUrl(html || "", baseUrl);
    if (maybe && /^https?:\/\//i.test(maybe)) return maybe;
  }
  return null;
}

function decodeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.replaceAll("&amp;", "&").replaceAll("&#38;", "&");
}

function extractFirstImageUrl(html: string, baseUrl?: string): string | null {
  if (!html) return null;
  const imgTags = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  for (const imgTag of imgTags) {
    const directSrc = extractAttribute(imgTag, "src");
    const lazySrc = extractAttribute(imgTag, "data-src") || extractAttribute(imgTag, "data-original");
    const srcSet = extractSrcSetFirstUrl(extractAttribute(imgTag, "srcset"));
    const candidate = cleanImageCandidate(directSrc, baseUrl)
      || cleanImageCandidate(lazySrc, baseUrl)
      || cleanImageCandidate(srcSet, baseUrl);
    if (candidate && !isTrackingPixel(imgTag, candidate)) return candidate;
  }
  return null;
}

function extractAttribute(tag: string, attribute: string): string | null {
  const attrMatch = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return attrMatch?.[1] || null;
}

function extractSrcSetFirstUrl(srcset: string | null): string | null {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim();
  if (!first) return null;
  const url = first.split(/\s+/)[0]?.trim();
  return url || null;
}

function firstArrayUrl(items: Array<{ url?: string }> | undefined): string | null {
  if (!items || items.length === 0) return null;
  return items[0]?.url || null;
}

function cleanImageCandidate(value: string | undefined | null, baseUrl?: string): string | null {
  const cleaned = cleanUrl(value);
  if (!cleaned) return null;
  return normalizeUrl(cleaned, baseUrl);
}

function cleanUrl(value: string | undefined | null): string | null {
  const trimmed = decodeUrl(value)?.trim();
  return trimmed ? trimmed : null;
}

function normalizeUrl(url: string, baseUrl?: string): string {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
  if (!baseUrl) return raw;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function isTrackingPixel(imgTag: string, src: string): boolean {
  const lower = String(src || "").toLowerCase();
  if (lower.includes("pixel") || lower.includes("spacer") || lower.includes("tracking")) return true;
  const width = Number.parseInt(extractAttribute(imgTag, "width") || "0", 10);
  const height = Number.parseInt(extractAttribute(imgTag, "height") || "0", 10);
  if ((width > 0 && width <= 2) || (height > 0 && height <= 2)) return true;
  return false;
}

function findEnclosureFromRaw(raw: string): string | null {
  if (!raw) return null;
  const matches = Array.from(raw.matchAll(/<enclosure\b[^>]*>/gi));
  for (const m of matches) {
    const tag = m[0];
    const type = (extractAttribute(tag, "type") || "").toLowerCase();
    const url = extractAttribute(tag, "url");
    if (!url) continue;
    if (type.startsWith("image/")) return url;
    if (/\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(url)) return url;
  }
  return null;
}

function findMediaContentFromRaw(raw: string): string | null {
  if (!raw) return null;
  const matches = Array.from(raw.matchAll(/<media:content\b[^>]*>/gi));
  for (const m of matches) {
    const tag = m[0];
    const type = (extractAttribute(tag, "type") || "").toLowerCase();
    const url = extractAttribute(tag, "url");
    if (!url) continue;
    const imageByExt = /\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(url);
    if (type.startsWith("image/") || imageByExt) return url;
  }
  return null;
}

function findMediaThumbnailFromRaw(raw: string): string | null {
  if (!raw) return null;
  const tag = raw.match(/<media:thumbnail\b[^>]*>/i)?.[0];
  return tag ? extractAttribute(tag, "url") : null;
}

function findItunesImageFromRaw(raw: string): string | null {
  if (!raw) return null;
  const tag = raw.match(/<itunes:image\b[^>]*>/i)?.[0];
  return tag ? extractAttribute(tag, "href") : null;
}

function htmlToText(html: string): string {
  if (!html) return "";
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const noTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(noTags).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    "#39": "'",
  };

  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in named) return named[lower];
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isNaN(code) ? `&${entity};` : String.fromCodePoint(code);
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isNaN(code) ? `&${entity};` : String.fromCodePoint(code);
    }
    return `&${entity};`;
  });
}
