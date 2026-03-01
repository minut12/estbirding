import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseRss, normalizeRssItem, type NormalizedRssItem } from "../_shared/rss-normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type SourceRow = {
  id: string;
  slug: string;
  name: string;
  key?: string | null;
  source_key?: string | null;
  type?: string | null;
  feed_url?: string | null;
  fetch_url?: string | null;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function decodeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.replaceAll("&amp;", "&").replaceAll("&#38;", "&");
}

function canonicalizeUrl(raw: string | null | undefined): string {
  const input = String(raw || "").trim();
  if (!input) return "";
  try {
    const u = new URL(input);
    const dropParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    for (const p of dropParams) u.searchParams.delete(p);
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return input.replace(/\/+$/, "");
  }
}

function normalizePublishedAt(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extFromContentType(contentType: string | null): string {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("avif")) return "avif";
  if (ct.includes("svg")) return "svg";
  return "jpg";
}

async function cacheImage(
  supabase: any,
  supabaseUrl: string,
  item: { id: string; source_slug?: string | null; source_key?: string | null; image_url?: string | null; cached_image_url?: string | null },
): Promise<void> {
  const imageUrl = decodeUrl(item.image_url);
  if (!item.id || !imageUrl || item.cached_image_url) return;
  try {
    const imageRes = await fetch(imageUrl, { headers: { "User-Agent": "EstBirding/1.0" } });
    if (!imageRes.ok) return;
    const bytes = await imageRes.arrayBuffer();
    const ext = extFromContentType(imageRes.headers.get("content-type"));
    const sourcePath = String(item.source_slug || item.source_key || "news").toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "news";
    const hash = await sha1Hex(imageUrl);
    const filePath = `${sourcePath}/${hash}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("news-images")
      .upload(filePath, bytes, {
        upsert: true,
        contentType: imageRes.headers.get("content-type") || "image/jpeg",
      });
    if (uploadError) return;

    const cachedImageUrl = `${supabaseUrl}/storage/v1/object/public/news-images/${filePath}`;
    await supabase.from("news_items").update({
      cached_image_url: cachedImageUrl,
      cached_image_path: filePath,
    }).eq("id", item.id);
  } catch {
    // best effort
  }
}

async function refreshEoy(supabaseUrl: string, serviceRoleKey: string, source: SourceRow): Promise<{ inserted: number; updated: number }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-eoy-news`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({ dry_run: false, feed_url: source.fetch_url || null }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `fetch-eoy-news HTTP ${res.status}`);
  return {
    inserted: Number(payload?.insertedCount ?? payload?.inserted ?? 0),
    updated: Number(payload?.updatedCount ?? payload?.updated ?? 0),
  };
}

function normalizeRssItems(items: NormalizedRssItem[], source: SourceRow): Array<Record<string, unknown>> {
  const sourceKey = String(source.source_key || source.key || source.slug || "unknown");
  const now = new Date().toISOString();
  const out: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const url = canonicalizeUrl(item.permalink_url || "");
    if (!url) continue;
    const title = String(item.title || "").trim();
    if (!title) continue;
    const externalId = String(item.external_id || "").trim();
    const guid = externalId || String(item.permalink_url || "").trim() || `${source.slug}:${title}:${normalizePublishedAt(item.published_at)}`;

    out.push({
      source_id: source.id,
      source_key: sourceKey,
      source_slug: source.slug,
      title,
      body: item.body || null,
      summary: item.body?.slice(0, 500) || null,
      image_url: decodeUrl(item.image_url),
      url,
      permalink_url: url,
      guid,
      published_at: normalizePublishedAt(item.published_at),
      fetched_at: now,
      raw_json: item.raw_json,
      content_html: item.body_html || null,
      language: "pl",
      source_lang: "pl",
      archived: false,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: sources, error: sourcesError } = await supabase
      .from("news_sources")
      .select("id, slug, name, key, source_key, type, feed_url, fetch_url, is_enabled, is_active")
      .eq("is_enabled", true)
      .or("is_active.is.null,is_active.eq.true");
    if (sourcesError) return json({ error: sourcesError.message }, 500);

    const enabledSources = (sources || []) as SourceRow[];
    const sourceErrors: Array<{ source: string; error: string }> = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const source of enabledSources) {
      const slug = String(source.slug || "").toLowerCase();
      const name = String(source.name || "").toLowerCase();
      const type = String(source.type || "").toLowerCase();
      const isEoy = slug.includes("eoy") || slug.includes("eou") || name.includes("eoü") || String(source.fetch_url || "").includes("eoy.ee");

      if (isEoy) {
        try {
          const counts = await refreshEoy(supabaseUrl, serviceRoleKey, source);
          inserted += counts.inserted;
          updated += counts.updated;
        } catch (e: any) {
          sourceErrors.push({ source: source.slug, error: String(e?.message || e) });
        }
        continue;
      }

      if (type !== "rss" || !source.feed_url) {
        skipped += 1;
        continue;
      }

      try {
        const feedRes = await fetch(String(source.feed_url).trim(), {
          headers: { "User-Agent": "EstBirding/1.0", "Accept": "application/rss+xml, application/xml, text/xml, */*" },
        });
        if (!feedRes.ok) {
          sourceErrors.push({ source: source.slug, error: `RSS HTTP ${feedRes.status}` });
          continue;
        }
        const xml = await feedRes.text();
        const rows = normalizeRssItems(parseRss(xml).map((item) => normalizeRssItem(item)), source).slice(0, 50);

        for (const row of rows) {
          const existing = await supabase
            .from("news_items")
            .select("id")
            .eq("source_slug", row.source_slug)
            .eq("guid", row.guid)
            .maybeSingle();

          const { data: upserted, error } = await supabase
            .from("news_items")
            .upsert(row, { onConflict: "source_slug,guid" })
            .select("id, source_slug, source_key, image_url, cached_image_url")
            .single();
          if (error || !upserted?.id) {
            if (error) sourceErrors.push({ source: source.slug, error: error.message });
            continue;
          }
          if (existing?.data?.id) updated += 1;
          else inserted += 1;
          if (upserted.image_url && !upserted.cached_image_url) {
            await cacheImage(supabase, supabaseUrl, upserted);
          }
        }
      } catch (e: any) {
        sourceErrors.push({ source: source.slug, error: String(e?.message || e) });
      }
    }

    return json({
      ok: true,
      sourcesProcessed: enabledSources.length,
      itemsUpserted: inserted + updated,
      itemsInserted: inserted,
      itemsUpdated: updated,
      inserted,
      updated,
      skipped,
      sourceErrors,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
