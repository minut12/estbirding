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

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const sourceName = typeof body.source === "string" ? body.source : "";
    const itemUrl = typeof body.itemUrl === "string" ? body.itemUrl : "";
    const directImageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
    if (!newsItemId && (!itemUrl || !directImageUrl)) {
      return new Response(JSON.stringify({ error: "Missing news_item_id or (itemUrl + imageUrl)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let item: any = null;
    if (newsItemId) {
      const { data, error } = await supabase
        .from("news_items")
        .select("id, source_key, external_id, image_url, cached_image_url, url")
        .eq("id", newsItemId)
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "news_item not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      item = data;
      if (item.cached_image_url) {
        return new Response(JSON.stringify({ cached_image_url: item.cached_image_url, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const targetImageUrl = String(item?.image_url || directImageUrl || "").trim();
    if (!targetImageUrl) {
      return new Response(JSON.stringify({ error: "image_url is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isFbCdn = /fbcdn\.net|facebook\.com|scontent-/i.test(targetImageUrl);
    let imageRes = await fetch(targetImageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "EstBirding/1.0",
        "Accept": "image/*,*/*;q=0.8",
        ...(isFbCdn ? { "Referer": "https://www.facebook.com/" } : {}),
      },
      redirect: "follow",
    });
    if (!imageRes.ok) {
      const proxiedUrl = `${supabaseUrl}/functions/v1/proxy?url=${encodeURIComponent(targetImageUrl)}`;
      imageRes = await fetch(proxiedUrl, {
        method: "GET",
        headers: {
          "User-Agent": "EstBirding/1.0",
          "Accept": "image/*,*/*;q=0.8",
          ...(isFbCdn ? { "Referer": "https://www.facebook.com/" } : {}),
        },
        redirect: "follow",
      });
    }
    if (!imageRes.ok) {
      return new Response(JSON.stringify({ error: `Image fetch failed ${imageRes.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = imageRes.headers.get("content-type");
    const ext = getExtension(contentType);
    const sourcePath = item?.source_key || sourceName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "news";
    const keyBasis = item?.external_id || item?.id || itemUrl || targetImageUrl;
    const keyHash = await sha1Hex(String(keyBasis));
    const filePath = `${sourcePath}/${keyHash}.${ext}`;
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
    if (item?.id) {
      await supabase.from("news_items").update({
        cached_image_url: cachedImageUrl,
        cached_image_path: filePath,
      }).eq("id", item.id);
    }

    return new Response(JSON.stringify({ cached_image_url: cachedImageUrl, cached_image_path: filePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
