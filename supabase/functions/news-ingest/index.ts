import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  // Validate ingest key
  const ingestKey = req.headers.get("x-ingest-key");
  const expectedKey = Deno.env.get("NEWS_INGEST_KEY");
  if (!expectedKey || ingestKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { source_slug, items } = body;

    if (!source_slug || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing source_slug or items array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find source
    const { data: source, error: srcErr } = await supabase
      .from("news_sources")
      .select("id")
      .eq("slug", source_slug)
      .single();

    if (srcErr || !source) {
      return new Response(
        JSON.stringify({ error: `Source '${source_slug}' not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const item of items) {
      const guid = item.guid || `${source_slug}:${item.url}`;
      const row = {
        source_id: source.id,
        source_slug,
        title: item.title || "",
        summary: item.summary || "",
        content_html: item.content_html || null,
        url: item.url || "",
        published_at: item.published_at || new Date().toISOString(),
        language: item.language || "et",
        guid,
      };
      const rowWithImage = item.image_url
        ? { ...row, image_url: item.image_url }
        : row;

      const { error, status } = await supabase
        .from("news_items")
        .upsert(rowWithImage, { onConflict: "guid" });

      if (error) {
        console.error(`Upsert error for ${guid}:`, error);
        errors++;
      } else {
        if (status === 201) inserted++;
        else updated++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, received: items.length, inserted, updated, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("news-ingest error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
