import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const BROWSER_UA = "Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "user-agent": BROWSER_UA,
    "accept-language": "en-US,en;q=0.9,et;q=0.8",
    ...extra,
  };
}

function getExtension(contentType: string | null): string {
  if (!contentType) return "bin";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "bin";
}

function isFacebookHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".fbcdn.net") || host.endsWith(".facebook.com") || host.endsWith(".fbsbx.com") || host.includes("scontent");
  } catch {
    return /fbcdn\.net|facebook\.com|fbsbx\.com|scontent-/i.test(url);
  }
}

async function fetchImage(url: string): Promise<{ ok: true; response: Response } | { ok: false; status: number; url: string }> {
  const isFb = isFacebookHost(url);
  const res = await fetch(url, {
    method: "GET",
    headers: browserHeaders({
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...(isFb ? { referer: "https://www.facebook.com/", origin: "https://www.facebook.com" } : {}),
    }),
    redirect: "follow",
  });
  if (!res.ok) {
    console.log("[cache-news-image] fetch failed", { status: res.status, url });
    return { ok: false, status: res.status, url };
  }
  return { ok: true, response: res };
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

    let attempt = await fetchImage(targetImageUrl);
    if (!attempt.ok) {
      const wsrv = `https://images.weserv.nl/?url=${encodeURIComponent(targetImageUrl.replace(/^https?:\/\//i, ""))}`;
      attempt = await fetchImage(wsrv);
      if (!attempt.ok) {
        return new Response(JSON.stringify(attempt), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    let imageRes = attempt.response;
    const ct1 = String(imageRes.headers.get("content-type") || "").toLowerCase();
    const len1 = Number(imageRes.headers.get("content-length") || "0");
    const directValid = imageRes.ok
      && ct1.startsWith("image/")
      && (!Number.isFinite(len1) || len1 <= 0 || len1 <= MAX_IMAGE_BYTES);
    if (!directValid) {
      const wsrv = `https://images.weserv.nl/?url=${encodeURIComponent(targetImageUrl.replace(/^https?:\/\//i, ""))}`;
      const wsrvAttempt = await fetchImage(wsrv);
      if (!wsrvAttempt.ok) {
        return new Response(JSON.stringify(wsrvAttempt), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      imageRes = wsrvAttempt.response;
    }
    const contentType = String(imageRes.headers.get("content-type") || "").toLowerCase();
    const contentLength = Number(imageRes.headers.get("content-length") || "0");
    if (!imageRes.ok || !contentType.startsWith("image/")) {
      return new Response(JSON.stringify({ error: `Image fetch failed ${imageRes.status} (${contentType || "unknown"})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: `Image too large ${contentLength}` }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ext = getExtension(contentType);
    const sourcePath = item?.source_key || sourceName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "news";
    const keyBasis = item?.external_id || item?.id || itemUrl || targetImageUrl;
    const keyHash = await sha1Hex(String(keyBasis));
    const filePath = `${sourcePath}/${keyHash}.${ext}`;
    const bytes = await imageRes.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return new Response(JSON.stringify({ error: `Image too large ${bytes.byteLength}` }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: uploadError } = await supabase.storage
      .from("news-images")
      .upload(filePath, bytes, {
        upsert: true,
        contentType: contentType || "application/octet-stream",
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
