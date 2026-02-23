const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TranslateNewsRequest {
  title?: string;
  body?: string;
  source_lang?: string;
  target_lang?: string;
}

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

function parseTranslationPayload(raw: string): { title_et: string; body_et: string } {
  const parsed = JSON.parse(raw);
  const title_et = typeof parsed?.title_et === "string" ? parsed.title_et.trim() : "";
  const body_et = typeof parsed?.body_et === "string" ? parsed.body_et.trim() : "";
  return { title_et, body_et };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return jsonResponse(500, { error: "OPENAI_API_KEY is not configured" });

    const body = await req.json().catch(() => ({} as TranslateNewsRequest)) as TranslateNewsRequest;
    const title = (body.title || "").trim();
    const articleBody = (body.body || "").trim();
    const sourceLang = (body.source_lang || "auto").trim();
    const targetLang = (body.target_lang || "et").trim();
    const translateHash = await sha256Hex(`${sourceLang}|${targetLang}|${title}|${articleBody}`);

    if (!title && !articleBody) {
      return jsonResponse(200, { title_et: "", body_et: "", translate_hash: translateHash });
    }

    const model = Deno.env.get("OPENAI_TRANSLATION_MODEL") || "gpt-4.1-mini";
    const openAiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "Translate text to Estonian. Return strict JSON with keys title_et and body_et only. No markdown.",
          },
          {
            role: "user",
            content: `source_lang=${sourceLang}\ntarget_lang=${targetLang}\n\nTITLE:\n${title}\n\nBODY:\n${articleBody}`,
          },
        ],
        text: {
          format: {
            type: "json_object",
          },
        },
      }),
    });

    if (!openAiRes.ok) {
      return jsonResponse(500, { error: `OpenAI error ${openAiRes.status}: ${await openAiRes.text()}` });
    }

    const openAiJson = await openAiRes.json();
    const outputText = typeof openAiJson?.output_text === "string" ? openAiJson.output_text : "";
    if (!outputText) return jsonResponse(500, { error: "OpenAI returned empty output_text" });

    const { title_et, body_et } = parseTranslationPayload(outputText);
    return jsonResponse(200, { title_et, body_et, translate_hash: translateHash });
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
});
