import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function isMissingTranslateColumnError(error: unknown): boolean {
  const err = error as { message?: string; code?: string; details?: string } | null;
  const text = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
  return err?.code === "PGRST204" || (text.includes("translate_to_et") && text.includes("column"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const slug = String(body?.slug || body?.id || "").trim();
    const sourceKey = String(body?.source_key || body?.id || body?.slug || "").trim();
    const key = String(body?.key || body?.id || body?.slug || "").trim();
    const name = String(body?.name || body?.slug || body?.id || "").trim();
    const type = String(body?.type || "rss").trim() || "rss";
    const feedUrl = body?.feed_url === undefined ? undefined : String(body.feed_url || "").trim() || null;
    const isEnabled = typeof body?.is_enabled === "boolean" ? body.is_enabled : true;
    const translateToEt = name === "EOÜ" || slug === "eoy" ? false : body?.translate_to_et === true;

    if (!id || !slug || !name) {
      return jsonResponse(400, {
        error: "Missing id, slug or name",
        source_name: name || null,
        source_id: id || null,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    console.log("[news-source-update:start]", {
      source_id: id,
      source_name: name,
      slug,
      source_key: sourceKey || null,
      enabled: isEnabled,
      source_type: type,
      rss_url: feedUrl || null,
      translate_to_et: translateToEt,
    });

    const lookupFilters = [
      isUuid(id) ? `id.eq.${id}` : "",
      slug ? `slug.eq.${slug}` : "",
      sourceKey ? `source_key.eq.${sourceKey}` : "",
      key ? `key.eq.${key}` : "",
    ].filter(Boolean);

    console.log("[news-source-update:lookup]", { id, isUuid: isUuid(id), filters: lookupFilters });

    const { data: existingRows, error: lookupError } = lookupFilters.length > 0
      ? await supabase.from("news_sources").select("id, slug, name, source_key, key").or(lookupFilters.join(","))
      : await supabase.from("news_sources").select("id").limit(0);

    if (lookupError) throw lookupError;

    const payloadBase: Record<string, unknown> = {
      name,
      slug,
      type,
      is_enabled: isEnabled,
      source_key: sourceKey || null,
      key: key || null,
    };
    if (feedUrl !== undefined) payloadBase.feed_url = feedUrl;
    const payloadWithTranslate = { ...payloadBase, translate_to_et: translateToEt };
    const payloadWithoutTranslate = { ...payloadBase };

    if ((existingRows || []).length === 0) {
      let inserted: { id?: string; slug?: string; name?: string } | null = null;
      let insertError: unknown = null;
      ({ data: inserted, error: insertError } = await supabase
        .from("news_sources")
        .insert(payloadWithTranslate)
        .select("id, slug, name")
        .single());
      if (insertError && isMissingTranslateColumnError(insertError)) {
        ({ data: inserted, error: insertError } = await supabase
          .from("news_sources")
          .insert(payloadWithoutTranslate)
          .select("id, slug, name")
          .single());
      }
      if (insertError) throw insertError;

      console.log("[news-source-update:inserted]", {
        source_id: inserted?.id || null,
        source_name: inserted?.name || name,
        slug: inserted?.slug || slug,
      });

      return jsonResponse(200, { success: true, action: "inserted", source: inserted });
    }

    const existing = existingRows[0];
    let updated: { id?: string; slug?: string; name?: string } | null = null;
    let updateError: unknown = null;
    ({ data: updated, error: updateError } = await supabase
      .from("news_sources")
      .update(payloadWithTranslate)
      .eq("id", existing.id)
      .select("id, slug, name")
      .single());
    if (updateError && isMissingTranslateColumnError(updateError)) {
      ({ data: updated, error: updateError } = await supabase
        .from("news_sources")
        .update(payloadWithoutTranslate)
        .eq("id", existing.id)
        .select("id, slug, name")
        .single());
    }
    if (updateError) throw updateError;

    console.log("[news-source-update:updated]", {
      source_id: updated?.id || existing.id,
      source_name: updated?.name || name,
      slug: updated?.slug || slug,
    });

    return jsonResponse(200, { success: true, action: "updated", source: updated });
  } catch (error) {
    const err = error as { message?: string; details?: string; hint?: string; code?: string };
    const payload = {
      error: err?.message || String(error),
      details: err?.details || null,
      hint: err?.hint || null,
      code: err?.code || null,
      source: "news-source-update",
    };
    console.error("news-source-update error:", payload);
    return jsonResponse(500, payload);
  }
});
