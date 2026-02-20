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

  try {
    // Validate ingest key
    const ingestKey = req.headers.get("x-ingest-key");
    const expectedKey = Deno.env.get("EVENTS_INGEST_KEY");
    if (!expectedKey || ingestKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { source_slug, items } = body;

    if (!source_slug || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "source_slug and items[] are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get source
    const { data: source, error: srcErr } = await supabase
      .from("events_sources")
      .select("id, slug")
      .eq("slug", source_slug)
      .single();

    if (srcErr || !source) {
      return new Response(
        JSON.stringify({ error: `Source "${source_slug}" not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const category = source_slug === "estbirding" ? "estbirding" : "other";

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const item of items) {
      if (!item.title || !item.start_at) {
        errors++;
        continue;
      }

      const guid = item.guid || `${source_slug}:${item.url || item.title + item.start_at}`;

      const row = {
        source_id: source.id,
        source_slug,
        category,
        title: item.title,
        description: item.description || "",
        content_html: item.content_html || null,
        location_name: item.location_name || null,
        location_lat: item.location_lat ?? null,
        location_lon: item.location_lon ?? null,
        start_at: item.start_at,
        end_at: item.end_at || null,
        all_day: item.all_day ?? false,
        url: item.url || null,
        image_url: item.image_url || null,
        registration_url: item.registration_url || null,
        tags: item.tags || null,
        language: item.language || "et",
        guid,
        is_cancelled: item.is_cancelled ?? false,
      };

      const { error, status } = await supabase
        .from("events")
        .upsert(row, { onConflict: "guid" });

      if (!error) {
        if (status === 201) inserted++;
        else updated++;
      } else {
        console.error(`Upsert error for ${guid}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted, updated, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("events-ingest error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
