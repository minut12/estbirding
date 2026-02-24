import { getOpenAIConfig, translateToEstonian } from "../_shared/openai.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    if (!getOpenAIConfig()) return jsonResponse(400, { error: "Translation not configured" });

    const body = await req.json().catch(() => ({} as TranslateNewsRequest)) as TranslateNewsRequest;
    const title = (body.title || "").trim();
    const articleBody = (body.body || "").trim();
    const sourceLang = (body.source_lang || "auto").trim();
    const targetLang = (body.target_lang || "et").trim();
    const translateHash = await sha256Hex(`${sourceLang}|${targetLang}|${title}|${articleBody}`);

    if (!title && !articleBody) {
      return jsonResponse(200, { title_et: "", body_et: "", translate_hash: translateHash });
    }

    const { title_et, body_et } = await translateToEstonian({
      title,
      body: articleBody,
      sourceLang: sourceLang || targetLang || "auto",
    });
    return jsonResponse(200, { title_et, body_et, translate_hash: translateHash });
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
});
