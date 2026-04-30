// Redeploy marker V3 2026-04-30T13:00 — force re-bundle, traceable log markers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig } from "../_shared/openai.ts";
import { jsonResponse, translateNewsItemToEt } from "../_shared/news-translation.ts";

function isMissingTranslateColumnError(error: unknown): boolean {
  const err = error as { message?: string; code?: string; details?: string } | null;
  const text = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();
  return err?.code === "PGRST204" || (text.includes("translate_to_et") && text.includes("column"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(200, null);
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    if (!getOpenAIConfig()) return jsonResponse(400, { error: "Translation not configured" });

    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    const force = body.force === true;
    if (!id) return jsonResponse(400, { error: "Missing id" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let item: any = null;
    let error: any = null;
    ({ data: item, error } = await supabase
      .from("news_items")
      .select("id, source_key, title, body, source_lang, title_et, body_et, translate_hash, source_id, news_sources(name, translate_to_et)")
      .eq("id", id)
      .single());
    if (error && isMissingTranslateColumnError(error)) {
      ({ data: item, error } = await supabase
        .from("news_items")
        .select("id, source_key, title, body, source_lang, title_et, body_et, translate_hash, source_id, news_sources(name)")
        .eq("id", id)
        .single());
    }

    if (error || !item) return jsonResponse(404, { error: "news_item not found" });

    const sourceMeta = Array.isArray((item as any).news_sources) ? (item as any).news_sources[0] : (item as any).news_sources;
    const result = await translateNewsItemToEt(supabase, {
      id: item.id,
      source_key: item.source_key,
      title: item.title,
      body: item.body,
      source_lang: item.source_lang,
      title_et: item.title_et,
      body_et: item.body_et,
      translate_hash: item.translate_hash,
      source_name: sourceMeta?.name ?? null,
      translate_to_et: sourceMeta?.translate_to_et ?? true,
    }, { force });
    const statusCode = result.status === "error" ? 500 : 200;
    return jsonResponse(statusCode, result);
  } catch (error) {
    return jsonResponse(500, { error: (error as Error)?.message || String(error) });
  }
});
