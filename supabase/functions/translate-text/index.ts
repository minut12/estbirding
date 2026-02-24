import { getOpenAIConfig } from "../_shared/openai.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const cfg = getOpenAIConfig();
  if (!cfg) return jsonResponse(400, { error: "Translation not configured" });

  try {
    const body = await req.json().catch(() => ({}));
    const sourceLang = String(body?.source_lang || "auto");
    const targetLang = String(body?.target_lang || "et");
    const text = String(body?.text || "").trim();

    if (!text) return jsonResponse(200, { translated_text: "" });

    const prompt = [
      `Translate the following text from ${sourceLang} to ${targetLang}.`,
      "Preserve names, URLs, and line breaks.",
      "Return only translated text.",
      "",
      text,
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model || "gpt-4.1-mini",
        input: prompt,
      }),
    });

    if (!response.ok) {
      return jsonResponse(500, { error: `OpenAI error ${response.status}: ${await response.text()}` });
    }

    const data = await response.json();
    const translatedText = String(data?.output_text || "").trim();
    return jsonResponse(200, { translated_text: translatedText });
  } catch (error) {
    return jsonResponse(500, { error: (error as Error).message });
  }
});
