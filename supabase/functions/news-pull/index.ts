import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeRssItem, parseRss } from "../_shared/rss-normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const BIRDING_POLAND_KEY = "facebook_birdingpoland";
const IS_DEV = Deno.env.get("DENO_DEPLOYMENT_ID") == null;
const AUTO_TRANSLATE_TO_ET = (Deno.env.get("AUTO_TRANSLATE_TO_ET") || "true").toLowerCase() !== "false";

function decodeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.replaceAll("&amp;", "&").replaceAll("&#38;", "&");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function translateViaEdgeFunction(
  id: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/translate-news-item`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({
      id,
    }),
  });

  if (!res.ok) {
    throw new Error(`translate-news-item failed: HTTP ${res.status} ${await res.text()}`);
  }
}

async function cacheImageViaEdgeFunction(newsItemId: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return;

  const res = await fetch(`${supabaseUrl}/functions/v1/cache-news-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({ news_item_id: newsItemId }),
  });
  if (!res.ok && IS_DEV) {
    console.warn("[cache-image] failed", newsItemId, res.status);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sources, error: srcErr } = await supabase
      .from("news_sources")
      .select("*")
      .eq("is_active", true)
      .eq("is_enabled", true)
      .not("feed_url", "is", null);

    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No enabled sources with feed_url", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ source: string; fetched: number; inserted: number; skipped: boolean; error?: string }> = [];

    for (const source of sources) {
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
            results.push({ source: source.slug, fetched: 0, inserted: 0, skipped: true });
            continue;
          }
        }
      }

      try {
        const feedRes = await fetch(source.feed_url!, {
          headers: { "User-Agent": "EstBirding/1.0" },
        });
        if (!feedRes.ok) {
          results.push({ source: source.slug, fetched: 0, inserted: 0, skipped: false, error: `HTTP ${feedRes.status}` });
          continue;
        }

        const text = await feedRes.text();
        const sourceKey = source.key || source.slug;
        const normalized = parseRss(text).map(normalizeRssItem);
        const sorted = normalized.sort((a, b) => toTimestamp(b.published_at) - toTimestamp(a.published_at));
        const items = sourceKey === BIRDING_POLAND_KEY ? sorted.slice(0, 1) : sorted.slice(0, 10);

        let inserted = 0;
        for (const item of items) {
          const externalId = item.external_id?.trim();
          if (!externalId) continue;

          if (IS_DEV) {
            console.log("[RSS] image_url", sourceKey, externalId, item.image_url || null);
          }

          const guid = `${source.slug}:${externalId}`;
          const lang = sourceKey === BIRDING_POLAND_KEY ? "pl" : "et";
          const originalTitle = item.title || item.body.slice(0, 80) || "";
          const originalBody = item.body || "";
          const contentHash = await sha256Hex(`${originalTitle}\n${originalBody}`);

          const row = {
            source_id: source.id,
            source_slug: source.slug,
            source_key: sourceKey,
            external_id: externalId,
            title: originalTitle,
            summary: item.body.slice(0, 500) || null,
            content_html: item.body_html || null,
            body: originalBody || null,
            url: item.permalink_url || "",
            permalink_url: item.permalink_url,
            published_at: item.published_at || new Date().toISOString(),
            language: lang,
            lang,
            guid,
            fetched_at: new Date().toISOString(),
            raw_json: item.raw_json,
            source_lang: lang,
          };
          const rowWithLang = lang === "et"
            ? { ...row, translation_status: "done" }
            : row;

          const decodedImageUrl = decodeUrl(item.image_url);
          const rowWithImage = decodedImageUrl
            ? { ...rowWithLang, image_url: decodedImageUrl }
            : rowWithLang;

          const { data: upserted, error } = await supabase
            .from("news_items")
            .upsert(rowWithImage, { onConflict: "source_slug,external_id" })
            .select("id, translate_hash, title_et, body_et, cached_image_url")
            .single();

          if (!error) inserted++;
          else console.error(`Upsert error for ${guid}:`, error);

          if (!error && upserted?.id) {
            if (decodedImageUrl && !upserted.cached_image_url) {
              await cacheImageViaEdgeFunction(upserted.id);
            }

            if (lang !== "et" && AUTO_TRANSLATE_TO_ET) {
              const shouldTranslate = !upserted.title_et || !upserted.body_et || upserted.translate_hash !== contentHash;
              if (shouldTranslate) {
                if (IS_DEV) console.log("[translate] run", guid, contentHash);
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
        }

        results.push({ source: source.slug, fetched: items.length, inserted, skipped: false });
      } catch (e) {
        results.push({ source: source.slug, fetched: 0, inserted: 0, skipped: false, error: e.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("news-pull error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function toTimestamp(value: string | null): number {
  if (!value) return 0;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}
