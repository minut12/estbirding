import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig } from "../_shared/openai.ts";
import { jsonResponse, translateNewsItemToEt } from "../_shared/news-translation.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(200, null);
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    if (!getOpenAIConfig()) return jsonResponse(400, { error: "Translation not configured" });

    const body = await req.json().catch(() => ({}));
    const limit = Number.isFinite(body?.limit) ? Math.max(1, Math.min(50, Number(body.limit))) : 5;
    const enqueueOnly = body?.enqueue_only === true;
    const ids = Array.isArray(body?.ids) ? body.ids.filter((v: unknown) => typeof v === "string" && v.trim()) : [];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (ids.length > 0) {
      const { data: missingEtItems, error: missingEtError } = await supabase
        .from("news_items")
        .select("id")
        .in("id", ids)
        .or("title_et.is.null,body_et.is.null");
      if (missingEtError) throw missingEtError;
      if (missingEtItems && missingEtItems.length > 0) {
        const payload = missingEtItems.map((row) => ({
          news_item_id: row.id,
          status: "pending",
          updated_at: new Date().toISOString(),
        }));
        const { error: enqueueError } = await supabase
          .from("news_translation_queue")
          .upsert(payload, { onConflict: "news_item_id" });
        if (enqueueError) throw enqueueError;
      }
      if (enqueueOnly) {
        return jsonResponse(200, { success: true, enqueued: missingEtItems?.length || 0, processed: 0 });
      }
    } else if (enqueueOnly) {
      return jsonResponse(200, { success: true, enqueued: 0, processed: 0 });
    }

    const { data: queueRows, error: queueError } = await supabase
      .from("news_translation_queue")
      .select("news_item_id, attempts")
      .eq("status", "pending")
      .order("queued_at", { ascending: true })
      .limit(limit);
    if (queueError) throw queueError;

    if (!queueRows || queueRows.length === 0) {
      return jsonResponse(200, { success: true, translated: 0, failed: 0, skipped: 0, processed: 0 });
    }

    const queueById = new Map<string, number>();
    const queueIds = queueRows.map((row) => {
      const id = String(row.news_item_id);
      queueById.set(id, Number(row.attempts || 0));
      return id;
    });

    const { data: items, error: itemsError } = await supabase
      .from("news_items")
      .select("id, source_key, title, body, source_lang, title_et, body_et, translate_hash")
      .in("id", queueIds);
    if (itemsError) throw itemsError;
    if (!items || items.length === 0) {
      return jsonResponse(200, { success: true, translated: 0, failed: 0, skipped: 0, processed: 0 });
    }

    let translated = 0;
    let failed = 0;
    let skipped = 0;
    let failureStreak = 0;

    for (const item of items) {
      const result = await translateNewsItemToEt(supabase, item);
      const attempts = (queueById.get(item.id) || 0) + 1;
      if (result.status === "error") {
        failed++;
        failureStreak++;
        await supabase
          .from("news_translation_queue")
          .update({
            status: "pending",
            attempts,
            last_error: String(result.error || "translation_failed").slice(0, 240),
            last_attempt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("news_item_id", item.id);
      } else if (result.skipped) {
        skipped++;
        failureStreak = 0;
        await supabase
          .from("news_translation_queue")
          .update({
            status: "done",
            attempts,
            last_error: null,
            last_attempt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("news_item_id", item.id);
      } else {
        translated++;
        failureStreak = 0;
        await supabase
          .from("news_translation_queue")
          .update({
            status: "done",
            attempts,
            last_error: null,
            last_attempt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("news_item_id", item.id);
      }

      const backoffMs = failureStreak > 0 ? Math.min(3000, 500 * failureStreak) : 200;
      await sleep(backoffMs);
    }

    return jsonResponse(200, { success: true, translated, failed, skipped, processed: items.length });
  } catch (error) {
    return jsonResponse(500, { error: (error as Error)?.message || String(error) });
  }
});
