import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.208.0/encoding/hex.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sha1(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = new Uint8Array(hashBuffer);
  return new TextDecoder().decode(hexEncode(hashArray));
}

function normalizeUrl(url: string, baseUrl: string): string {
  try { return new URL(url, baseUrl).toString(); } catch { return url; }
}

/* Extract first meaningful image from an article page */
function extractImageFromArticlePage(html: string, baseUrl: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return null;

  // 1) og:image
  const ogImg = doc.querySelector('meta[property="og:image"]');
  if (ogImg) {
    const content = ogImg.getAttribute("content");
    if (content) return normalizeUrl(content, baseUrl);
  }

  // 2) Entry image
  const entryImg = doc.querySelector(".entry-image img");
  if (entryImg) {
    const src = entryImg.getAttribute("src") || entryImg.getAttribute("data-src");
    if (src) return normalizeUrl(src, baseUrl);
  }

  // 3) First large image in article body
  const imgs = doc.querySelectorAll("article img, .entry img, .content img, main img");
  for (const img of imgs) {
    const src = (img as Element).getAttribute("src") || (img as Element).getAttribute("data-src");
    if (src && !src.includes("logo") && !src.includes("icon") && !src.includes("avatar")) {
      return normalizeUrl(src, baseUrl);
    }
  }

  return null;
}

async function rehostImage(
  originalUrl: string,
  supabase: any,
  supabaseUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(originalUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)" },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
      : "jpg";

    const hash = await sha1(originalUrl);
    const path = `eoy/${hash}.${ext}`;

    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const { error } = await supabase.storage
      .from("news-images")
      .upload(path, arrayBuffer, { contentType, upsert: true });

    if (error) { console.error("Upload error:", error); return null; }
    return `${supabaseUrl}/storage/v1/object/public/news-images/${path}`;
  } catch (e) {
    console.error("Rehost error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get items missing images
    const { data: items, error } = await supabase
      .from("news_items")
      .select("id, url, image_url, image_url_original")
      .eq("source_slug", "eoy")
      .order("published_at", { ascending: false });

    if (error) throw error;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ message: "No items to backfill" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    let failed = 0;

    for (const item of items) {
      // Skip if already has a working rehosted image
      if (item.image_url && item.image_url.includes("supabase")) continue;

      let originalUrl = item.image_url_original;

      // If no original URL, try to extract from the article page
      if (!originalUrl && item.url) {
        try {
          const res = await fetch(item.url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)" },
          });
          if (res.ok) {
            const html = await res.text();
            originalUrl = extractImageFromArticlePage(html, "https://www.eoy.ee");
          }
        } catch (e) {
          console.error(`Failed to fetch article ${item.url}:`, e);
        }
      }

      if (!originalUrl) {
        failed++;
        continue;
      }

      // Rehost the image
      const rehostedUrl = await rehostImage(originalUrl, supabase, supabaseUrl);
      if (!rehostedUrl) {
        failed++;
        continue;
      }

      // Update DB
      const { error: updateErr } = await supabase
        .from("news_items")
        .update({
          image_url: rehostedUrl,
          image_url_original: originalUrl,
        })
        .eq("id", item.id);

      if (updateErr) {
        console.error(`Update error for ${item.id}:`, updateErr);
        failed++;
      } else {
        updated++;
        console.log(`Backfilled image for: ${item.url}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: items.length, updated, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("backfill-news-images error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
