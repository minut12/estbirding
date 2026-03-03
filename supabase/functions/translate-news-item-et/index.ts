import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig, translateToEstonian } from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeLocaleCode(value: string | null | undefined): string {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.split(/[-_]/)[0] || trimmed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    if (!getOpenAIConfig()) return jsonResponse(400, { error: "Translation not configured" });
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
    const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!supabaseUrl || !serviceRole) return jsonResponse(500, { ok: false, error: "SERVICE_ROLE_MISSING" });

    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return jsonResponse(400, { ok: false, error: "MISSING_ID" });

    const supabase = createClient(
      supabaseUrl,
      serviceRole,
    );

    const { data: item, error } = await supabase
      .from("news_items")
      .select("id, source_key, url, title, body, source_lang, title_et, body_et")
      .eq("id", id)
      .single();

    if (error || !item) return jsonResponse(404, { ok: false, error: "NEWS_ITEM_NOT_FOUND" });
    if (item.title_et && item.body_et) {
      return jsonResponse(200, { ok: true, id: item.id, title_et: item.title_et, body_et: item.body_et });
    }

    const title = String(item.title || "");
    const bodyText = String(item.body || "");
    const normalizedSourceLang = normalizeLocaleCode(item.source_lang);
    const isEstonianSource = item.source_key === "eoy" || normalizedSourceLang === "et";

    const translated = isEstonianSource
      ? { title_et: title, body_et: bodyText }
      : await translateToEstonian({
        title,
        body: bodyText,
        sourceLang: normalizedSourceLang || "auto",
      });

    const { data: updated, error: updateError } = await supabase
      .from("news_items")
      .update({
        title_et: translated.title_et || null,
        body_et: translated.body_et || null,
        translated_at: new Date().toISOString(),
        translation_status: "done",
        translation_error: null,
      })
      .eq("id", id)
      .select("id, title_et, body_et")
      .single();
    if (updateError || !updated) throw updateError || new Error("UPDATE_FAILED");

    return jsonResponse(200, { ok: true, id: updated.id, title_et: updated.title_et, body_et: updated.body_et });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: (error as Error)?.message || String(error) });
  }
});
