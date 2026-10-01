// redeploy-marker: 2026-10-01 - P89 Anthropic Messages with Gemini fallback (reactive + LLM_FORCE_PROVIDER)
//
// Drop-in for `fetch("https://api.anthropic.com/v1/messages", ...)`.
// Every call site keeps reading an Anthropic-shaped body (content[].text,
// stop_reason, usage, model); when the reply came from Gemini it is re-shaped
// into that form, so the existing max_tokens guards and parsers are untouched.
//
// Provider order:
//   LLM_FORCE_PROVIDER=gemini   -> Gemini only (manual switch, e.g. credits out)
//   otherwise                   -> Claude first; Gemini on a *credit / quota /
//                                  outage* class failure (see shouldFallback)
// A timeout (AbortError from the caller's signal) is never retried on Gemini:
// it is not a credit problem and the signal is already aborted.
//
// Env (Supabase Secrets): ANTHROPIC_API_KEY, GEMINI_API_KEY,
//   GEMINI_MODEL (default gemini-2.5-flash), LLM_FORCE_PROVIDER (anthropic|gemini)

export type LlmProvider = "anthropic" | "gemini";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

type AnthropicTextBlock = { type?: string; text?: string };
type AnthropicMessage = { role: string; content: string | AnthropicTextBlock[] };

export interface AnthropicMessagesRequest {
  model: string;
  max_tokens: number;
  system?: string | AnthropicTextBlock[];
  messages: AnthropicMessage[];
  temperature?: number;
}

export interface AnthropicShapedResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<{ type: "text"; text: string }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  llm_provider: LlmProvider;
}

export function forcedProvider(): LlmProvider | null {
  const v = (Deno.env.get("LLM_FORCE_PROVIDER") || "").trim().toLowerCase();
  if (v === "gemini" || v === "anthropic") return v;
  return null;
}

export function geminiConfigured(): boolean {
  return !!(Deno.env.get("GEMINI_API_KEY") || "").trim();
}

export function anthropicConfigured(): boolean {
  return !!(Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
}

/** True when at least one provider has a key. Mirrors the old "AI configured" checks. */
export function llmConfigured(): boolean {
  const forced = forcedProvider();
  if (forced === "gemini") return geminiConfigured();
  return anthropicConfigured() || geminiConfigured();
}

// Claude failures that mean "money / quota / outage", not "our request is wrong".
// 400 is only a fallback when the body talks about credit or billing; any other
// 400 is a bug in the request and must surface as before.
export function shouldFallback(status: number, body: string): boolean {
  if (status === 400) return /credit|billing|balance/i.test(body);
  if (status === 401 || status === 402 || status === 403) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

function blocksToText(c: string | AnthropicTextBlock[] | undefined): string {
  if (!c) return "";
  if (typeof c === "string") return c;
  return c.map((b) => (b && typeof b.text === "string" ? b.text : "")).filter(Boolean).join("\n");
}

function toGeminiBody(req: AnthropicMessagesRequest): Record<string, unknown> {
  const sys = blocksToText(req.system);
  const contents = (req.messages || []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: blocksToText(m.content) }],
  }));
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: req.max_tokens,
    // Flash would otherwise spend max_tokens on hidden thinking and come back
    // truncated -> every call site's max_tokens guard would fire.
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (typeof req.temperature === "number") generationConfig.temperature = req.temperature;
  const body: Record<string, unknown> = { contents, generationConfig };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  return body;
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

function geminiToAnthropic(g: GeminiResponse, model: string): AnthropicShapedResponse {
  const cand = g.candidates?.[0];
  const text = (cand?.content?.parts || [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
  const fr = cand?.finishReason || "";
  const stop_reason = fr === "MAX_TOKENS" ? "max_tokens" : "end_turn";
  return {
    id: "gemini_" + Date.now().toString(36),
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text }],
    stop_reason,
    usage: {
      input_tokens: g.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: g.usageMetadata?.candidatesTokenCount ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    llm_provider: "gemini",
  };
}

async function callGemini(req: AnthropicMessagesRequest, signal?: AbortSignal): Promise<Response> {
  const apiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!apiKey) throw new Error("missing_env:GEMINI_API_KEY");
  const model = (Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL).trim();
  const res = await fetch(GEMINI_BASE + "/" + model + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(toGeminiBody(req)),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    // Same contract as a failed Anthropic call: non-2xx Response, body = error text.
    return new Response("gemini HTTP " + res.status + ": " + text.slice(0, 600), {
      status: res.status,
      headers: { "content-type": "text/plain" },
    });
  }
  let parsed: GeminiResponse;
  try {
    parsed = JSON.parse(text) as GeminiResponse;
  } catch {
    return new Response("gemini non-JSON body: " + text.slice(0, 300), { status: 502 });
  }
  if (!parsed.candidates?.length) {
    const why = parsed.promptFeedback?.blockReason || parsed.error?.message || "no candidates";
    return new Response("gemini empty: " + why, { status: 502 });
  }
  const shaped = geminiToAnthropic(parsed, model);
  console.log(
    "[llm] provider=gemini model=" + model + " stop_reason=" + shaped.stop_reason +
      " in=" + shaped.usage.input_tokens + " out=" + shaped.usage.output_tokens,
  );
  return new Response(JSON.stringify(shaped), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * POST an Anthropic Messages request. Returns a Response exactly like
 * fetch(ANTHROPIC_URL) would, except that a credit/quota/outage failure (or
 * LLM_FORCE_PROVIDER=gemini) is served by Gemini re-shaped as Anthropic JSON.
 */
export async function anthropicMessages(
  req: AnthropicMessagesRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const forced = forcedProvider();
  if (forced === "gemini") {
    console.log("[llm] provider=gemini reason=LLM_FORCE_PROVIDER");
    return callGemini(req, signal);
  }

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!apiKey) {
    if (forced !== "anthropic" && geminiConfigured()) {
      console.log("[llm] provider=gemini reason=missing_env:ANTHROPIC_API_KEY");
      return callGemini(req, signal);
    }
    throw new Error("missing_env:ANTHROPIC_API_KEY");
  }

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    const aborted = (e instanceof DOMException && e.name === "AbortError") || signal?.aborted;
    if (aborted || forced === "anthropic" || !geminiConfigured()) throw e;
    console.log("[llm] provider=gemini reason=anthropic_network:" + String(e).slice(0, 120));
    return callGemini(req, signal);
  }

  if (res.ok || forced === "anthropic" || !geminiConfigured()) return res;

  const body = await res.text();
  if (!shouldFallback(res.status, body)) {
    // Re-wrap: the body was consumed to inspect it.
    return new Response(body, { status: res.status, headers: res.headers });
  }
  console.log("[llm] provider=gemini reason=anthropic_http_" + res.status + " " + body.slice(0, 160).replace(/\s+/g, " "));
  return callGemini(req, signal);
}
