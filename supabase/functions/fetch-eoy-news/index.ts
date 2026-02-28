import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ET_MONTHS: Record<string, string> = {
  jaanuar: "01", veebruar: "02", märts: "03", aprill: "04",
  mai: "05", juuni: "06", juuli: "07", august: "08",
  september: "09", oktoober: "10", november: "11", detsember: "12",
};

function parseEstonianDate(text: string): string | null {
  const compact = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (compact) {
    const day = compact[1].padStart(2, "0");
    const month = compact[2].padStart(2, "0");
    return `${compact[3]}-${month}-${day}`;
  }
  const m = text.trim().match(/(\d{1,2})\.?\s+(\S+)\s+(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = ET_MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractText(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(stripHtml(m[1]));
  return out;
}

function normalizeUrl(url: string, baseUrl: string): string {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url.startsWith("/") ? baseUrl + url : url;
  }
}

function canonicalizeArticleUrl(raw: string, baseUrl: string): string {
  const abs = normalizeUrl(raw, baseUrl);
  try {
    const u = new URL(abs);
    const dropParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    for (const p of dropParams) u.searchParams.delete(p);
    const kept: Array<[string, string]> = [];
    u.searchParams.forEach((v, k) => kept.push([k, v]));
    kept.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    u.search = "";
    for (const [k, v] of kept) u.searchParams.append(k, v);
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return abs.replace(/\/+$/, "");
  }
}

function isValidArticleUrl(url: string, listingUrl: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("eoy.ee")) return false;
    return canonicalizeArticleUrl(url, "https://www.eoy.ee") !== canonicalizeArticleUrl(listingUrl, "https://www.eoy.ee");
  } catch {
    return false;
  }
}

function extractImageFromBlock(block: string, baseUrl: string): string | null {
  const srcMatch = block.match(/<img[^>]*\ssrc=["']([^"']+)["']/i);
  if (srcMatch) return normalizeUrl(srcMatch[1], baseUrl);

  const dataSrcMatch = block.match(/<img[^>]*\s(?:data-src|data-original|data-lazy)=["']([^"']+)["']/i);
  if (dataSrcMatch) return normalizeUrl(dataSrcMatch[1], baseUrl);

  const srcsetMatch = block.match(/<(?:source|img)[^>]*\ssrcset=["']([^"']+)["']/i);
  if (srcsetMatch) {
    const first = srcsetMatch[1].split(",")[0]?.trim().split(/\s+/)[0];
    if (first) return normalizeUrl(first, baseUrl);
  }

  const bgMatch = block.match(/background-image\s*:\s*url\s*\(\s*["']?([^"')]+)["']?\s*\)/i);
  if (bgMatch) return normalizeUrl(bgMatch[1], baseUrl);
  return null;
}

async function sha1(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = new Uint8Array(hashBuffer);
  return new TextDecoder().decode(hexEncode(hashArray));
}

async function rehostImage(originalUrl: string, supabase: any, supabaseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(originalUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)" } });
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
      .upload(path, arrayBuffer, { contentType, upsert: true });

    if (error) return null;
    return `${supabaseUrl}/storage/v1/object/public/news-images/${path}`;
  } catch {
    return null;
  }
}

function extractAlternateFeedUrl(html: string, baseUrl: string): string | null {
  const re = /<link[^>]*rel=["'][^"']*alternate[^"']*["'][^>]*>/gi;
  const matches = html.match(re) || [];
  for (const tag of matches) {
    const type = (tag.match(/type=["']([^"']+)["']/i)?.[1] || "").toLowerCase();
    if (!type.includes("rss") && !type.includes("atom") && !type.includes("xml")) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1] || "";
    if (!href) continue;
    return normalizeUrl(href, baseUrl);
  }
  return null;
}

interface ParsedItem {
  title: string;
  summary: string;
  url: string;
  image_url_original: string | null;
  published_at: string | null;
  published_raw: string | null;
}

