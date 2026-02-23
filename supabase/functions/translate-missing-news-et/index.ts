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
    const requestedIds = Array.isArray(body?.ids)
      ? body.ids
        .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id: string) => id.trim())
        .slice(0, 100)
      : [];
    const limit = Number.isFinite(body?.limit) ? Math.max(1, Math.min(100, Number(body.limit))) : 20;
    const includeArchived = body?.include_archived === true;
    const onlySourceKey = typeof body?.source_key === "string" && body.source_key.trim()
      ? body.source_key.trim()
      : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = supabase
      .from("news_items")
      .select("id, source_key, title, body, source_lang, title_et, body_et, translate_hash")
      .neq("source_key", "eoy");

    if (requestedIds.length > 0) {
      query = query.in("id", requestedIds);
    } else {
      query = query
        .or("title_et.is.null,body_et.is.null,translation_status.eq.pending,translation_status.eq.error")
        .order("published_at", { ascending: false })
        .limit(limit);
    }

    if (!includeArchived) query = query.eq("archived", false);
    if (onlySourceKey) query = query.eq("source_key", onlySourceKey);

    const { data: items, error } = await query;
    if (error) throw error;
    if (!items || items.length === 0) {
      return jsonResponse(200, { success: true, scanned: 0, translated: 0, skipped: 0, failed: 0 });
    }

    let translated = 0;
    let skipped = 0;
    let failed = 0;
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

    return jsonResponse(200, {
      success: true,
      scanned: items.length,
      translated,
      skipped,
      failed,
    });
  } catch (error) {
    return jsonResponse(500, { error: (error as Error)?.message || String(error) });
  }
});
