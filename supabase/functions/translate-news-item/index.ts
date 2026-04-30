// Redeploy marker V3 2026-04-30T13:00 — force re-bundle, traceable log markers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig } from "../_shared/openai.ts";
import { jsonResponse, translateNewsItemToEt } from "../_shared/news-translation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(200, null);
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    if (!getOpenAIConfig()) return jsonResponse(400, { error: "Translation not configured" });

    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return jsonResponse(400, { error: "Missing id" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: item, error } = await supabase
      .from("news_items")
      .select("id, source_key, title, body, source_lang, title_et, body_et, translate_hash")
      .eq("id", id)
      .single();

    if (error || !item) return jsonResponse(404, { error: "news_item not found" });

    const result = await translateNewsItemToEt(supabase, item);
    const statusCode = result.status === "error" ? 500 : 200;
    return jsonResponse(statusCode, result);
  } catch (error) {
    return jsonResponse(500, { error: (error as Error)?.message || String(error) });
  }
});
