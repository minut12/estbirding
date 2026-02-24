import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeRssItem, parseRss } from "../_shared/rss-normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SourceRow = {
  id: string;
  source_key: string;
  name: string;
  url: string;
  source_lang: string;
  target_lang: string;
  enabled: boolean;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeText(s: string | null | undefined): string {
  return decodeEntities((s || "").trim()).replace(/\s+/g, " ").trim();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseEoyHtml(html: string, pageUrl: string): Array<{
  title: string;
  url: string;
  summary: string | null;
  content: string | null;
  published_at: string | null;
  external_id: string | null;
}> {
  const matches = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const seen = new Set<string>();
  const items: ReturnType<typeof parseEoyHtml> = [];

  for (const m of matches) {
    const href = m[1] || "";
    const title = normalizeText(stripHtml(m[2] || ""));
    if (!title || title.length < 8) continue;

    let itemUrl = href;
    try {
      itemUrl = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }

    if (!/eoy\.ee/i.test(itemUrl) || seen.has(itemUrl)) continue;
    if (!/\/uudised\//i.test(itemUrl) && !/\/ET\//i.test(itemUrl)) continue;

    seen.add(itemUrl);
    items.push({
      title,
      url: itemUrl,
      summary: null,
      content: null,
      published_at: null,
      external_id: itemUrl,
    });

    if (items.length >= 30) break;
  }

  return items;
}

async function fetchSourceItems(source: SourceRow) {
  const res = await fetch(source.url, { headers: { "User-Agent": "EstBirding/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  const isXml = /<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]/i.test(text) || /xml/i.test(res.headers.get("content-type") || "");
  if (isXml) {
    const normalized = parseRss(text).map(normalizeRssItem);
    return normalized.map((it) => ({
      title: normalizeText(it.title || "Untitled"),
      url: it.permalink_url || source.url,
      summary: normalizeText(it.body || "") || null,
      content: normalizeText(it.body_html || it.body || "") || null,
      published_at: it.published_at,
      external_id: it.external_id,
    }));
  }

  return parseEoyHtml(text, source.url);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: sources, error: srcErr } = await supabase
      .from("news_sources")
      .select("id, source_key, name, url, source_lang, target_lang, enabled")
      .eq("enabled", true);

    if (srcErr) throw srcErr;

    const summary: Record<string, { inserted: number; updated: number; skipped: number; errors: number }> = {};

    for (const source of (sources || []) as SourceRow[]) {
      summary[source.source_key] = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
      try {
        const items = await fetchSourceItems(source);

        for (const item of items) {
          const title = normalizeText(item.title);
          const parsedSummary = normalizeText(item.summary || "") || null;
          const content = normalizeText(item.content || "") || null;
          const itemUrl = item.url;

          if (!title || !itemUrl) {
            summary[source.source_key].skipped++;
            continue;
          }

          const contentHash = await sha256Hex(`${title}\n${parsedSummary || ""}\n${content || ""}`);

          const row = {
            source_id: source.id,
            external_id: item.external_id,
            item_url: itemUrl,
            title,
            summary: parsedSummary,
            content,
            published_at: item.published_at,
            fetched_at: new Date().toISOString(),
            source_lang: source.source_lang,
            content_hash: contentHash,
          };

          const onConflict = item.external_id ? "source_id,external_id" : "source_id,content_hash";
          const { error, status } = await supabase.from("news_items").upsert(row, { onConflict });

          if (error) {
            summary[source.source_key].errors++;
          } else if (status === 201) {
            summary[source.source_key].inserted++;
          } else {
            summary[source.source_key].updated++;
          }
        }
      } catch (error) {
        summary[source.source_key].errors++;
        console.error(`[cron_ingest_news] source ${source.source_key} failed`, error);
      }
    }

    return new Response(JSON.stringify({ success: true, per_source: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("cron_ingest_news error", error);
    return new Response(JSON.stringify({ error: String((error as Error)?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
