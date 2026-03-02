import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ ok: false, error: "OPENAI_API_KEY_MISSING" }, 500);

    const sys =
      `You are a translation engine. Translate the user text to ${targetLang}. ` +
      `Return ONLY the translation, preserve paragraphs, no extra commentary.`;
    const user = sourceLang
      ? `Source language: ${sourceLang}\n\nText:\n${text}`
      : `Text:\n${text}`;

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
      return json({ ok: false, error: "OPENAI_ERROR", status: r.status, details: errText.slice(0, 400) }, 502);
    }

    const data = await r.json();
    const translatedText =
      data?.choices?.[0]?.message?.content?.trim?.() ?? "";

    return json({ ok: true, translatedText });
  } catch (e) {
    return json({ ok: false, error: "UNHANDLED", message: String(e) }, 500);
  }
});
