import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig, translateToEstonian } from "./openai.ts";
import { getAnthropicConfig, classifyLanguageClaude } from "./anthropic.ts";
import { applyBirdNameCorrections, logBirdNameCorrections, prepareBirdNameCorrectionFromOriginalText } from "./bird-name-correction.ts";

export interface NewsTranslationItem {
  id: string;
  source_name?: string | null;
  source_key: string | null;
  translate_to_et?: boolean | null;
  title: string | null;
  body: string | null;
  source_lang: string | null;
  title_et: string | null;
  body_et: string | null;
  translate_hash: string | null;
}

export interface TranslateResult {
  id: string;
  status: "done" | "error";
  skipped: boolean;
  handler: "translate-news-item-et";
  reason?: string;
  source_lang?: string;
  error?: string;
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

export function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

export function normalizeLocaleCode(value: string | null | undefined): string {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.split(/[-_]/)[0] || trimmed;
}

function isEoySource(item: NewsTranslationItem): boolean {
  return String(item.source_name || "").trim() === "EOÜ" || String(item.source_key || "").trim() === "eoy";
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function heuristicLanguage(title: string, body: string): string | null {
  const text = `${title}\n${body}`.toLowerCase();
  if (/[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]/i.test(text)) return "pl";
  if (/[\u00f5\u00e4\u00f6\u00fc]/i.test(text)) return "et";
  if (/[a-z]/i.test(text)) return "en";
  return null;
}

async function classifyLanguageWithOpenAI(title: string, body: string): Promise<string> {
  const cfg = getOpenAIConfig();
  if (!cfg) throw new Error("Translation not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Detect the language code of the text. Respond with a two-letter ISO language code only.",
        },
        {
          role: "user",
          content: `TITLE:\n${title}\n\nBODY:\n${body}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Language classification failed: ${res.status}`);
  const data = await res.json();
  const output = String(data?.choices?.[0]?.message?.content || "").trim().toLowerCase();
  return output.slice(0, 2);
}

async function detectSourceLanguage(item: NewsTranslationItem, title: string, body: string): Promise<string> {
  const known = normalizeLocaleCode(item.source_lang);
  if (known) return known;
  if (item.source_key === "facebook_birdingpoland") return "pl";
  if (isEoySource(item)) return "et";
  const heuristic = heuristicLanguage(title, body);
  if (heuristic) return heuristic;

  // Prefer Claude for language detection
  if (getAnthropicConfig()) {
    try {
      return await classifyLanguageClaude(title, body);
    } catch (e) {
      console.warn("[lang-detect] Claude failed, falling back to OpenAI:", (e as Error).message);
    }
  }
  return await classifyLanguageWithOpenAI(title, body);
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

export async function translateNewsItemToEt(
  supabase: SupabaseClient,
  item: NewsTranslationItem,
  options: { force?: boolean } = {},
): Promise<TranslateResult> {
  const id = item.id;
  const title = item.title || "";
  const bodyText = item.body || "";
  const contentHash = await sha256Hex(`${title}\n${bodyText}`);
  const sourceLang = await detectSourceLanguage(item, title, bodyText);
  const normalizedSourceLang = normalizeLocaleCode(sourceLang);
  const sourceName = String(item.source_name || item.source_key || "unknown").trim() || "unknown";
  const translateToEt = isEoySource(item) ? false : item.translate_to_et === true;
  const isEstonianSource = isEoySource(item) || normalizedSourceLang === "et";

  console.log("[news-translate]", {
    source: sourceName,
    detected_language: normalizedSourceLang || "unknown",
    translate_to_et: translateToEt,
    global_translate_setting: "pipeline",
    skipped: isEstonianSource || !translateToEt,
    handler: "translate-news-item-et",
  });

  if (isEstonianSource) {
    await supabase.from("news_items").update({
      source_lang: "et",
      translation_status: "done",
      translation_error: null,
      title_et: null,
      body_et: null,
      translated_at: null,
      translate_hash: contentHash,
    }).eq("id", id);
    return { id, status: "done", skipped: true, handler: "translate-news-item-et", reason: "already_estonian", source_lang: "et" };
  }

  if (!translateToEt) {
    await supabase.from("news_items").update({
      source_lang: normalizedSourceLang || sourceLang,
      title_et: null,
      body_et: null,
      translation_status: "done",
      translation_error: null,
      translated_at: null,
      translate_hash: contentHash,
    }).eq("id", id);
    return {
      id,
      status: "done",
      skipped: true,
      handler: "translate-news-item-et",
      reason: "source_translation_disabled",
      source_lang: normalizedSourceLang || sourceLang,
    };
  }

  if (!options.force && item.title_et && item.body_et && item.translate_hash === contentHash) {
    await supabase.from("news_items").update({
      source_lang: normalizedSourceLang || sourceLang,
      translation_status: "done",
      translation_error: null,
    }).eq("id", id);
    return {
      id,
      status: "done",
      skipped: true,
      handler: "translate-news-item-et",
      reason: "hash_match",
      source_lang: normalizedSourceLang || sourceLang,
    };
  }

  try {
    const preparedTitle = prepareBirdNameCorrectionFromOriginalText(title);
    const preparedBody = prepareBirdNameCorrectionFromOriginalText(bodyText);
    const translated = await translateToEstonian({
      title: preparedTitle.maskedText || title,
      body: preparedBody.maskedText || bodyText,
      sourceLang: normalizedSourceLang || sourceLang || "auto",
    });
    const corrected = correctBirdNamesSafely(id, title, bodyText, translated.title_et, translated.body_et);

    await supabase.from("news_items").update({
      source_lang: normalizedSourceLang || sourceLang,
      title_et: corrected.titleEt || null,
      body_et: corrected.bodyEt || null,
      translation_status: "done",
      translation_error: null,
      translated_at: new Date().toISOString(),
      translate_hash: contentHash,
    }).eq("id", id);

    return { id, status: "done", skipped: false, handler: "translate-news-item-et", source_lang: normalizedSourceLang || sourceLang };
  } catch (translateError) {
    const errorText = String((translateError as Error)?.message || translateError).slice(0, 240);
    await supabase.from("news_items").update({
      source_lang: normalizedSourceLang || sourceLang,
      translation_status: "error",
      translation_error: errorText,
    }).eq("id", id);

    return {
      id,
      status: "error",
      skipped: false,
      handler: "translate-news-item-et",
      source_lang: normalizedSourceLang || sourceLang,
      error: errorText,
    };
  }
}

