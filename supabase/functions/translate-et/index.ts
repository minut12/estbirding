import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig } from "../_shared/openai.ts";

const MAX_TEXT_CHARS = 12_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || "unknown";
}

function checkRateLimit(req: Request): boolean {
  const ip = getClientIp(req);
  const now = Date.now();
  const current = requestBuckets.get(ip);
  if (!current || now >= current.resetAt) {
    requestBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  current.count += 1;
  requestBuckets.set(ip, current);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" });

  if (!checkRateLimit(req)) {
    return jsonResponse(429, { ok: false, error: "Too many requests" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { ok: false, error: "Supabase env is not configured" });
  }

  const cfg = getOpenAIConfig();
  if (!cfg) return jsonResponse(500, { ok: false, error: "Translation not configured" });

  let body: { text?: unknown; sourceLang?: unknown; targetLang?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: "Invalid JSON payload" });
  }

  const text = String(body?.text || "").trim();
  const targetLang = String(body?.targetLang || "et").trim() || "et";
  const sourceLang = String(body?.sourceLang || "auto").trim() || "auto";

  if (!text) return jsonResponse(400, { ok: false, error: "text is required" });
  if (text.length > MAX_TEXT_CHARS) return jsonResponse(413, { ok: false, error: "text is too large" });

  const cacheKey = await sha256Hex(`${targetLang}:${text}`);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: cachedRow } = await supabase
    .from("translation_cache")
    .select("translated_text")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cachedRow?.translated_text) {
    return jsonResponse(200, { ok: true, translatedText: cachedRow.translated_text });
  }

  const prompt = [
    `Translate the text to ${targetLang}.`,
    `Source language hint: ${sourceLang}.`,
    "Preserve paragraph breaks and formatting.",
    "Return only the translated text with no extra commentary.",
    "",
    text,
  ].join("\n");

  const openAiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model || "gpt-4.1-mini",
      input: prompt,
    }),
  });

  if (!openAiRes.ok) {
    const preview = (await openAiRes.text()).slice(0, 240);
    return jsonResponse(502, { ok: false, error: `OpenAI error ${openAiRes.status}: ${preview}` });
  }

  const data = await openAiRes.json();
  const translatedText = String(data?.output_text || "").trim();
  if (!translatedText) {
    return jsonResponse(502, { ok: false, error: "OpenAI returned empty output" });
  }

  await supabase
    .from("translation_cache")
    .upsert({
      cache_key: cacheKey,
      target_lang: targetLang,
      source_lang: sourceLang,
      original_text: text,
      translated_text: translatedText,
    }, { onConflict: "cache_key" });

  return jsonResponse(200, { ok: true, translatedText });
});
