import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

async function verifyAuth(req: Request): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Allow service-role calls (from other Edge Functions)
  if (token === serviceRoleKey) {
    return { ok: true };
  }

  // Verify user JWT
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, error: "Invalid or expired token" };
  }
  return { ok: true };
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

Deno.serve(async (req) => {
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

    // Auth check — require valid JWT or service-role key
    const auth = await verifyAuth(req);
    if (!auth.ok) {
      return json({ ok: false, error: "UNAUTHORIZED", message: auth.error }, 401);
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
