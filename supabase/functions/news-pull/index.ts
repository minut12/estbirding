import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchSourceItems, normalizeSourceUrl, SourceFetchError } from "../_shared/source-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COOLDOWN_MS = 10 * 60 * 1000;
const BIRDING_POLAND_KEY = "facebook_birdingpoland";
const IS_DEV = Deno.env.get("DENO_DEPLOYMENT_ID") == null;
const AUTO_TRANSLATE_TO_ET = (Deno.env.get("AUTO_TRANSLATE_TO_ET") || "true").toLowerCase() !== "false";

type PullResult = { source: string; fetched: number; inserted: number; skipped: boolean; error?: string; debug?: Record<string, unknown> };

function decodeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.replaceAll("&amp;", "&").replaceAll("&#38;", "&");
}

function toTimestamp(value: string | null): number {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

function normalizePublishedAt(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
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

function shortError(reason: string): string {
  const text = String(reason || "unknown").trim();
  if (!text) return "unknown";
  return text.slice(0, 120);
}

function shouldUseSourceProxy(sourceKey: string): boolean {
  return sourceKey === BIRDING_POLAND_KEY;
}

function applyImageProxyIfNeeded(imageUrl: string | null, sourceKey: string, proxyBase: string): string | null {
  const clean = decodeUrl(imageUrl);
  if (!clean) return null;
  if (!shouldUseSourceProxy(sourceKey)) return clean;
  if (!proxyBase) return clean;
  if (clean.includes("/functions/v1/proxy?url=")) return clean;
  const lower = clean.toLowerCase();
  if (lower.startsWith("data:")) return clean;
  return `${proxyBase}${encodeURIComponent(clean)}`;
}

function normalizeProxyBase(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("{url}")) return trimmed;
  if (trimmed.includes("?url=") || trimmed.includes("&url=")) return trimmed;
  if (trimmed.endsWith("/proxy") || trimmed.endsWith("/proxy/")) return `${trimmed.replace(/\/$/, "")}?url=`;
  return trimmed.endsWith("/") ? `${trimmed}?url=` : `${trimmed}/?url=`;
}

function buildDefaultSupabaseProxyBase(): string {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  if (!supabaseUrl) return "";
  try {
    const u = new URL(supabaseUrl);
    return `${u.origin}/functions/v1/proxy?url=`;
  } catch {
    return "";
  }
}

function resolveProxyBase(requestProxyBase: string | null | undefined): string {
  const stored = normalizeProxyBase(String(requestProxyBase || ""));
  if (stored) return stored;
  const envProxy = normalizeProxyBase(String(Deno.env.get("NEWS_PROXY_BASE") || Deno.env.get("VITE_PROXY_BASE") || ""));
  if (envProxy) return envProxy;
  return buildDefaultSupabaseProxyBase();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function translateViaEdgeFunction(id: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/translate-news-item-et`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({ id }),
  });

  if (!res.ok) {
    throw new Error(`translate-news-item-et HTTP ${res.status}`);
  }
}

async function cacheNewsImageById(id: string, source: string, itemUrl: string | null, imageUrl: string | null): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;

  const res = await fetch(`${supabaseUrl}/functions/v1/cache-news-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({ news_item_id: id, source, itemUrl, imageUrl }),
  });

  if (!res.ok) return null;
  const payload = await res.json().catch(() => ({}));
  const cached = decodeUrl(payload?.cached_image_url);
  return cached || null;
}

