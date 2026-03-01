import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseRss, normalizeRssItem, type NormalizedRssItem } from "../_shared/rss-normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

type SourceRow = {
  id: string;
  slug: string;
  name: string;
  key?: string | null;
  source_key?: string | null;
  type?: string | null;
  kind?: string | null;
  feed_url?: string | null;
  fetch_url?: string | null;
  url?: string | null;
};

type SourceSummary = {
  slug: string;
  inserted: number;
  updated: number;
  cachedImages: number;
  errors: string[];
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

async function ensureNewsImagesBucket(supabase: any): Promise<void> {
  await supabase.from("storage.buckets").upsert(
    { id: "news-images", name: "news-images", public: true },
    { onConflict: "id" },
  );
}

async function cacheImage(
  supabase: any,
  supabaseUrl: string,
  item: { id: string; source_slug?: string | null; source_key?: string | null; image_url?: string | null; cached_image_url?: string | null },
): Promise<boolean> {
  const imageUrl = decodeUrl(item.image_url);
  if (!item.id || !imageUrl || item.cached_image_url) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const isFbCdn = /fbcdn\.net|facebook\.com|scontent-/i.test(imageUrl);
  try {
    const imageRes = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/*,*/*;q=0.8",
        ...(isFbCdn ? { "Referer": "https://www.facebook.com/" } : {}),
      },
    });
    if (!imageRes.ok) return false;

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
    if (uploadError) return false;

    const cachedImageUrl = `${supabaseUrl}/storage/v1/object/public/news-images/${filePath}`;
    await supabase.from("news_items").update({
      cached_image_url: cachedImageUrl,
      cached_image_path: filePath,
    }).eq("id", item.id);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshEoy(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  source: SourceRow,
  cacheImages: boolean,
  cacheLimitLeft: number,
): Promise<SourceSummary> {
  const summary: SourceSummary = { slug: source.slug, inserted: 0, updated: 0, cachedImages: 0, errors: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const sourceUrl = String(source.url || source.fetch_url || source.feed_url || "").trim();
    const cacheBusted = sourceUrl
      ? (sourceUrl.includes("?") ? `${sourceUrl}&_ts=${Date.now()}` : `${sourceUrl}?_ts=${Date.now()}`)
      : null;
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-eoy-news`, {
      signal: controller.signal,
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({ url: cacheBusted, dryRun: false }),
    });
    const rawBody = await res.text().catch(() => "");
    const payload = (() => {
      try { return JSON.parse(rawBody || "{}"); } catch { return { error: rawBody || "EOÜ refresh failed" }; }
    })();
    if (!res.ok) {
      summary.errors.push(JSON.stringify({
        step: "fetch-eoy-news",
        status: res.status,
        bodySnippet: String(rawBody || "").slice(0, 240),
        message: payload?.error || `fetch-eoy-news HTTP ${res.status}`,
      }));
      return summary;
    }

    summary.inserted = Number(payload?.insertedCount ?? payload?.inserted ?? 0);
    summary.updated = Number(payload?.updatedCount ?? payload?.updated ?? 0);

    const itemIds = Array.isArray(payload?.itemIds) ? payload.itemIds.filter(Boolean) : [];
    if (cacheImages && cacheLimitLeft > 0 && itemIds.length > 0) {
      const { data: items } = await supabase
        .from("news_items")
        .select("id,image_url,cached_image_url,source_slug,source_key")
        .in("id", itemIds)
        .is("cached_image_url", null)
        .not("image_url", "is", null)
        .limit(cacheLimitLeft);
      for (const item of items || []) {
        if (summary.cachedImages >= cacheLimitLeft) break;
        const ok = await cacheImage(supabase, supabaseUrl, item);
        if (ok) summary.cachedImages += 1;
      }
    }
    return summary;
  } catch (e: any) {
    summary.errors.push(JSON.stringify({ step: "fetch-eoy-news", message: String(e?.message || e) }));
    return summary;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRssItems(items: NormalizedRssItem[], source: SourceRow): Array<Record<string, unknown>> {
  const sourceIdentity = String(source.source_key || source.key || source.slug || "unknown");
  const now = new Date().toISOString();
  const out: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const url = canonicalizeUrl(item.permalink_url || "");
    if (!url) continue;
    const title = String(item.title || "").trim();
    if (!title) continue;
    const externalId = String(item.external_id || "").trim();
    const guid = externalId || String(item.permalink_url || "").trim() || `${source.slug}:${title}:${normalizePublishedAt(item.published_at)}`;
    const itemSourceKey = `${sourceIdentity}:${guid}`;
    out.push({
      source_id: source.id,
      source_key: itemSourceKey,
      source_slug: source.slug,
      source_name: source.name,
      external_id: guid,
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const maxItemsPerSource = Math.max(1, Math.min(100, Number(body?.max_items_per_source ?? 15) || 15));
    const cacheImages = body?.cache_images === true;
    const cacheLimit = Math.max(0, Number(body?.cache_limit ?? 5) || 5);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await ensureNewsImagesBucket(supabase);

    const { data: sources, error: sourcesError } = await supabase
      .from("news_sources")
      .select("id, slug, name, key, source_key, type, kind, feed_url, fetch_url, url, enabled, is_enabled")
      .or("enabled.eq.true,is_enabled.eq.true");
    if (sourcesError) return json({ error: sourcesError.message }, 500);

    const enabledSources = (sources || []) as SourceRow[];
    const summaries: SourceSummary[] = [];
    const errors: Array<{ source: string; error: string }> = [];
    let inserted = 0;
    let updated = 0;
    let cachedImages = 0;
    let skipped = 0;

    for (const source of enabledSources) {
      const slug = String(source.slug || "").toLowerCase();
      const type = String(source.type || source.kind || "").toLowerCase();

      const isEoy = type === "scrape" && (slug === "eoy" || String(source.url || source.fetch_url || source.feed_url || "").includes("eoy.ee"));
      if (isEoy) {
        const summary = await refreshEoy(supabase, supabaseUrl, serviceRoleKey, source, cacheImages, Math.max(0, cacheLimit - cachedImages));
        summaries.push(summary);
        inserted += summary.inserted;
        updated += summary.updated;
        cachedImages += summary.cachedImages;
        for (const err of summary.errors) errors.push({ source: source.slug, error: err });
        continue;
      }

      const sourceUrl = String(source.feed_url || source.url || "").trim();
      if (type === "scrape") {
        skipped += 1;
        summaries.push({ slug: source.slug, inserted: 0, updated: 0, cachedImages: 0, errors: ["Unsupported scrape source"] });
        continue;
      }
      if (type !== "rss" || !sourceUrl) {
        skipped += 1;
        summaries.push({ slug: source.slug, inserted: 0, updated: 0, cachedImages: 0, errors: [] });
        continue;
      }

      const summary: SourceSummary = { slug: source.slug, inserted: 0, updated: 0, cachedImages: 0, errors: [] };
      try {
        const feedRes = await fetch(sourceUrl, {
          cache: "no-store",
          headers: { "User-Agent": "EstBirding/1.0", "Accept": "application/rss+xml, application/xml, text/xml, */*" },
        });
        if (!feedRes.ok) {
          summary.errors.push(`RSS HTTP ${feedRes.status}`);
          summaries.push(summary);
          errors.push({ source: source.slug, error: `RSS HTTP ${feedRes.status}` });
          continue;
        }

        const xml = await feedRes.text();
        const rows = normalizeRssItems(parseRss(xml).map((it) => normalizeRssItem(it)), source).slice(0, maxItemsPerSource);
        const externalIds = rows.map((row) => String(row.external_id || "")).filter(Boolean);
        const { data: existingRows } = externalIds.length > 0
          ? await supabase.from("news_items").select("external_id").in("external_id", externalIds)
          : { data: [] };
        const existingSet = new Set((existingRows || []).map((r: any) => String(r.external_id)));

        for (const row of rows) {
          const extId = String(row.external_id || "");
          const { data: upserted, error } = await supabase
            .from("news_items")
            .upsert(row, { onConflict: "external_id" })
            .select("id, image_url, cached_image_url, source_slug, source_key")
            .single();
          if (error || !upserted?.id) {
            const msg = error?.message || "upsert failed";
            summary.errors.push(msg);
            errors.push({ source: source.slug, error: msg });
            continue;
          }

          if (extId && existingSet.has(extId)) {
            summary.updated += 1;
            updated += 1;
          } else {
            summary.inserted += 1;
            inserted += 1;
            if (extId) existingSet.add(extId);
          }

          if (cacheImages && cachedImages < cacheLimit && upserted.image_url && !upserted.cached_image_url) {
            const ok = await cacheImage(supabase, supabaseUrl, upserted);
            if (ok) {
              cachedImages += 1;
              summary.cachedImages += 1;
            }
          }
        }
      } catch (e: any) {
        const msg = String(e?.message || e);
        summary.errors.push(msg);
        errors.push({ source: source.slug, error: msg });
      }

      summaries.push(summary);
    }

    return json({
      ok: true,
      sources: summaries,
      totalInserted: inserted,
      totalUpdated: updated,
      inserted,
      updated,
      cachedImages,
      skipped,
      errors,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
