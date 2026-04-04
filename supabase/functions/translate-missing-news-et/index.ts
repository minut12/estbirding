import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig, translateToEstonian } from "../_shared/openai.ts";
import { getAnthropicConfig } from "../_shared/anthropic.ts";
import { applyBirdNameCorrections, logBirdNameCorrections, prepareBirdNameCorrectionFromOriginalText } from "../_shared/bird-name-correction.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

type MissingNewsItem = {
  id: string;
  source_key: string | null;
  source_lang: string | null;
  title: string | null;
  body: string | null;
  title_et: string | null;
  body_et: string | null;
  translate_hash: string | null;
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

function hasText(value: string | null | undefined): boolean {
  return String(value || "").trim().length > 0;
}

function correctBirdNamesSafely(
  id: string,
  title: string,
  bodyText: string,
  translatedTitle: string,
  translatedBody: string,
): { titleEt: string; bodyEt: string } {
  try {
    const preparedTitle = prepareBirdNameCorrectionFromOriginalText(title);
    const preparedBody = prepareBirdNameCorrectionFromOriginalText(bodyText);
    const correctedTitle = applyBirdNameCorrections(translatedTitle, preparedTitle.matches);
    const correctedBody = applyBirdNameCorrections(translatedBody, preparedBody.matches);

    logBirdNameCorrections(id, "title", correctedTitle.summary);
    logBirdNameCorrections(id, "body", correctedBody.summary);

    return {
      titleEt: correctedTitle.correctedText,
      bodyEt: correctedBody.correctedText,
    };
  } catch (error) {
    console.warn("[news-bird-names] correction skipped", {
      article_id: id,
      error: String((error as Error)?.message || error),
    });
    return {
      titleEt: translatedTitle,
      bodyEt: translatedBody,
    };
  }
}

async function updateTranslatedRow(
  supabase: any,
  id: string,
  title_et: string,
  body_et: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const basePayload: Record<string, unknown> = {
    title_et: title_et || null,
    body_et: body_et || null,
  };

  const fullPayload: Record<string, unknown> = {
    ...basePayload,
    translated_at: new Date().toISOString(),
    translation_status: "done",
    translation_error: null,
  };

  const full = await supabase.from("news_items").update(fullPayload).eq("id", id);
  if (!full.error) return { ok: true };

  const message = String(full.error.message || "").toLowerCase();
  const missingStatusColumn = message.includes("column") && (
    message.includes("translation_status") || message.includes("translation_error") || message.includes("translated_at")
  );

  if (!missingStatusColumn) {
    return { ok: false, error: String(full.error.message || "update failed") };
  }

  const retry = await supabase.from("news_items").update(basePayload).eq("id", id);
  if (retry.error) {
    return { ok: false, error: String(retry.error.message || "update failed") };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const reqUrl = new URL(req.url);
    if (req.method === "GET" && reqUrl.searchParams.get("ping") === "1") {
      return jsonResponse(200, { ok: true });
    }

    if (req.method !== "POST") {
      return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
    const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!supabaseUrl || !serviceRole) {
      return jsonResponse(500, { ok: false, error: "SERVICE_ROLE_MISSING" });
    }

    if (!getOpenAIConfig() && !getAnthropicConfig()) {
      return jsonResponse(400, { ok: false, error: "Translation not configured (no ANTHROPIC_API_KEY or OPENAI_API_KEY)" });
    }

    const body = await req.json().catch(() => ({}));
    const limitRaw = Number(body?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
    const force = Boolean(body?.force);

    const rawSourceKey = body?.source_key;
    const sourceKeys: string[] = Array.isArray(rawSourceKey)
      ? rawSourceKey.map(String)
      : typeof rawSourceKey === "string" && rawSourceKey.trim()
        ? [rawSourceKey.trim()]
        : [];

    const supabase = createClient(supabaseUrl, serviceRole);

    let query = supabase
      .from("news_items")
      .select("id, source_key, source_lang, title, body, title_et, body_et, translate_hash");

    if (force) {
      // Force mode: get ALL non-Estonian items (already translated or not)
      query = query.neq("source_lang", "et");
    } else {
      // Normal mode: only items missing translation
      query = query.or("title_et.is.null,body_et.is.null");
    }

    // Source key filter — expand known aliases
    if (sourceKeys.length > 0) {
      const expandedKeys = new Set<string>();
      for (const key of sourceKeys) {
        expandedKeys.add(key);
        if (key === "birding_poland" || key === "facebook_birdingpoland") {
          expandedKeys.add("birding_poland");
          expandedKeys.add("facebook_birdingpoland");
        }
      }
      query = query.in("source_key", [...expandedKeys]);
    }

    query = query.order("published_at", { ascending: false }).limit(limit * 2);

    const { data, error } = await query;
    if (error) {
      return jsonResponse(500, { ok: false, error: String(error.message || "QUERY_FAILED") });
    }

    const candidates = ((data || []) as MissingNewsItem[])
      .filter((row) => hasText(row.title) || hasText(row.body))
      .slice(0, limit);

    const processed: Array<{ id: string }> = [];
    const updated: Array<{ id: string; title_et: string; body_et: string }> = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const item of candidates) {
      processed.push({ id: item.id });
      try {
        // In force mode, clear existing translation so it won't be skipped
        if (force) {
          await supabase.from("news_items").update({
            title_et: null,
            body_et: null,
            translate_hash: null,
            translation_status: "pending",
            translated_at: null,
            translation_error: null,
          }).eq("id", item.id);
          item.title_et = null;
          item.body_et = null;
          item.translate_hash = null;
        }

        if (!force && hasText(item.title_et) && hasText(item.body_et)) {
          updated.push({ id: item.id, title_et: String(item.title_et || ""), body_et: String(item.body_et || "") });
          continue;
        }

        const title = String(item.title || "");
        const bodyText = String(item.body || "");
        const lang = normalizeLocaleCode(item.source_lang);
        const isEstonian = item.source_key === "eoy" || lang === "et";

        const translated = isEstonian
          ? { title_et: title, body_et: bodyText }
          : await translateToEstonian({
            title,
            body: bodyText,
            sourceLang: lang || "auto",
          });

        const corrected = correctBirdNamesSafely(item.id, title, bodyText, translated.title_et, translated.body_et);
        const persist = await updateTranslatedRow(supabase, item.id, corrected.titleEt, corrected.bodyEt);
        if (!persist.ok) {
          errors.push({ id: item.id, error: persist.error });
          continue;
        }

        updated.push({
          id: item.id,
          title_et: String(corrected.titleEt || ""),
          body_et: String(corrected.bodyEt || ""),
        });
      } catch (e) {
        const errorText = String((e as Error)?.message || e || "TRANSLATE_FAILED").slice(0, 240);
        errors.push({ id: item.id, error: errorText });
        try {
          await supabase
            .from("news_items")
            .update({ translation_status: "error", translation_error: errorText } as any)
            .eq("id", item.id);
        } catch { /* ignore */ }
      }
    }

    return jsonResponse(200, {
      ok: true,
      force,
      source_keys: sourceKeys.length > 0 ? sourceKeys : "all",
      limit,
      processed: processed.length,
      updated: updated.length,
      errors,
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: String((e as Error)?.message || e || "UNEXPECTED_ERROR") });
  }
});
