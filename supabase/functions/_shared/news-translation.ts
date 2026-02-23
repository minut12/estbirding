import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig, translateToEstonian } from "./openai.ts";

export interface NewsTranslationItem {
  id: string;
  source_key: string | null;
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

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function heuristicLanguage(title: string, body: string): string | null {
  const text = `${title}\n${body}`.toLowerCase();
  if (/[\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c]/i.test(text)) return "pl";
  if (/[õäöü]/i.test(text)) return "et";
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
  if (item.source_key === "eoy") return "et";
  return heuristicLanguage(title, body) || await classifyLanguageWithOpenAI(title, body);
}

export async function translateNewsItemToEt(
  supabase: SupabaseClient,
  item: NewsTranslationItem,
): Promise<TranslateResult> {
  const id = item.id;
  const title = item.title || "";
  const bodyText = item.body || "";
  const contentHash = await sha256Hex(`${title}\n${bodyText}`);
  const sourceLang = await detectSourceLanguage(item, title, bodyText);
  const normalizedSourceLang = normalizeLocaleCode(sourceLang);
  const isEstonianSource = item.source_key === "eoy" || normalizedSourceLang === "et";

  if (isEstonianSource) {
    await supabase.from("news_items").update({
      source_lang: "et",
      translation_status: "done",
      translation_error: null,
      translated_at: new Date().toISOString(),
      translate_hash: contentHash,
    }).eq("id", id);
    return { id, status: "done", skipped: true, reason: "already_estonian", source_lang: "et" };
  }

  if (item.title_et && item.body_et && item.translate_hash === contentHash) {
    await supabase.from("news_items").update({
      source_lang: normalizedSourceLang || sourceLang,
      translation_status: "done",
      translation_error: null,
    }).eq("id", id);
    return { id, status: "done", skipped: true, reason: "hash_match", source_lang: normalizedSourceLang || sourceLang };
  }

  try {
    const translated = await translateToEstonian({
      title,
      body: bodyText,
      sourceLang: normalizedSourceLang || sourceLang || "auto",
    });

    await supabase.from("news_items").update({
      source_lang: normalizedSourceLang || sourceLang,
      title_et: translated.title_et || null,
      body_et: translated.body_et || null,
      translation_status: "done",
      translation_error: null,
      translated_at: new Date().toISOString(),
      translate_hash: contentHash,
    }).eq("id", id);

    return { id, status: "done", skipped: false, source_lang: normalizedSourceLang || sourceLang };
  } catch (translateError) {
    const errorText = String((translateError as Error)?.message || translateError).slice(0, 240);
    await supabase.from("news_items").update({
      source_lang: normalizedSourceLang || sourceLang,
      translation_status: "error",
      translation_error: errorText,
    }).eq("id", id);

    return { id, status: "error", skipped: false, source_lang: normalizedSourceLang || sourceLang, error: errorText };
  }
}
