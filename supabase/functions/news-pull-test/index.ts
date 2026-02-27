import { fetchSourceItems, normalizeSourceUrl, SourceFetchError } from "../_shared/source-fetch.ts";

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
    const { slug, source_key, id, name, feed_url, type, kind, proxyBase } = await req.json();
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

    const base = String(proxyBase || Deno.env.get("NEWS_PROXY_BASE") || "").trim();
    const sourceName = String(name || id || slug || source_key || "unknown").trim() || "unknown";
    const items = (await fetchSourceItems({
      id,
      slug,
      source_key,
      name: sourceName,
      feed_url: normalizeSourceUrl(String(feed_url || "")),
      type,
      kind,
    }, base)).slice(0, 3);

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
    if (error instanceof SourceFetchError) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message, status: error.status || null, source: error.sourceName, count: 0, sampleTitles: [], items: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: false, error: error.message, count: 0, sampleTitles: [], items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
