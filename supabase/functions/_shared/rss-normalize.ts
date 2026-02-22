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
  "media:content"?: { url?: string };
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

    const enclosureMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    const mediaContentMatch = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);

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
      "media:content": mediaContentMatch ? { url: mediaContentMatch[1] } : undefined,
      _raw: block,
    });
  }

  return items;
}

export function normalizeRssItem(item: ParsedRssItem): NormalizedRssItem {
  const bodyHtml = item["content:encoded"] || item.content || item.description || item.summary || "";
  const bodyText = htmlToText(bodyHtml);
  const imageFromHtml = extractFirstImageUrl(bodyHtml);
  const imageUrl = item.enclosure?.url || item["media:content"]?.url || imageFromHtml || null;
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
  };
}

function extractFirstImageUrl(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
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
