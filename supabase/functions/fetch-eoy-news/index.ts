import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

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
  const m = text.trim().match(/(\d{1,2})\.?\s+(\S+)\s+(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = ET_MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

/* ── HTML helpers ───────────────────────────────── */
function extractText(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = re.exec(html))) results.push(match[1].replace(/<[^>]*>/g, "").trim());
  return results;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/* ── Title blacklist ── */
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
    if (url === listingUrl) return false;
    return true;
  } catch {
    return false;
  }
}

/* ── Robust image extraction from an HTML block ── */
function extractImageFromBlock(block: string, baseUrl: string): string | null {
  // 1) <img src="...">
  const srcMatch = block.match(/<img[^>]*\ssrc=["']([^"']+)["']/i);
  if (srcMatch) return normalizeUrl(srcMatch[1], baseUrl);

  // 2) <img data-src="..." / data-original="..." / data-lazy="...">
  const dataSrcMatch = block.match(/<img[^>]*\s(?:data-src|data-original|data-lazy)=["']([^"']+)["']/i);
  if (dataSrcMatch) return normalizeUrl(dataSrcMatch[1], baseUrl);

  // 3) <source srcset="..."> (take first URL)
  const srcsetMatch = block.match(/<(?:source|img)[^>]*\ssrcset=["']([^"']+)["']/i);
  if (srcsetMatch) {
    const firstUrl = srcsetMatch[1].split(",")[0].trim().split(/\s+/)[0];
    if (firstUrl) return normalizeUrl(firstUrl, baseUrl);
  }

  // 4) style="background-image:url(...)"
  const bgMatch = block.match(/background-image\s*:\s*url\s*\(\s*["']?([^"')]+)["']?\s*\)/i);
  if (bgMatch) return normalizeUrl(bgMatch[1], baseUrl);

  return null;
}

function normalizeUrl(url: string, baseUrl: string): string {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url.startsWith("/") ? baseUrl + url : url;
  }
}

/* ── SHA-1 hash for image filenames ── */
async function sha1(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = new Uint8Array(hashBuffer);
  return new TextDecoder().decode(hexEncode(hashArray));
}

/* ── Rehost image to Supabase Storage ── */
async function rehostImage(
  originalUrl: string,
  supabase: any,
  supabaseUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(originalUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)" },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
      : "jpg";

    const hash = await sha1(originalUrl);
    const path = `eoy/${hash}.${ext}`;

    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const { error } = await supabase.storage
      .from("news-images")
      .upload(path, arrayBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }

    return `${supabaseUrl}/storage/v1/object/public/news-images/${path}`;
  } catch (e) {
    console.error("Rehost error:", e);
    return null;
  }
}

interface ParsedItem {
  title: string;
  summary: string;
  url: string;
  image_url_original: string | null;
  published_at: string | null;
}

function parseEoyListPage(html: string, baseUrl: string, listingUrl: string): ParsedItem[] {
  const items: ParsedItem[] = [];

  const blocks = html.split(/<(?:article|div\s+class=['"][^'"]*(?:news|article|post|entry)[^'"]*['"])/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const titleMatch = block.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : "";
    if (!title || isBlacklistedTitle(title)) continue;

    const linkMatch = block.match(/href=['"]([^'"]*\/ET\/[^'"]+)['"]/i)
      || block.match(/href=['"]([^'"]*(?:uudised|news)\/[^'"]+)['"]/i)
      || block.match(/href=['"](https?:\/\/[^'"]+)['"]/i);
    let url = linkMatch ? linkMatch[1] : "";
    if (url.startsWith("/")) url = baseUrl + url;
    if (!isValidArticleUrl(url, listingUrl)) continue;

    const dateTexts = block.match(/\d{1,2}\.?\s+(?:jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember)\s+\d{4}/gi);
    const published_at = dateTexts ? parseEstonianDate(dateTexts[0]) : null;
    if (!published_at) continue;

    // Robust image extraction
    const image_url_original = extractImageFromBlock(block, baseUrl);

    const pTexts = extractText(block, "p");
    const summary = pTexts.find((t) => t.length > 20) || pTexts[0] || "";

    items.push({ title, summary, url, image_url_original, published_at });
  }

  // Fallback: "Loe edasi" links
  if (items.length === 0) {
    const linkRe = /href=['"]([^'"]+)[^>]*>(?:[^<]*Loe edasi|[^<]*loe edasi)/gi;
    let linkMatch;
    while ((linkMatch = linkRe.exec(html))) {
      let url = linkMatch[1];
      if (url.startsWith("/")) url = baseUrl + url;
      if (!isValidArticleUrl(url, listingUrl)) continue;
      items.push({ title: url, summary: "", url, image_url_original: null, published_at: null });
    }
  }

  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    const res = await fetch(source.fetch_url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)" },
    });
    if (!res.ok) throw new Error(`Failed to fetch EOÜ page: ${res.status}`);
    const html = await res.text();

    const baseUrl = "https://www.eoy.ee";
    const parsed = parseEoyListPage(html, baseUrl, source.fetch_url);
    console.log(`Parsed ${parsed.length} items from EOÜ index page`);

    let inserted = 0;
    let updated = 0;
    let imagesRehosted = 0;

    for (const item of parsed) {
      if (!item.url) continue;
      const guid = `eoy:${item.url}`;

      // Rehost image if we have an original
      let image_url: string | null = null;
      if (item.image_url_original) {
        image_url = await rehostImage(item.image_url_original, supabase, supabaseUrl);
        if (image_url) imagesRehosted++;
        else image_url = item.image_url_original; // fallback to original
      }

      const row: Record<string, unknown> = {
        source_id: source.id,
        source_slug: "eoy",
        title: item.title,
        summary: item.summary || "",
        url: item.url,
        image_url,
        image_url_original: item.image_url_original,
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
      JSON.stringify({ success: true, parsed: parsed.length, inserted, updated, imagesRehosted }),
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
