import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig, translateToEstonian } from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const output = data?.choices?.[0]?.message?.content?.trim().toLowerCase() || "unknown";
  return output.slice(0, 2);
}

function heuristicLanguage(title: string, body: string): string | null {
  const text = `${title}\n${body}`.toLowerCase();
  if (/[ąćęłńóśźż]/.test(text)) return "pl";
  if (/[õäöü]/.test(text)) return "et";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    if (!getOpenAIConfig()) {
      return jsonResponse(400, { error: "Translation not configured" });
    }

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

    const title = item.title || "";
    const bodyText = item.body || "";
    const contentHash = await sha256Hex(`${title}\n${bodyText}`);

    let sourceLang = item.source_lang || "";
    if (!sourceLang) {
      if (item.source_key === "facebook_birdingpoland") sourceLang = "pl";
      else if (item.source_key === "eoy") sourceLang = "et";
      else sourceLang = heuristicLanguage(title, bodyText) || await classifyLanguageWithOpenAI(title, bodyText);
    }

    if (item.source_key === "eoy" || sourceLang.startsWith("et")) {
      await supabase.from("news_items").update({
        source_lang: "et",
        translation_status: "done",
        translated_at: new Date().toISOString(),
        translate_hash: contentHash,
      }).eq("id", id);
      return jsonResponse(200, { id, status: "done", skipped: true, reason: "already_estonian" });
    }

    if (item.title_et && item.body_et && item.translate_hash === contentHash) {
      await supabase.from("news_items").update({
        source_lang: sourceLang,
        translation_status: "done",
      }).eq("id", id);
      return jsonResponse(200, { id, status: "done", skipped: true, reason: "hash_match" });
    }

    try {
      const translated = await translateToEstonian({
        title,
        body: bodyText,
        sourceLang,
      });
      await supabase.from("news_items").update({
        source_lang: sourceLang,
        title_et: translated.title_et || null,
        body_et: translated.body_et || null,
        translation_status: "done",
        translation_error: null,
        translated_at: new Date().toISOString(),
        translate_hash: contentHash,
      }).eq("id", id);

      return jsonResponse(200, { id, status: "done", source_lang: sourceLang });
    } catch (translateError) {
      await supabase.from("news_items").update({
        source_lang: sourceLang,
        translation_status: "error",
        translation_error: String(translateError?.message || translateError).slice(0, 240),
      }).eq("id", id);
      return jsonResponse(500, { id, status: "error", error: String(translateError?.message || translateError) });
    }
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
});
