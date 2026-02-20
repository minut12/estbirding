import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Estonian month map ─────────────────────────── */
const ET_MONTHS: Record<string, string> = {
  jaanuar: "01", veebruar: "02", märts: "03", aprill: "04",
  mai: "05", juuni: "06", juuli: "07", august: "08",
  september: "09", oktoober: "10", november: "11", detsember: "12",
};

function parseEstonianDate(text: string): string | null {
  // "17. veebruar 2026" or "17 veebruar 2026"
  const m = text.trim().match(/(\d{1,2})\.?\s+(\S+)\s+(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = ET_MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

/* ── HTML helpers ───────────────────────────────── */
function extractText(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\s\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = re.exec(html))) results.push(match[1].replace(/<[^>]*>/g, "").trim());
  return results;
}

function extractAttr(html: string, tag: string, attr: string): string[] {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "gi");
  const results: string[] = [];
  let match;
  while ((match = re.exec(html))) results.push(match[1]);
  return results;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/* Sanitize HTML: allow safe tags only */
function sanitizeHtml(html: string): string {
  const allowedTags = new Set(["p", "a", "ul", "ol", "li", "strong", "em", "img", "h2", "h3", "blockquote", "br"]);
  // Remove script/iframe/style tags entirely
  let clean = html.replace(/<(script|iframe|style|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Remove tags not in allowlist but keep content
  clean = clean.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
    const t = tag.toLowerCase();
    if (allowedTags.has(t)) return match;
    // Keep self-closing allowed tags
    return "";
  });
  return clean.trim();
}

/* ── Title blacklist (menu/footer labels, not articles) ── */
const TITLE_BLACKLIST = new Set([
  "meist", "kontakt", "toeta", "privaatsus", "küpsised",
  "liitu", "töötajad", "ühistu", "kasulikku", "sündmused",
  "uudised", "projektid", "annetused", "linnukaitse",
]);

function isBlacklistedTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  if (TITLE_BLACKLIST.has(lower)) return true;
  if (lower.length < 8) return true;
  return false;
}

function isValidArticleUrl(url: string, listingUrl: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("eoy.ee")) return false;
    // Must not be the listing page itself
    if (url === listingUrl) return false;
    return true;
  } catch {
    return false;
  }
}

interface ParsedItem {
  title: string;
  summary: string;
  url: string;
  image_url: string | null;
  published_at: string | null;
  content_html: string | null;
}

