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
  enclosure?: { url?: string };
  enclosures?: Array<{ url?: string }>;
  "media:content"?: { url?: string };
  "media:content:list"?: Array<{ url?: string }>;
  "media:thumbnail"?: { url?: string };
  "media:thumbnail:list"?: Array<{ url?: string }>;
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

    const enclosureMatches = Array.from(block.matchAll(/<enclosure[^>]+url=["']([^"']+)["']/gi));
    const mediaContentMatches = Array.from(block.matchAll(/<media:content[^>]+url=["']([^"']+)["']/gi));
    const mediaThumbnailMatches = Array.from(block.matchAll(/<media:thumbnail[^>]+url=["']([^"']+)["']/gi));
    const enclosureMatch = enclosureMatches[0];
    const mediaContentMatch = mediaContentMatches[0];
    const mediaThumbnailMatch = mediaThumbnailMatches[0];
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
      enclosure: enclosureMatch ? { url: enclosureMatch[1] } : undefined,
      enclosures: enclosureMatches.length > 0
        ? enclosureMatches.map((m) => ({ url: m[1] }))
        : undefined,
      "media:content": mediaContentMatch ? { url: mediaContentMatch[1] } : undefined,
      "media:content:list": mediaContentMatches.length > 0
        ? mediaContentMatches.map((m) => ({ url: m[1] }))
        : undefined,
      "media:thumbnail": mediaThumbnailMatch ? { url: mediaThumbnailMatch[1] } : undefined,
      "media:thumbnail:list": mediaThumbnailMatches.length > 0
        ? mediaThumbnailMatches.map((m) => ({ url: m[1] }))
        : undefined,
      media: mediaContentMatch ? { content: { url: mediaContentMatch[1] } } : undefined,
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
  const raw = String(item._raw || "");
  const fromMediaContent =
    cleanImageCandidate(findMediaContentFromRaw(raw), baseUrl)
    || cleanImageCandidate(cleanUrl(item["media:content"]?.url), baseUrl)
    || cleanImageCandidate(firstArrayUrl(item["media:content:list"]), baseUrl)
    || cleanImageCandidate(item.media?.content?.url, baseUrl);
  if (fromMediaContent) return { url: fromMediaContent, strategy: "media:content" };

  const fromEnclosure =
    cleanImageCandidate(findEnclosureFromRaw(raw), baseUrl)
    || cleanImageCandidate(item.enclosure?.url, baseUrl)
    || cleanImageCandidate(firstArrayUrl(item.enclosures), baseUrl);
  if (fromEnclosure) return { url: fromEnclosure, strategy: "enclosure" };

  const fromItunes = cleanImageCandidate(item["itunes:image"]?.href || item["itunes:image"]?.["@_href"] || findItunesImageFromRaw(raw), baseUrl);
  if (fromItunes) return { url: fromItunes, strategy: "itunes:image" };

  const fromMediaThumbnail =
    cleanImageCandidate(findMediaThumbnailFromRaw(raw), baseUrl)
    || cleanImageCandidate(item["media:thumbnail"]?.url, baseUrl)
    || cleanImageCandidate(firstArrayUrl(item["media:thumbnail:list"]), baseUrl);
  if (fromMediaThumbnail) return { url: fromMediaThumbnail, strategy: "media:thumbnail" };

  const htmlCandidates = [bodyHtml, item["content:encoded"], item.content, item.description, item.summary];
  for (const html of htmlCandidates) {
    const fromHtml = extractFirstImageUrl(html || "", baseUrl);
    if (fromHtml) return { url: fromHtml, strategy: "html:first-img" };
  }

  const fromImage = cleanImageCandidate(item.image?.url, baseUrl);
  if (fromImage) return { url: fromImage, strategy: "image:url" };

  return { url: null, strategy: null };
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
    if (!type || type.startsWith("image/")) return url;
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