async function pullRssSource({ source, supabase, proxyBase }: { source: any; supabase: any; proxyBase: string }): Promise<PullResult> {
  const sourceKey = String(source.source_key || source.key || source.slug || "unknown").trim() || "unknown";
  const feedUrl = normalizeSourceUrl(String(source.feed_url || "").trim());
  if (!feedUrl) {
    return { source: source.slug || source.id || "unknown", fetched: 0, inserted: 0, skipped: false, error: "missing feed url" };
  }

  let normalized;
  try {
    normalized = await fetchSourceItems({
      id: source.id,
      slug: source.slug,
      name: source.name,
      source_key: source.source_key,
      key: source.key,
      kind: source.kind,
      type: source.type,
      feed_url: feedUrl,
    }, proxyBase);
  } catch (error) {
    if (error instanceof SourceFetchError) {
      return {
        source: source.slug || source.id || "unknown",
        fetched: 0,
        inserted: 0,
        skipped: false,
        error: shortError(error.message),
      };
    }
    return {
      source: source.slug || source.id || "unknown",
      fetched: 0,
      inserted: 0,
      skipped: false,
      error: shortError(error?.message || "RSS parse error"),
    };
  }

  const sorted = normalized.sort((a, b) => toTimestamp(b.published_at) - toTimestamp(a.published_at));
  const items = sourceKey === BIRDING_POLAND_KEY ? sorted.slice(0, 1) : sorted.slice(0, 10);
  if (sourceKey === BIRDING_POLAND_KEY && items.length > 0) {
    const sample = items[0];
    const raw = (sample.raw_json || {}) as Record<string, unknown>;
    const desc = String((raw.description as string) || "").slice(0, 200);
    console.log("[birding-poland:image-debug]", {
      link: sample.permalink_url || raw.link || null,
      enclosure: raw.enclosure || null,
      mediaContent: raw["media:content"] || null,
      mediaThumbnail: raw["media:thumbnail"] || null,
      descriptionPreview: desc || null,
      computedImageUrl: sample.image_url || null,
      normalizedStoredImageUrl: sample.image_url || null,
    });
  }
  const externalIds = items.map((it) => String(it.external_id || "").trim()).filter(Boolean);
  const existingImageByExternalId = new Map<string, string>();
  if (externalIds.length > 0) {
    const { data: existingRows } = await supabase
      .from("news_items")
      .select("external_id, image_url")
      .eq("source_slug", source.slug)
      .in("external_id", externalIds);
    for (const row of (existingRows || [])) {
      const id = String(row?.external_id || "").trim();
      const img = decodeUrl(row?.image_url);
      if (id && img) existingImageByExternalId.set(id, img);
    }
  }

  let inserted = 0;
  for (const item of items) {
    const externalId = item.external_id?.trim();
    if (!externalId) continue;

    const guid = `${source.slug}:${externalId}`;
    const lang = sourceKey === BIRDING_POLAND_KEY ? "pl" : "et";
    const originalTitle = item.title || item.body.slice(0, 80) || "";
    const originalBody = item.body || "";
    const contentHash = await sha256Hex(`${originalTitle}\n${originalBody}`);

    const canonicalUrl = canonicalizeUrl(item.permalink_url || "");
    if (!canonicalUrl) continue;

    const row = {
      source_id: source.id,
      source_slug: source.slug,
      source_key: sourceKey || "unknown",
      external_id: externalId,
      title: originalTitle,
      summary: item.body.slice(0, 500) || null,
      content_html: item.body_html || null,
      body: originalBody || null,
      url: canonicalUrl,
      permalink_url: canonicalUrl,
      published_at: normalizePublishedAt(item.published_at) || new Date().toISOString(),
      language: lang,
      lang,
      guid,
      fetched_at: new Date().toISOString(),
      raw_json: item.raw_json,
      source_lang: lang,
    };

    const rowWithLang = lang === "et" ? { ...row, translation_status: "done" } : row;
    const cachedImage = existingImageByExternalId.get(externalId) || null;
    const resolvedImage = decodeUrl(item.image_url) || cachedImage;
    const proxiedImage = applyImageProxyIfNeeded(resolvedImage, sourceKey, proxyBase);
    const rowWithImage = proxiedImage ? { ...rowWithLang, image_url: proxiedImage } : rowWithLang;

    const { data: upserted, error } = await supabase
      .from("news_items")
      .upsert(rowWithImage, { onConflict: "source_id,url" })
      .select("id, translate_hash, title_et, body_et, image_url, cached_image_url")
      .single();

    if (error) {
      console.error(`Upsert error for ${guid}:`, error);
      continue;
    }

    inserted += 1;

    if (sourceKey === BIRDING_POLAND_KEY && upserted?.id) {
      try {
        const cachedUrl = await cacheNewsImageById(
          upserted.id,
          "Birding Poland",
          rowWithImage.permalink_url || rowWithImage.url || null,
          rowWithImage.image_url || null,
        );
        if (cachedUrl) {
          await supabase.from("news_items").update({ cached_image_url: cachedUrl }).eq("id", upserted.id);
        }
      } catch (cacheErr) {
        console.error(`[image-cache] failed for ${guid}:`, cacheErr);
      }
    }

    if (lang !== "et" && AUTO_TRANSLATE_TO_ET && upserted?.id) {
      const shouldTranslate = !upserted.title_et || !upserted.body_et || upserted.translate_hash !== contentHash;
      if (shouldTranslate) {
        try {
          await translateViaEdgeFunction(upserted.id);
        } catch (translateErr) {
          console.error(`[translate] failed for ${guid}:`, translateErr);
        }
      } else if (IS_DEV) {
        console.log("[translate] skip (hash match)", guid, contentHash);
      }
    }
  }

  return { source: source.slug, fetched: items.length, inserted, skipped: false };
}

