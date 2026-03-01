import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sourceSlug = String(body?.source_slug || "birding_poland").trim().toLowerCase();
    const limit = Math.max(1, Math.min(100, Number(body?.limit ?? 30) || 30));

    if (!["birding_poland", "facebook_birdingpoland"].includes(sourceSlug)) {
      return new Response(JSON.stringify({ error: "Only Birding Poland backfill is allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRole);

    const { data: items, error } = await supabase
      .from("news_items")
      .select("id, source_slug, image_url, cached_image_url")
      .eq("source_slug", sourceSlug)
      .is("cached_image_url", null)
      .not("image_url", "is", null)
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    let cached = 0;
    let failed = 0;
    const failures: Array<{ id: string; error: string }> = [];

    for (const item of items || []) {
      const res = await fetch(`${supabaseUrl}/functions/v1/cache-news-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRole}`,
          "apikey": serviceRole,
        },
        body: JSON.stringify({
          news_item_id: item.id,
          source: sourceSlug,
          imageUrl: item.image_url,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && (payload?.cached_image_url || payload?.skipped)) {
        cached += 1;
      } else {
        failed += 1;
        failures.push({ id: item.id, error: String(payload?.error || `HTTP ${res.status}`) });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      sourceSlug,
      attempted: (items || []).length,
      cached,
      failed,
      failures: failures.slice(0, 10),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
