import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeRssItem, parseRss } from "../_shared/rss-normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const BIRDING_POLAND_KEY = "facebook_birdingpoland";

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

        if (sourceKey === BIRDING_POLAND_KEY && items[0]) {
          console.log("[news-pull] sanity normalized preview", {
            source: source.slug,
            title: items[0].title,
            image_url: items[0].image_url,
            bodyText: items[0].body.slice(0, 120),
          });
        }

        let inserted = 0;
        for (const item of items) {
          const externalId = item.external_id?.trim();
          if (!externalId) continue;

          const guid = `${source.slug}:${externalId}`;

          const row = {
            source_id: source.id,
            source_slug: source.slug,
            source_key: sourceKey,
            external_id: externalId,
            title: item.title || item.body.slice(0, 80) || "",
            summary: item.body.slice(0, 500) || null,
            content_html: item.body_html || null,
            body: item.body || null,
            url: item.permalink_url || "",
            permalink_url: item.permalink_url,
            image_url: item.image_url,
            published_at: item.published_at || new Date().toISOString(),
            language: "et",
            guid,
            fetched_at: new Date().toISOString(),
            raw_json: item.raw_json,
          };

          const { error } = await supabase
            .from("news_items")
            .upsert(row, { onConflict: "source_slug,external_id" });

          if (!error) inserted++;
          else console.error(`Upsert error for ${guid}:`, error);
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