function parseEoyListPage(html: string, baseUrl: string, listingUrl: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const blocks = html.split(/<(?:article|div\s+class=['"][^'"]*(?:news|article|post|entry)[^'"]*['"])/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const title = stripHtml(block.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i)?.[1] || "");
    if (!title) continue;

    const linkMatch = block.match(/href=['"]([^'"]*\/ET\/[^'"]+)['"]/i)
      || block.match(/href=['"]([^'"]*(?:uudised|news)\/[^'"]+)['"]/i)
      || block.match(/href=['"](https?:\/\/[^'"]+)['"]/i);
    const rawUrl = linkMatch?.[1] || "";
    if (!rawUrl) continue;

    const url = canonicalizeArticleUrl(rawUrl, baseUrl);
    if (!isValidArticleUrl(url, listingUrl)) continue;

    const dateRaw = block.match(/\d{1,2}\.?\s+(?:jaanuar|veebruar|märts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember)\s+\d{4}/i)?.[0] || null;
    const published_at = dateRaw ? parseEstonianDate(dateRaw) : null;

    const image_url_original = extractImageFromBlock(block, baseUrl);
    const pTexts = extractText(block, "p");
    const summary = pTexts.find((t) => t.length > 20) || pTexts[0] || "";

    items.push({ title, summary, url, image_url_original, published_at, published_raw: dateRaw });
  }

  if (items.length === 0) {
    const linkRe = /href=['"]([^'"]+)[^>]*>(?:[^<]*Loe edasi|[^<]*loe edasi)/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html))) {
      const url = canonicalizeArticleUrl(m[1], baseUrl);
      if (!isValidArticleUrl(url, listingUrl)) continue;
      items.push({ title: url, summary: "", url, image_url_original: null, published_at: null, published_raw: null });
    }
  }

  return items;
}

function parseFeedItems(xml: string, baseUrl: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const entries = Array.from(doc.querySelectorAll("item, entry"));

    for (const node of entries) {
      const title = (node.querySelector("title")?.textContent || "").trim();
      if (!title) continue;

      let rawUrl = (node.querySelector("link")?.textContent || "").trim();
      if (!rawUrl) {
        const linkHref = node.querySelector("link[href]")?.getAttribute("href") || "";
        rawUrl = linkHref.trim();
      }
      if (!rawUrl) continue;
      const url = canonicalizeArticleUrl(rawUrl, baseUrl);

      const pubRaw = (node.querySelector("pubDate, published, updated")?.textContent || "").trim() || null;
      const pubIso = pubRaw && Number.isFinite(new Date(pubRaw).getTime()) ? new Date(pubRaw).toISOString() : null;

      const summary = (node.querySelector("description, summary, content")?.textContent || "").trim();
      const enclosureUrl = node.querySelector("enclosure[url]")?.getAttribute("url")
        || node.querySelector("media\\:content[url]")?.getAttribute("url")
        || node.querySelector("media\\:thumbnail[url]")?.getAttribute("url")
        || null;

      items.push({
        title,
        summary: stripHtml(summary || ""),
        url,
        image_url_original: enclosureUrl ? normalizeUrl(enclosureUrl, baseUrl) : null,
        published_at: pubIso,
        published_raw: pubRaw,
      });
    }
  } catch (e) {
    console.error("RSS/Atom parse failed", e);
  }
  return items;
}

function noCacheUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const feedUrlOverride = typeof body?.feed_url === "string" ? body.feed_url : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: source, error: srcErr } = await supabase.from("news_sources").select("*").eq("slug", "eoy").single();
    if (srcErr || !source) {
      return new Response(JSON.stringify({ error: "EOÜ source not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
      });
    }

    const listingUrl = String(feedUrlOverride || source.fetch_url || "https://www.eoy.ee/ET/uudised/").trim();
    const baseUrl = "https://www.eoy.ee";
    const fetchHeaders = {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "User-Agent": "Mozilla/5.0",
    };

    const listRes = await fetch(noCacheUrl(listingUrl), { headers: fetchHeaders });
    if (!listRes.ok) throw new Error(`Failed to fetch EOÜ page: ${listRes.status}`);
    const html = await listRes.text();

    const rssUrl = extractAlternateFeedUrl(html, baseUrl);
    const parsedFromHtml = parseEoyListPage(html, baseUrl, listingUrl);

    let parsed = parsedFromHtml;
    let fetchMode = "html";

    if (rssUrl) {
      const rssRes = await fetch(noCacheUrl(rssUrl), { headers: fetchHeaders });
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const rssItems = parseFeedItems(xml, baseUrl);
        if (rssItems.length > 0) {
          parsed = rssItems;
          fetchMode = "rss";
        }
      }
    }

    const dedup = new Map<string, ParsedItem>();
    for (const it of parsed) {
      if (!it.url) continue;
      dedup.set(canonicalizeArticleUrl(it.url, baseUrl), { ...it, url: canonicalizeArticleUrl(it.url, baseUrl) });
    }
    const normalizedItems = Array.from(dedup.values());

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true,
        fetchMode,
        foundCount: normalizedItems.length,
        first3: normalizedItems.slice(0, 3).map((i) => i.url),
      }), { headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } });
    }

    const urls = normalizedItems.map((i) => i.url).filter(Boolean);
    const existingSet = new Set<string>();
    if (urls.length > 0) {
      const { data: existingRows } = await supabase
        .from("news_items")
        .select("url")
        .eq("source_slug", "eoy")
        .in("url", urls);
      for (const row of (existingRows || [])) {
        const u = String(row?.url || "").trim();
        if (u) existingSet.add(u);
      }
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let imagesRehosted = 0;
    let newestDate: string | null = null;

    for (const item of normalizedItems) {
      if (!item.url) continue;

      let image_url: string | null = null;
      if (item.image_url_original) {
        image_url = await rehostImage(item.image_url_original, supabase, supabaseUrl);
        if (image_url) imagesRehosted += 1;
        else image_url = item.image_url_original;
      }

      const publishedIso = item.published_at && Number.isFinite(new Date(item.published_at).getTime())
        ? new Date(item.published_at).toISOString()
        : new Date().toISOString();
      if (!newestDate || new Date(publishedIso).getTime() > new Date(newestDate).getTime()) {
        newestDate = publishedIso;
      }

      const row: Record<string, unknown> = {
        source_id: source.id,
        source_slug: "eoy",
        source_key: source.source_key || source.key || "eoy",
        title: item.title,
        summary: item.summary || "",
        url: item.url,
        image_url,
        image_url_original: item.image_url_original,
        published_at: publishedIso,
        language: "et",
        guid: `eoy:${item.url}`,
        raw_json: {
          fetch_mode: fetchMode,
          published_raw: item.published_raw,
        },
      };

      const { error } = await supabase
        .from("news_items")
        .upsert(row, { onConflict: "source_slug,url" });

      if (error) {
        console.error(`Upsert error for ${item.url}:`, error);
        continue;
      }

      if (existingSet.has(item.url)) updatedCount += 1;
      else insertedCount += 1;
    }

    return new Response(JSON.stringify({
      success: true,
      fetchMode,
      foundCount: normalizedItems.length,
      upsertedCount: insertedCount + updatedCount,
      insertedCount,
      updatedCount,
      imagesRehosted,
      first3: normalizedItems.slice(0, 3).map((it) => it.url),
      newestDate,
      parsed: normalizedItems.length,
      inserted: insertedCount,
      updated: updatedCount,
    }), { headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } });
  } catch (error) {
    console.error("fetch-eoy-news error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
  }
});