function parseEoyListPage(html: string, baseUrl: string, listingUrl: string): ParsedItem[] {
  const items: ParsedItem[] = [];

  // EOÜ news page has article blocks with class containing "entry", "news", "article", "post"
  const blocks = html.split(/<(?:article|div\s+class=['"][^'"]*(?:news|article|post|entry)[^'"]*['"])/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Extract title from first heading
    const titleMatch = block.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : "";
    if (!title || isBlacklistedTitle(title)) continue;

    // Extract link — require it points to an actual article path
    const linkMatch = block.match(/href=['"]([^'"]*\/ET\/[^'"]+)['"]/i)
      || block.match(/href=['"]([^'"]*(?:uudised|news)\/[^'"]+)['"]/i)
      || block.match(/href=['"](https?:\/\/[^'"]+)['"]/i);
    let url = linkMatch ? linkMatch[1] : "";
    if (url.startsWith("/")) url = baseUrl + url;
    if (!isValidArticleUrl(url, listingUrl)) continue;

    // Extract date — REQUIRE a date to confirm it's a news item
    const dateTexts = block.match(/\d{1,2}\.?\s+(?:jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember)\s+\d{4}/gi);
    const published_at = dateTexts ? parseEstonianDate(dateTexts[0]) : null;
    if (!published_at) continue; // No date → likely not a news card

    // Extract image
    const imgMatch = block.match(/<img[^>]*src=['"]([^'"]+)['"]/i);
    let image_url = imgMatch ? imgMatch[1] : null;
    if (image_url && image_url.startsWith("/")) image_url = baseUrl + image_url;

    // Extract summary (first paragraph text after title)
    const pTexts = extractText(block, "p");
    const summary = pTexts.find((t) => t.length > 20) || pTexts[0] || "";

    items.push({ title, summary, url, image_url, published_at, content_html: null });
  }

  // Fallback: "Loe edasi" links (still apply validation)
  if (items.length === 0) {
    const linkRe = /href=['"]([^'"]+)[^>]*>(?:[^<]*Loe edasi|[^<]*loe edasi)/gi;
    let linkMatch;
    while ((linkMatch = linkRe.exec(html))) {
      let url = linkMatch[1];
      if (url.startsWith("/")) url = baseUrl + url;
      if (!isValidArticleUrl(url, listingUrl)) continue;
      items.push({ title: url, summary: "", url, image_url: null, published_at: null, content_html: null });
    }
  }

  return items;
}

async function fetchDetailPage(url: string): Promise<{ content_html: string | null; published_at: string | null; title: string | null; image_url: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)" },
    });
    if (!res.ok) return { content_html: null, published_at: null, title: null, image_url: null };
    const html = await res.text();

    // Extract article content
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      || html.match(/<div\s+class=['"][^'"]*(?:content|article|post-body|entry-content)[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i);
    const content_html = articleMatch ? sanitizeHtml(articleMatch[1] || articleMatch[2] || "") : null;

    // Extract date from detail
    const dateMatch = html.match(/\d{1,2}\.?\s+(?:jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember)\s+\d{4}/i);
    const published_at = dateMatch ? parseEstonianDate(dateMatch[0]) : null;

    // Title
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : null;

    // Image
    const imgMatch = html.match(/<meta\s+property=['"]og:image['"]\s+content=['"]([^'"]+)['"]/i)
      || html.match(/<img[^>]*class=['"][^'"]*(?:featured|hero|main)[^'"]*['"][^>]*src=['"]([^'"]+)['"]/i);
    const image_url = imgMatch ? (imgMatch[1] || imgMatch[2]) : null;

    return { content_html, published_at, title, image_url };
  } catch {
    return { content_html: null, published_at: null, title: null, image_url: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get EOÜ source
    const { data: source, error: srcErr } = await supabase
      .from("news_sources")
      .select("*")
      .eq("slug", "eoy")
      .single();

    if (srcErr || !source) {
      return new Response(JSON.stringify({ error: "EOÜ source not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the news index page
    const res = await fetch(source.fetch_url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)" },
    });
    if (!res.ok) throw new Error(`Failed to fetch EOÜ page: ${res.status}`);
    const html = await res.text();

    const baseUrl = "https://www.eoy.ee";
    let parsed = parseEoyListPage(html, baseUrl, source.fetch_url);

    console.log(`Parsed ${parsed.length} items from EOÜ index page`);

    // No longer fetch detail pages here — content_html is lazy-loaded via fetch-eoy-article-content
    const enriched = parsed;

    // Upsert into DB
    let inserted = 0;
    let updated = 0;
    for (const item of enriched) {
      if (!item.url) continue;
      const guid = `eoy:${item.url}`;
      const row = {
        source_id: source.id,
        source_slug: "eoy",
        title: item.title,
        summary: item.summary || "",
        url: item.url,
        image_url: item.image_url,
        published_at: item.published_at ? new Date(item.published_at).toISOString() : new Date().toISOString(),
        language: "et",
        guid,
      };

      const { error, status } = await supabase
        .from("news_items")
        .upsert(row, { onConflict: "guid" });

      if (!error) {
        if (status === 201) inserted++;
        else updated++;
      } else {
        console.error(`Upsert error for ${guid}:`, error);
      }
    }

    return new Response(
      JSON.stringify({ success: true, parsed: enriched.length, inserted, updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("fetch-eoy-news error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