async function pullScrapeSource({ source, supabase }: { source: any; supabase: any }): Promise<PullResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return { source: source.slug || source.id || "unknown", fetched: 0, inserted: 0, skipped: false, error: "missing supabase env" };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-eoy-news`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({ dry_run: false, feed_url: source.feed_url || source.fetch_url || null }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      source: source.slug || source.id || "unknown",
      fetched: 0,
      inserted: 0,
      skipped: false,
      error: shortError(payload?.error || `scrape HTTP ${res.status}`),
    };
  }

  const inserted = Number(payload?.insertedCount ?? payload?.inserted ?? 0);
  const fetched = Number(payload?.foundCount ?? payload?.parsed ?? inserted || 0);
  const debug = {
    foundCount: Number(payload?.foundCount ?? 0),
    upsertedCount: Number(payload?.upsertedCount ?? (payload?.insertedCount || 0) + (payload?.updatedCount || 0)),
    first3: Array.isArray(payload?.first3) ? payload.first3 : [],
    newestDate: payload?.newestDate || null,
    newestUrl: payload?.newestUrl || null,
  };
  return { source: source.slug || source.id || "unknown", fetched, inserted, skipped: false, debug };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const proxyBase = resolveProxyBase(body?.proxyBase);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sources, error: srcErr } = await supabase
      .from("news_sources")
      .select("*")
      .eq("is_active", true)
      .eq("is_enabled", true);

    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No enabled sources", results: [], debug: { resolvedProxyBase: proxyBase } }),
        { headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } },
      );
    }

    const enabledSources = sources.filter((source) => {
      const kind = String(source.type || source.kind || "").toLowerCase();
      if (kind === "scrape") return true;
      return Boolean(String(source.feed_url || "").trim());
    });

    const tasks = enabledSources.map(async (source) => {
      if (!force) {
        const { data: recent } = await supabase
          .from("news_items")
          .select("fetched_at")
          .eq("source_slug", source.slug)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .single();

        if (recent?.fetched_at) {
          const elapsed = Date.now() - new Date(recent.fetched_at).getTime();
          if (elapsed < COOLDOWN_MS) {
            return { source: source.slug, fetched: 0, inserted: 0, skipped: true } as PullResult;
          }
        }
      }

      const kind = String(source.type || source.kind || "rss").toLowerCase();
      if (kind === "scrape") {
        return pullScrapeSource({ source, supabase });
      }
      return pullRssSource({ source, supabase, proxyBase });
    });

    const settled = await Promise.allSettled(tasks);
    const results: PullResult[] = settled.map((entry, index) => {
      if (entry.status === "fulfilled") return entry.value;
      const source = enabledSources[index]?.slug || enabledSources[index]?.id || "unknown";
      return {
        source,
        fetched: 0,
        inserted: 0,
        skipped: false,
        error: shortError(entry.reason?.message || String(entry.reason || "unknown")),
      };
    });

    const foundCount = results.reduce((sum, r) => sum + Number((r.debug?.foundCount as number) || r.fetched || 0), 0);
    const upsertedCount = results.reduce((sum, r) => sum + Number((r.debug?.upsertedCount as number) || r.inserted || 0), 0);
    const newestUrl = (results.find((r) => typeof r.debug?.newestUrl === "string" && String(r.debug?.newestUrl).trim())?.debug?.newestUrl as string | undefined) || null;

    return new Response(
      JSON.stringify({
        success: true,
        foundCount,
        upsertedCount,
        newestUrl,
        results,
        debug: {
          resolvedProxyBase: proxyBase,
          activeProxyName: proxyBase.includes("/functions/v1/proxy") ? "supabase" : "custom",
          allFailed: results.length > 0 && results.every((item) => Boolean(item.error)),
        },
      }),
      { headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } },
    );
  } catch (error) {
    console.error("news-pull error:", error);
    return new Response(JSON.stringify({ error: shortError(error?.message || String(error)) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
  }
});
