import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAnthropicConfig, callClaude, getSimpleTranslationSystemPrompt } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function translateWithOpenAI(apiKey: string, sys: string, user: string): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`OpenAI error: ${r.status} ${errText.slice(0, 400)}`);
  }

  const data = await r.json();
  return data?.choices?.[0]?.message?.content?.trim?.() ?? "";
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);

    if (req.method === "GET" && url.searchParams.get("ping") === "1") {
      return json({ ok: true, fn: "translate-et" });
    }

    if (req.method !== "POST") {
      return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    }

    const { text, targetLang = "et", sourceLang } = await req.json().catch(() => ({}));
    if (!text || typeof text !== "string" || !text.trim()) {
      return json({ ok: false, error: "MISSING_TEXT" }, 400);
    }
    if (text.length > 12000) {
      return json({ ok: false, error: "TEXT_TOO_LARGE" }, 413);
    }

    const userMessage = sourceLang
      ? `Source language: ${sourceLang}\n\nText:\n${text}`
      : `Text:\n${text}`;
    const sysPrompt = getSimpleTranslationSystemPrompt(targetLang);

    // Prefer Claude
    const anthropicCfg = getAnthropicConfig();
    if (anthropicCfg) {
      try {
        const translatedText = await callClaude(anthropicCfg, sysPrompt, userMessage);
        return json({ ok: true, translatedText });
      } catch (e) {
        console.warn("[translate-et] Claude failed, falling back to OpenAI:", (e as Error).message);
      }
    }

    // OpenAI fallback
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ ok: false, error: "API_KEY_MISSING" }, 500);

    const translatedText = await translateWithOpenAI(apiKey, sysPrompt, userMessage);
    return json({ ok: true, translatedText });
  } catch (e) {
    return json({ ok: false, error: "UNHANDLED", message: String(e) }, 500);
  }
});
