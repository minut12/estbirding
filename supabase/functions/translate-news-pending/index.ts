import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig } from "../_shared/openai.ts";
import { corsHeaders, jsonResponse, translateNewsItemToEt } from "../_shared/news-translation.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    if (!getOpenAIConfig()) return jsonResponse(400, { error: "Translation not configured" });

    const body = await req.json().catch(() => ({}));
    const limit = Number.isFinite(body?.limit) ? Math.max(1, Math.min(50, Number(body.limit))) : 5;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: items, error } = await supabase
      .from("news_items")
      .select("id, source_key, title, body, source_lang, title_et, body_et, translate_hash")
      .neq("source_key", "eoy")
      .or("title_et.is.null,body_et.is.null,translation_status.eq.pending,translation_status.eq.error")
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!items || items.length === 0) {
      return jsonResponse(200, { success: true, translated: 0, failed: 0, skipped: 0 });
    }

    let translated = 0;
    let failed = 0;
    let skipped = 0;
    let failureStreak = 0;

    for (const item of items) {
      const result = await translateNewsItemToEt(supabase, item);
      if (result.status === "error") {
        failed++;
        failureStreak++;
      } else if (result.skipped) {
        skipped++;
        failureStreak = 0;
      } else {
        translated++;
        failureStreak = 0;
      }

      const backoffMs = failureStreak > 0 ? Math.min(3000, 500 * failureStreak) : 200;
      await sleep(backoffMs);
    }

    return jsonResponse(200, { success: true, translated, failed, skipped });
  } catch (error) {
    return jsonResponse(500, { error: (error as Error)?.message || String(error) });
  }
});
