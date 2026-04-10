import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

async function verifyAuth(req: Request): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (token === serviceRoleKey) {
    return { ok: true };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, error: "Invalid or expired token" };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  // Auth check
  const auth = await verifyAuth(req);
  if (!auth.ok) {
    return jsonResponse(401, { error: "Unauthorized", message: auth.error });
  }

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
    return jsonResponse(500, { error: (error as any)?.message || String(error) });
  }
});
