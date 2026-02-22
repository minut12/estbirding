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
    const { feed_url } = await req.json();
    if (!feed_url) {
      return new Response(JSON.stringify({ error: "Missing feed_url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(feed_url, {
      headers: { "User-Agent": "EstBirding/1.0" },
    });
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `HTTP ${res.status}`, items: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const text = await res.text();
    const items = parseRss(text)
      .map(normalizeRssItem)
      .slice(0, 3)
      .map((item) => ({
        title: item.title,
        image_url: item.image_url,
        body_preview: item.body.slice(0, 120),
        published_at: item.published_at,
      }));

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
