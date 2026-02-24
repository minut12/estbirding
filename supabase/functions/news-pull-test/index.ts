import { normalizeRssItem, parseRss } from "../_shared/rss-normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slug, source_key, feed_url, type, kind } = await req.json();
    if (!feed_url && slug !== "eoy" && source_key !== "eoy") {
      return new Response(JSON.stringify({ error: "Missing feed_url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedKind = String(kind || type || "").toLowerCase();
    const isEoy = slug === "eoy" || source_key === "eoy" || resolvedKind.includes("scrap");
    if (isEoy) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        return new Response(JSON.stringify({ ok: false, count: 0, sampleTitles: [], error: "Missing Supabase env" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dryRunRes = await fetch(`${supabaseUrl}/functions/v1/fetch-eoy-news`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
        },
        body: JSON.stringify({ dry_run: true, feed_url }),
      });
      const dryData = await dryRunRes.json().catch(() => ({}));
      if (!dryRunRes.ok) {
        return new Response(JSON.stringify({
          ok: false,
          count: 0,
          sampleTitles: [],
          error: dryData?.error || `EOY dry-run failed: ${dryRunRes.status}`,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        count: Number(dryData?.count || 0),
        sampleTitles: Array.isArray(dryData?.sampleTitles) ? dryData.sampleTitles : [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(feed_url, {
      headers: { "User-Agent": "EstBirding/1.0" },
    });
    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `HTTP ${res.status}`, count: 0, sampleTitles: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const text = await res.text();
    const items = parseRss(text)
      .map(normalizeRssItem)
      .slice(0, 3);

    return new Response(
      JSON.stringify({
        ok: true,
        count: items.length,
        sampleTitles: items.map((item) => item.title).filter(Boolean),
        items: items.map((item) => ({
          title: item.title,
          image_url: item.image_url,
          body_preview: item.body.slice(0, 120),
          published_at: item.published_at,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message, count: 0, sampleTitles: [], items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
