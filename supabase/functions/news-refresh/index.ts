import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseRss, normalizeRssItem, type NormalizedRssItem } from "../_shared/rss-normalize.ts";
import { corsHeaders } from "../_shared/cors.ts";

type SourceRow = {
  id: string;
  slug: string;
  name: string;
  key?: string | null;
  source_key?: string | null;
  type?: string | null;
  feed_url?: string | null;
  fetch_url?: string | null;
  is_enabled?: boolean | null;
  is_active?: boolean | null;
};

type SourceSummary = {
  slug: string;
  source: string;
  ok: boolean;
  inserted: number;
  updated: number;
  cachedImages: number;
  fetchedCount: number;
  viaProxy?: boolean;
  status?: number;
  contentType?: string;
  bodySnippet?: string;
  errors: string[];
};

type ErrorInfo = {
  source: string;
  error: string;
  status?: number;
  contentType?: string;
  bodySnippet?: string;
};

type RssFetchResult = {
  ok: boolean;
  text: string;
  viaProxy: boolean;
  status: number;
  contentType: string;
  blocked: boolean;
  bodySnippet: string;
};

const BROWSER_UA = "Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "user-agent": BROWSER_UA,
    "accept-language": "en-US,en;q=0.9,et;q=0.8",
    ...extra,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function jsonError(source: string, error: unknown, status = 500, extra: Partial<ErrorInfo> = {}): Response {
  const err = error as { message?: string; name?: string; stack?: string } | null;
  return json({
    ok: false,
    perSource: [],
    errors: [{
      source,
      error: err?.message || String(error),
      ...extra,
    }],
    debug: {
      name: err?.name || "Error",
      stack: err?.stack,
    },
  }, status);
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

function normalizeSourceName(raw: string | null | undefined): string {
  const s = String(raw || "").trim();
  if (!s) return s;
  return s.replace(/EO\uFFFD|EO�|EOU/gi, "EOÜ");
}

function bodySnippet(body: string): string {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function looksLikeHtmlChallenge(contentType: string, body: string): boolean {
  const sample = String(body || "").slice(0, 400).toLowerCase();
  const ct = String(contentType || "").toLowerCase();
  return ct.includes("text/html")
    || sample.startsWith("<!doctype html")
    || sample.includes("cf_chl")
    || sample.includes("captcha");
}

function buildProxyUrl(targetUrl: string, supabaseUrl: string): string {
  const base = `${supabaseUrl}/functions/v1/proxy`;
  return `${base}?url=${encodeURIComponent(targetUrl)}`;
}

async function fetchRssText(url: string, supabaseUrl: string): Promise<RssFetchResult> {
  const rssHeaders = browserHeaders({
    accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
    referer: "https://rss.app/",
  });
  let direct = await fetch(url, { headers: rssHeaders, redirect: "follow" });
  if (!direct.ok && /rss\.app\/feeds\//i.test(url)) {
    const htmlHeaders = browserHeaders({
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer: "https://rss.app/",
    });
    direct = await fetch(url, { headers: htmlHeaders, redirect: "follow" });
  }
  const directText = await direct.text();
  const directType = String(direct.headers.get("content-type") || "");
  const directBlocked = looksLikeHtmlChallenge(directType, directText);

  if (direct.ok && !directBlocked) {
    return {
      ok: true,
      text: directText,
      viaProxy: false,
      status: direct.status,
      contentType: directType,
      blocked: false,
      bodySnippet: bodySnippet(directText),
    };
  }

  const proxied = await fetch(buildProxyUrl(url, supabaseUrl), { headers: rssHeaders, redirect: "follow" });
  const proxiedText = await proxied.text();
  const proxiedType = String(proxied.headers.get("content-type") || "");
  const proxiedBlocked = looksLikeHtmlChallenge(proxiedType, proxiedText);

  return {
    ok: proxied.ok && !proxiedBlocked,
    text: proxiedText,
    viaProxy: true,
    status: proxied.status,
    contentType: proxiedType,
    blocked: proxiedBlocked,
    bodySnippet: bodySnippet(proxiedText),
  };
}

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extFromContentType(contentType: string | null): string {
  const ct = String(contentType || "").toLowerCase();
  if (!ct) return "bin";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("avif")) return "avif";
  if (ct.includes("svg")) return "svg";
  return "bin";
}

async function ensureNewsImagesBucket(supabase: any): Promise<void> {
  try {
    await supabase.storage.getBucket("news-images");
  } catch {
    try {
      await supabase.storage.createBucket("news-images", { public: true });
    } catch {
      // bucket likely already exists
    }
  }
}

async function cacheImage(
  supabase: any,
  supabaseUrl: string,
  item: {
    id: string;
    source_slug?: string | null;
    source_key?: string | null;
    external_id?: string | null;
    guid?: string | null;
    image_url?: string | null;
    cached_image_url?: string | null;
  },
  options: { force?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const imageUrl = decodeUrl(item.image_url);
  if (!item.id || !imageUrl || (item.cached_image_url && !options.force)) return { ok: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const isFbCdn = /fbcdn\.net|facebook\.com|scontent-/i.test(imageUrl);
  try {
    let imageRes = await fetch(imageUrl, {
      signal: controller.signal,
      method: "GET",
      headers: browserHeaders({
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: "https://www.facebook.com/",
      }),
      redirect: "follow",
    });
    const type1 = String(imageRes.headers.get("content-type") || "").toLowerCase();
    const len1 = Number(imageRes.headers.get("content-length") || "0");
    const directValid = imageRes.ok
      && type1.startsWith("image/")
      && (!Number.isFinite(len1) || len1 <= 0 || len1 <= MAX_IMAGE_BYTES);
    if (!directValid) {
      const wsrv = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl.replace(/^https?:\/\//i, ""))}`;
      imageRes = await fetch(wsrv, {
        signal: controller.signal,
        method: "GET",
        headers: browserHeaders({
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        }),
        redirect: "follow",
      });
    }
    const finalType = String(imageRes.headers.get("content-type") || "").toLowerCase();
    const finalLen = Number(imageRes.headers.get("content-length") || "0");
    if (!imageRes.ok || !finalType.startsWith("image/")) return { ok: false, error: `image fetch invalid (${imageRes.status}, ${finalType || "unknown"})` };
    if (Number.isFinite(finalLen) && finalLen > MAX_IMAGE_BYTES) return { ok: false, error: `image too large (${finalLen} bytes)` };

    const bytes = await imageRes.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: `image too large (${bytes.byteLength} bytes)` };
    const ext = extFromContentType(imageRes.headers.get("content-type"));
    const sourcePath = String(item.source_slug || item.source_key || "news").toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "news";
    const rawGuid = String(item.guid || item.external_id || item.id || "").trim();
    const safeGuid = (rawGuid.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || await sha1Hex(imageUrl));
    const filePath = `${sourcePath}/${safeGuid}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("news-images")
      .upload(filePath, bytes, {
        upsert: true,
        contentType: imageRes.headers.get("content-type") || "image/jpeg",
      });
    if (uploadError) return { ok: false, error: `upload failed: ${uploadError.message}` };

    const cachedImageUrl = `${supabaseUrl}/storage/v1/object/public/news-images/${filePath}`;
    const { error: updateError } = await supabase.from("news_items").update({
      cached_image_url: cachedImageUrl,
      cached_image_path: filePath,
    }).eq("id", item.id);
    if (updateError) return { ok: false, error: `update failed: ${updateError.message}` };

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
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
  const summary: SourceSummary = {
    slug: source.slug,
    source: source.name || source.slug,
    ok: true,
    inserted: 0,
    updated: 0,
    cachedImages: 0,
    fetchedCount: 0,
    errors: [],
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const sourceUrl = String(source.fetch_url || source.feed_url || "").trim();
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
      try { return JSON.parse(rawBody || "{}"); } catch { return { error: rawBody || "fetch-eoy-news parse failed" }; }
    })();

    summary.status = res.status;
    summary.contentType = String(res.headers.get("content-type") || "");
    summary.bodySnippet = bodySnippet(rawBody);

    if (!res.ok) {
      summary.ok = false;
      summary.errors.push(payload?.error || `fetch-eoy-news HTTP ${res.status}`);
      return summary;
    }

    summary.inserted = Number(payload?.insertedCount ?? payload?.inserted ?? 0);
    summary.updated = Number(payload?.updatedCount ?? payload?.updated ?? 0);
    summary.fetchedCount = Number(payload?.foundCount ?? payload?.count ?? summary.inserted + summary.updated);

    const itemIds = Array.isArray(payload?.itemIds) ? payload.itemIds.filter(Boolean) : [];
    if (cacheImages && cacheLimitLeft > 0 && itemIds.length > 0) {
      const { data: items } = await supabase
        .from("news_items")
        .select("id,image_url,cached_image_url,source_slug,source_key,external_id,guid")
        .in("id", itemIds)
        .is("cached_image_url", null)
        .not("image_url", "is", null)
        .limit(cacheLimitLeft);
      for (const item of items || []) {
        if (summary.cachedImages >= cacheLimitLeft) break;
        const cacheResult = await cacheImage(supabase, supabaseUrl, item);
        if (cacheResult.ok) summary.cachedImages += 1;
        else if (cacheResult.error) summary.errors.push(`cacheImage: ${cacheResult.error}`);
      }
    }

    return summary;
  } catch (e: any) {
    summary.ok = false;
    summary.errors.push(String(e?.message || e));
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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
  }
  if (req.method !== "POST" && req.method !== "GET") return jsonError("news-refresh", new Error("Method not allowed"), 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError("news-refresh", new Error("Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"), 500);
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const maxItemsPerSource = Math.max(1, Math.min(100, Number(body?.max_items_per_source ?? 15) || 15));
    const cacheImages = body?.cache_images === true;
    const cacheLimit = Math.max(0, Number(body?.cache_limit ?? 5) || 5);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await ensureNewsImagesBucket(supabase);

    await supabase
      .from("news_sources")
      .update({ name: "EOÜ" })
      .or("slug.eq.eoy,source_key.eq.eoy,key.eq.eoy")
      .neq("name", "EOÜ");

    const { data: sources, error: sourcesError } = await supabase
      .from("news_sources")
      .select("id, slug, name, key, source_key, type, feed_url, fetch_url, is_enabled, is_active")
      .eq("is_enabled", true);
    if (sourcesError) return jsonError("news-refresh", new Error(sourcesError.message), 500);

    const enabledSources = (sources || []).map((s: SourceRow) => ({ ...s, name: normalizeSourceName(s.name) })) as SourceRow[];
    const perSource: SourceSummary[] = [];
    const errors: ErrorInfo[] = [];
    let inserted = 0;
    let updated = 0;
    let cachedImages = 0;
    let skipped = 0;

    for (const source of enabledSources) {
      const slug = String(source.slug || "").toLowerCase();
      const type = String(source.type || "").toLowerCase();
      const isBirdingPoland = slug === "birding_poland" || slug === "facebook_birdingpoland";

      const isEoy = type === "scrape" && (slug === "eoy" || String(source.fetch_url || source.feed_url || "").includes("eoy.ee"));
      if (isEoy) {
        const summary = await refreshEoy(supabase, supabaseUrl, serviceRoleKey, source, cacheImages, Math.max(0, cacheLimit - cachedImages));
        perSource.push(summary);
        inserted += summary.inserted;
        updated += summary.updated;
        cachedImages += summary.cachedImages;
        for (const err of summary.errors) {
          errors.push({ source: source.slug, error: err, status: summary.status, contentType: summary.contentType, bodySnippet: summary.bodySnippet });
        }
        continue;
      }

      const sourceUrl = String(source.feed_url || source.fetch_url || "").trim();
      if (type === "scrape") {
        skipped += 1;
        perSource.push({
          slug: source.slug,
          source: source.name || source.slug,
          ok: false,
          inserted: 0,
          updated: 0,
          cachedImages: 0,
          fetchedCount: 0,
          errors: ["Unsupported scrape source"],
        });
        continue;
      }
      if (type !== "rss" || !sourceUrl) {
        skipped += 1;
        perSource.push({
          slug: source.slug,
          source: source.name || source.slug,
          ok: true,
          inserted: 0,
          updated: 0,
          cachedImages: 0,
          fetchedCount: 0,
          errors: [],
        });
        continue;
      }

      const summary: SourceSummary = {
        slug: source.slug,
        source: source.name || source.slug,
        ok: true,
        inserted: 0,
        updated: 0,
        cachedImages: 0,
        fetchedCount: 0,
        errors: [],
      };

      try {
        const fetched = await fetchRssText(sourceUrl, supabaseUrl);
        summary.viaProxy = fetched.viaProxy;
        summary.status = fetched.status;
        summary.contentType = fetched.contentType;
        summary.bodySnippet = fetched.bodySnippet;

        if (!fetched.ok) {
          summary.ok = false;
          const msg = fetched.blocked
            ? "Feed blocked / returned HTML challenge"
            : `RSS HTTP ${fetched.status}`;
          summary.errors.push(msg);
          errors.push({
            source: source.slug,
            error: msg,
            status: fetched.status,
            contentType: fetched.contentType,
            bodySnippet: fetched.bodySnippet,
          });
          perSource.push(summary);
          continue;
        }

        let parsed = parseRss(fetched.text).map((it) => normalizeRssItem(it));
        if (parsed.length === 0 && !fetched.viaProxy) {
          const retry = await fetchRssText(sourceUrl, supabaseUrl);
          summary.viaProxy = retry.viaProxy;
          summary.status = retry.status;
          summary.contentType = retry.contentType;
          summary.bodySnippet = retry.bodySnippet;
          if (retry.ok) parsed = parseRss(retry.text).map((it) => normalizeRssItem(it));
        }

        if (parsed.length === 0) {
          summary.ok = false;
          const msg = "No RSS items parsed";
          summary.errors.push(msg);
          errors.push({
            source: source.slug,
            error: msg,
            status: summary.status,
            contentType: summary.contentType,
            bodySnippet: summary.bodySnippet,
          });
          perSource.push(summary);
          continue;
        }

        summary.fetchedCount = parsed.length;
        const rows = normalizeRssItems(parsed, source).slice(0, maxItemsPerSource);
        const externalIds = rows.map((row) => String(row.external_id || "")).filter(Boolean);
        const { data: existingRows } = externalIds.length > 0
          ? await supabase.from("news_items").select("external_id").in("external_id", externalIds)
          : { data: [] };
        const existingSet = new Set((existingRows || []).map((r: any) => String(r.external_id)));

        for (const row of rows) {
          const extId = String(row.external_id || "");
          const { data: upserted, error } = await supabase
            .from("news_items")
            .upsert(row, { onConflict: "guid" })
            .select("id, image_url, cached_image_url, source_slug, source_key, external_id, guid")
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

          if (cacheImages && cachedImages < cacheLimit && upserted.image_url && (isBirdingPoland || !upserted.cached_image_url)) {
            const cacheResult = await cacheImage(supabase, supabaseUrl, upserted, { force: isBirdingPoland });
            if (cacheResult.ok) {
              cachedImages += 1;
              summary.cachedImages += 1;
            } else if (cacheResult.error) {
              summary.errors.push(`cacheImage: ${cacheResult.error}`);
            }
          }
        }
      } catch (e: any) {
        const msg = String(e?.message || e);
        summary.ok = false;
        summary.errors.push(msg);
        errors.push({ source: source.slug, error: msg, status: summary.status, contentType: summary.contentType, bodySnippet: summary.bodySnippet });
      }

      if (cacheImages && cachedImages < cacheLimit && isBirdingPoland) {
        const remaining = Math.max(0, cacheLimit - cachedImages);
        if (remaining > 0) {
          const { data: existingUncached } = await supabase
            .from("news_items")
            .select("id, image_url, cached_image_url, source_slug, source_key, external_id, guid")
            .eq("source_slug", source.slug)
            .is("cached_image_url", null)
            .not("image_url", "is", null)
            .order("published_at", { ascending: false })
            .limit(remaining);
          for (const item of existingUncached || []) {
            if (cachedImages >= cacheLimit) break;
            const cacheResult = await cacheImage(supabase, supabaseUrl, item, { force: true });
            if (cacheResult.ok) {
              cachedImages += 1;
              summary.cachedImages += 1;
            } else if (cacheResult.error) {
              summary.errors.push(`cacheImage(backfill): ${cacheResult.error}`);
            }
          }
        }
      }

      perSource.push(summary);
    }

    return json({
      ok: errors.length === 0,
      perSource,
      sources: perSource,
      totalInserted: inserted,
      totalUpdated: updated,
      itemsUpserted: inserted + updated,
      inserted,
      updated,
      cachedImages,
      skipped,
      errors,
    });
  } catch (error) {
    return jsonError("news-refresh", error, 500);
  }
});
