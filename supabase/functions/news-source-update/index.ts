import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  try {
    const { id, slug, source_key, key, name, type, feed_url, is_enabled, translate_to_et } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const updates: Record<string, any> = {};
    if (feed_url !== undefined) updates.feed_url = feed_url;
    if (typeof is_enabled === "boolean") updates.is_enabled = is_enabled;
    if (typeof translate_to_et === "boolean") updates.translate_to_et = translate_to_et;

    let query = supabase.from("news_sources").update(updates).select("id");
    if (id) {
      query = query.or(`id.eq.${id},slug.eq.${id},source_key.eq.${id},key.eq.${id}`);
    } else if (slug || source_key || key) {
      const filters = [slug && `slug.eq.${slug}`, source_key && `source_key.eq.${source_key}`, key && `key.eq.${key}`]
        .filter(Boolean)
        .join(",");
      query = query.or(filters);
    }
    const { data, error } = await query;

    if (error) throw error;
    if ((data || []).length === 0) {
      const insertPayload: Record<string, any> = {
        name: String(name || id || slug || source_key || key || "").trim(),
        slug: String(slug || id || "").trim(),
        source_key: String(source_key || id || slug || "").trim() || null,
        key: String(key || id || slug || "").trim() || null,
        type: String(type || "rss").trim() || "rss",
        is_enabled: typeof is_enabled === "boolean" ? is_enabled : true,
        translate_to_et: String(name || "").trim() === "EOÜ" || String(slug || id || "").trim() === "eoy"
          ? false
          : translate_to_et === true,
      };
      if (feed_url !== undefined) insertPayload.feed_url = feed_url;
      if (!insertPayload.name || !insertPayload.slug) {
        throw new Error("Missing name or slug for new source");
      }
      const { error: insertError } = await supabase.from("news_sources").insert(insertPayload);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("news-source-update error:", error);
    return new Response(JSON.stringify({ error: (error as any)?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
