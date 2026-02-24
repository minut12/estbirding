import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getExtension(contentType: string | null): string {
  if (!contentType) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const newsItemId = typeof body.news_item_id === "string" ? body.news_item_id : "";
    if (!newsItemId) {
      return new Response(JSON.stringify({ error: "Missing news_item_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: item, error } = await supabase
      .from("news_items")
      .select("id, source_key, external_id, image_url, cached_image_url")
      .eq("id", newsItemId)
      .single();

    if (error || !item) {
      return new Response(JSON.stringify({ error: "news_item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (item.cached_image_url) {
      return new Response(JSON.stringify({ cached_image_url: item.cached_image_url, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!item.image_url) {
      return new Response(JSON.stringify({ error: "image_url is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageRes = await fetch(item.image_url, {
      headers: { "User-Agent": "EstBirding/1.0" },
    });
    if (!imageRes.ok) {
      return new Response(JSON.stringify({ error: `Image fetch failed ${imageRes.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = imageRes.headers.get("content-type");
    const ext = getExtension(contentType);
    const filePath = `${item.source_key || "news"}/${item.external_id || item.id}.${ext}`;
    const bytes = await imageRes.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("news-images")
      .upload(filePath, bytes, {
        upsert: true,
        contentType: contentType || "image/jpeg",
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cachedImageUrl = `${supabaseUrl}/storage/v1/object/public/news-images/${filePath}`;
    await supabase.from("news_items").update({
      cached_image_url: cachedImageUrl,
    }).eq("id", item.id);

    return new Response(JSON.stringify({ cached_image_url: cachedImageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
