import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function decodeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.replaceAll("&amp;", "&").replaceAll("&#38;", "&");
}

function normalizeLocale(value: string | null | undefined): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.split(/[-_]/)[0] || raw;
}

function normalizePublishedAt(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function translateViaEdgeFunction(id: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  const canonicalFn = "translate-news-item-et";
  const res = await fetch(`${supabaseUrl}/functions/v1/${canonicalFn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
    },
    body: JSON.stringify({ id }),
  });

  if (!res.ok) {
    throw new Error(`${canonicalFn} failed: HTTP ${res.status} ${await res.text()}`);
  }
}

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
    const { source_slug, items, translateForeignNews } = body;

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
      .select("id, slug, source_key, key, name, translate_to_et")
      .eq("slug", source_slug)
      .single();

    if (srcErr || !source) {
      return new Response(
        JSON.stringify({ error: `Source '${source_slug}' not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const globalTranslateSetting = translateForeignNews !== false;
    const sourceName = String(source.name || source.slug || "unknown").trim() || "unknown";
    const sourceTranslateToEt = sourceName === "EOÜ" || source.slug === "eoy"
      ? false
      : source.translate_to_et === true;

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const item of items) {
      const guid = item.guid || `${source_slug}:${item.url}`;
      const sourceKey = String(source.source_key || source.key || source.slug || source_slug || "unknown").trim() || "unknown";
      const sourceLang = item.source_lang || item.lang || item.language || "et";
      const normalizedSourceLang = normalizeLocale(sourceLang);
      const title = item.title || "";
      const bodyText = item.body || "";
      const contentHash = await sha256Hex(`${title}\n${bodyText}`);
      const row = {
        source_id: source.id,
        source_slug,
        source_key: sourceKey,
        title,
        summary: item.summary || "",
        body: bodyText || null,
        content_html: item.content_html || null,
        url: item.url || "",
        published_at: normalizePublishedAt(item.published_at) || new Date().toISOString(),
        language: sourceLang,
        lang: sourceLang,
        source_lang: sourceLang,
        translation_status: normalizedSourceLang === "et"
          ? "done"
          : "pending",
        guid,
      };
      const decodedImageUrl = decodeUrl(item.image_url);
      const rowWithImage = decodedImageUrl
        ? { ...row, image_url: decodedImageUrl }
        : row;

      const { data: upserted, error, status } = await supabase
        .from("news_items")
        .upsert(rowWithImage, { onConflict: "guid" })
        .select("id, title_et, body_et, translate_hash")
        .single();

      if (error) {
        console.error(`Upsert error for ${guid}:`, error);
        errors++;
      } else {
        if (status === 201) inserted++;
        else updated++;

        const translationSkipped = sourceName === "EOÜ" || normalizedSourceLang === "et" || !sourceTranslateToEt || !globalTranslateSetting;
        console.log("[news-translate]", {
          source: sourceName,
          detected_language: normalizedSourceLang || "unknown",
          translate_to_et: sourceTranslateToEt,
          global_translate_setting: globalTranslateSetting,
          skipped: translationSkipped,
          handler: "translate-news-item-et",
        });
        if (upserted?.id && !translationSkipped) {
          const shouldTranslate = !upserted.title_et || !upserted.body_et || upserted.translate_hash !== contentHash;
          if (shouldTranslate) {
            try {
              await translateViaEdgeFunction(upserted.id);
            } catch (translateError) {
              console.error(`translate-news-item-et failed for ${guid}:`, translateError);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, received: items.length, inserted, updated, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("news-ingest error:", error);
    return new Response(JSON.stringify({ error: (error as any)?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
