// redeploy-marker: 2026-10-09 - P108b Mistral JSON mode when the prompt demands JSON output
// redeploy-marker: 2026-10-09 - P108 Mistral (free tier) as third provider after the Gemini chain
// redeploy-marker: 2026-10-08 - P97f2 per-attempt llm_calls logging (source, provider, model, ok, error_class, tokens, latency, fallback)
// redeploy-marker: 2026-10-01 - P89c drop thinkingConfig (400 INVALID_ARGUMENT on Gemini 3.x), 1024 output floor
// redeploy-marker: 2026-10-01 - P89b Gemini model chain + retry on 429/503 (gemini-2.5-flash retired for new keys)
// redeploy-marker: 2026-10-01 - P89 Anthropic Messages with Gemini fallback (reactive + LLM_FORCE_PROVIDER)
//
// Drop-in for `fetch("https://api.anthropic.com/v1/messages", ...)`.
// Every call site keeps reading an Anthropic-shaped body (content[].text,
// stop_reason, usage, model); when the reply came from Gemini it is re-shaped
// into that form, so the existing max_tokens guards and parsers are untouched.
//
// Provider order:
//   LLM_FORCE_PROVIDER=gemini   -> Gemini only (manual switch, e.g. credits out)
//   LLM_FORCE_PROVIDER=mistral  -> Mistral only
//   otherwise                   -> Claude first; on a *credit / quota / outage*
//                                  class failure (see shouldFallback) the backup
//                                  chain: Gemini models, then Mistral models (P108)
// A timeout (AbortError from the caller's signal) is never retried on Gemini:
// it is not a credit problem and the signal is already aborted.
//
// Env (Supabase Secrets): ANTHROPIC_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY,
//   GEMINI_MODEL / MISTRAL_MODEL (comma-separated chains, tried in order;
//   defaults below), LLM_FORCE_PROVIDER (anthropic|gemini|mistral)
// A backup without a key is skipped, so Mistral is inert until MISTRAL_API_KEY is set.
// Gemini free tier returns 503 UNAVAILABLE "high demand" often; each model in
// the chain is tried up to GEMINI_ATTEMPTS times with a short backoff before
// moving to the next model. The last failure is what the caller sees.
//
// P97f2: every provider attempt writes one row to public.llm_calls (service
// role, fire-and-forget via EdgeRuntime.waitUntil). Logging never awaits on
// the caller's path, never reads the returned body (clones only) and never
// throws; a missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY disables it.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type LlmProvider = "anthropic" | "gemini" | "mistral";

type LlmErrorClass =
  | "credit"
  | "rate_limit"
  | "overload"
  | "auth"
  | "timeout"
  | "network"
  | "bad_request"
  | "empty"
  | "other";

type LlmCallRow = {
  provider: LlmProvider;
  model: string;
  ok: boolean;
  http_status: number | null;
  error_class: LlmErrorClass | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  fallback: boolean;
};

type LogClient = SupabaseClient;

const LOG_TIMEOUT_MS = 2000;
const PRUNE_PROBABILITY = 0.02;

let logClient: LogClient | null = null;
let logClientTried = false;

function getLogClient(): LogClient | null {
  if (logClientTried) return logClient;
  logClientTried = true;
  try {
    const url = (Deno.env.get("SUPABASE_URL") || "").trim();
    const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!url || !key) {
      console.log("[llm] llm_calls logging disabled: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return null;
    }
    logClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  } catch (e) {
    logClient = null;
    console.log("[llm] llm_calls client init failed: " + String(e).slice(0, 120));
  }
  return logClient;
}

// Keep a logging promise alive past the response without ever surfacing its
// rejection. Never awaited by the caller.
function background(p: Promise<unknown>): void {
  const wrapped = p.catch((e: unknown) => {
    try {
      console.log("[llm] llm_calls log failed: " + String(e).slice(0, 120));
    } catch {
      // ignore
    }
  });
  try {
    const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (rt && typeof rt.waitUntil === "function") rt.waitUntil(wrapped);
  } catch {
    // fire-and-forget: wrapped already swallows its own rejection
  }
}

function logCall(row: LlmCallRow): void {
  try {
    const client = getLogClient();
    if (!client) return;
    const full = { source: LLM_SOURCE, ...row };
    // Promise.resolve: postgrest builders are thenables (PromiseLike), not Promises.
    background(
      Promise.resolve(client.from("llm_calls").insert(full).abortSignal(AbortSignal.timeout(LOG_TIMEOUT_MS)))
        .then((r) => {
          if (r.error) console.log("[llm] llm_calls insert error: " + r.error.message.slice(0, 120));
        }),
    );
    if (Math.random() < PRUNE_PROBABILITY) {
      background(
        Promise.resolve(client.rpc("llm_calls_prune").abortSignal(AbortSignal.timeout(LOG_TIMEOUT_MS)))
          .then((r) => {
            if (r.error) console.log("[llm] llm_calls_prune error: " + r.error.message.slice(0, 120));
          }),
      );
    }
  } catch {
    // logging must never affect the caller
  }
}

function functionNameFrom(s: string): string | null {
  const p = s.replace(/\\/g, "/");
  const a = /\/functions\/([A-Za-z0-9_-]+)\//.exec(p);
  if (a && a[1] !== "_shared") return a[1];
  const b = /\/([A-Za-z0-9_-]+)\/index\.ts/.exec(p);
  if (b && b[1] !== "_shared") return b[1];
  return null;
}

function sourceFromMainModule(): string | null {
  try {
    const m = Deno.mainModule;
    return typeof m === "string" ? functionNameFrom(m) : null;
  } catch {
    return null;
  }
}

function sourceFromStack(): string | null {
  try {
    const stack = new Error().stack || "";
    for (const line of stack.split("\n")) {
      if (line.replace(/\\/g, "/").includes("/_shared/")) continue;
      const name = functionNameFrom(line);
      if (name) return name;
    }
  } catch {
    // ignore
  }
  return null;
}

function detectSource(): string {
  try {
    let via = "mainModule";
    let name = sourceFromMainModule();
    if (!name) {
      via = "stack";
      name = sourceFromStack();
    }
    if (!name) {
      via = "default";
      name = "unknown";
    }
    console.log("[llm] source=" + name + " via=" + via);
    return name;
  } catch {
    return "unknown";
  }
}

const LLM_SOURCE: string = detectSource();

function isAbortError(e: unknown, signal?: AbortSignal): boolean {
  return (e instanceof DOMException && e.name === "AbortError") || !!signal?.aborted;
}

function classifyAnthropic(status: number, body: string): LlmErrorClass {
  if (status === 400 && /credit|billing|balance/i.test(body)) return "credit";
  if (status === 402) return "credit";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "overload";
  if (status >= 400 && status < 500) return "bad_request";
  return "other";
}

function classifyGemini(status: number, body: string): LlmErrorClass {
  if (body.startsWith("gemini empty") || body.startsWith("mistral empty")) return "empty";
  if (body.startsWith("gemini non-JSON") || body.startsWith("mistral non-JSON")) return "other";
  if (status === 429) return "rate_limit";
  if (status === 500 || status === 503) return "overload";
  if (status === 401 || status === 403) return "auth";
  if (status >= 400 && status < 500) return "bad_request";
  return "other";
}

function tokenOf(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function anthropicRow(model: string, latency: number): LlmCallRow {
  return {
    provider: "anthropic",
    model,
    ok: false,
    http_status: null,
    error_class: null,
    input_tokens: null,
    output_tokens: null,
    latency_ms: latency,
    fallback: false,
  };
}

// res.ok: read usage from a clone in the background; the original stays unread.
function logAnthropicOk(res: Response, model: string, latency: number): void {
  const base: LlmCallRow = { ...anthropicRow(model, latency), ok: true, http_status: res.status };
  try {
    const clone = res.clone();
    background(
      clone.json().then(
        (j: unknown) => {
          const u = j && typeof j === "object" ? (j as { usage?: unknown }).usage : undefined;
          const usage = u && typeof u === "object" ? (u as { input_tokens?: unknown; output_tokens?: unknown }) : {};
          logCall({ ...base, input_tokens: tokenOf(usage.input_tokens), output_tokens: tokenOf(usage.output_tokens) });
        },
        () => logCall(base),
      ),
    );
  } catch {
    logCall(base);
  }
}

// Non-ok Claude Response returned unread: classify from a clone in the background.
function logAnthropicFailUnread(res: Response, model: string, latency: number): void {
  const status = res.status;
  const write = (body: string) =>
    logCall({ ...anthropicRow(model, latency), http_status: status, error_class: classifyAnthropic(status, body) });
  try {
    background(res.clone().text().then(write, () => write("")));
  } catch {
    write("");
  }
}

function logAnthropicFail(status: number, body: string, model: string, latency: number): void {
  logCall({ ...anthropicRow(model, latency), http_status: status, error_class: classifyAnthropic(status, body) });
}

function logBackup(
  provider: "gemini" | "mistral",
  model: string,
  latency: number,
  fallback: boolean,
  status: number | null,
  failure: { body: string } | { error: LlmErrorClass } | null,
  usage: { input_tokens: number; output_tokens: number } | null,
): void {
  let error_class: LlmErrorClass | null = null;
  if (failure && "body" in failure) error_class = classifyGemini(status ?? 0, failure.body);
  else if (failure) error_class = failure.error;
  logCall({
    provider,
    model,
    ok: failure === null,
    http_status: status,
    error_class,
    input_tokens: usage ? tokenOf(usage.input_tokens) : null,
    output_tokens: usage ? tokenOf(usage.output_tokens) : null,
    latency_ms: latency,
    fallback,
  });
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// gemini-2.5-flash is listed by /models but refused for new keys (404 "no longer
// available to new users"), so the chain starts at 3.8 and steps down to the
// lite tiers, which see less 503 pressure.
const DEFAULT_GEMINI_MODELS = "gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite";
const GEMINI_ATTEMPTS = 2;
const GEMINI_RETRY_MS = 4000;
const GEMINI_MIN_OUTPUT_TOKENS = 1024;

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
  if (v === "gemini" || v === "anthropic" || v === "mistral") return v;
  return null;
}

export function geminiConfigured(): boolean {
  return !!(Deno.env.get("GEMINI_API_KEY") || "").trim();
}

export function mistralConfigured(): boolean {
  return !!(Deno.env.get("MISTRAL_API_KEY") || "").trim();
}

/** P108: at least one backup provider (Gemini or Mistral) has a key. */
export function backupConfigured(): boolean {
  return geminiConfigured() || mistralConfigured();
}

export function anthropicConfigured(): boolean {
  return !!(Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
}

/** True when at least one provider has a key. Mirrors the old "AI configured" checks. */
export function llmConfigured(): boolean {
  const forced = forcedProvider();
  if (forced === "gemini") return geminiConfigured();
  if (forced === "mistral") return mistralConfigured();
  return anthropicConfigured() || backupConfigured();
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
  // No thinkingConfig: Gemini 3.x rejects thinkingBudget with 400
  // INVALID_ARGUMENT (verified 2026-10-01 on gemini-3.5-flash-lite). Thinking
  // tokens count against maxOutputTokens, so a floor keeps tiny requests (the
  // 32-token language classifier) from coming back truncated.
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: Math.max(req.max_tokens, GEMINI_MIN_OUTPUT_TOKENS),
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

export function geminiModels(): string[] {
  const raw = (Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODELS).trim();
  const list = raw.split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_GEMINI_MODELS.split(",");
}

function geminiRetryable(status: number): boolean {
  return status === 429 || status === 503 || status === 500;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// One attempt against one model. Non-2xx comes back as a Response (not a throw).
async function callGeminiOnce(
  req: AnthropicMessagesRequest,
  apiKey: string,
  model: string,
  fallback: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const t0 = Date.now();
  let res: Response;
  let text: string;
  try {
    res = await fetch(GEMINI_BASE + "/" + model + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(toGeminiBody(req)),
      signal,
    });
    text = await res.text();
  } catch (e) {
    logBackup("gemini", model, Date.now() - t0, fallback, null, { error: isAbortError(e, signal) ? "timeout" : "network" }, null);
    throw e;
  }
  const latency = Date.now() - t0;
  if (!res.ok) {
    // Same contract as a failed Anthropic call: non-2xx Response, body = error text.
    const msg = "gemini HTTP " + res.status + ": " + text.slice(0, 600);
    logBackup("gemini", model, latency, fallback, res.status, { body: msg }, null);
    return new Response(msg, {
      status: res.status,
      headers: { "content-type": "text/plain" },
    });
  }
  let parsed: GeminiResponse;
  try {
    parsed = JSON.parse(text) as GeminiResponse;
  } catch {
    const msg = "gemini non-JSON body: " + text.slice(0, 300);
    logBackup("gemini", model, latency, fallback, 502, { body: msg }, null);
    return new Response(msg, { status: 502 });
  }
  if (!parsed.candidates?.length) {
    const why = parsed.promptFeedback?.blockReason || parsed.error?.message || "no candidates";
    const msg = "gemini empty: " + why;
    logBackup("gemini", model, latency, fallback, 502, { body: msg }, null);
    return new Response(msg, { status: 502 });
  }
  const shaped = geminiToAnthropic(parsed, model);
  logBackup("gemini", model, latency, fallback, 200, null, shaped.usage);
  console.log(
    "[llm] provider=gemini model=" + model + " stop_reason=" + shaped.stop_reason +
      " in=" + shaped.usage.input_tokens + " out=" + shaped.usage.output_tokens,
  );
  return new Response(JSON.stringify(shaped), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// Walk the model chain; retry transient statuses per model; return the last
// failure Response if every model is exhausted.
// `fallback` is true when Gemini serves because Claude failed or has no key,
// false when LLM_FORCE_PROVIDER=gemini; it is only recorded in llm_calls.
async function callGemini(
  req: AnthropicMessagesRequest,
  fallback: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const apiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!apiKey) throw new Error("missing_env:GEMINI_API_KEY");
  let last: Response | null = null;
  for (const model of geminiModels()) {
    for (let attempt = 1; attempt <= GEMINI_ATTEMPTS; attempt++) {
      if (signal?.aborted) break;
      const res = await callGeminiOnce(req, apiKey, model, fallback, signal);
      if (res.ok) return res;
      last = res;
      const retry = geminiRetryable(res.status);
      console.log(
        "[llm] gemini_fail model=" + model + " attempt=" + attempt + " status=" + res.status +
          (retry ? (attempt < GEMINI_ATTEMPTS ? " retrying" : " next_model") : " not_retryable next_model"),
      );
      if (!retry) break;
      if (attempt < GEMINI_ATTEMPTS) await sleep(GEMINI_RETRY_MS, signal);
    }
  }
  return last ?? new Response("gemini: no models configured", { status: 502 });
}

// ---------------------------------------------------------------------------
// P108: Mistral (La Plateforme, free "Experiment" tier; OpenAI-style chat API).
// Free tier: ~1 request/s per model, so a 429 waits a little longer than Gemini.
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
// Free tier (verified 2026-10-09): Large/Small/Medium are refused (403) or capped at 20k
// tokens/min, below our ~37k-token report calls; ministral-14b-2512 fits (937.5k/min).
// The live chain is set by the MISTRAL_MODEL secret.
const DEFAULT_MISTRAL_MODELS = "mistral-large-2512,ministral-14b-2512";
// P108b: prompts that demand JSON get Mistral's JSON mode (response_format json_object),
// which guarantees parseable JSON (ministral-14b otherwise left raw newlines in strings).
const JSON_DEMAND_RE = /\b(return|reply|respond|output|tagasta)\b[^.\n]{0,40}\bjson\b|\bjson only\b|\bonly (valid )?json\b|\bainult json\b/i;
const MISTRAL_ATTEMPTS = 2;
const MISTRAL_RETRY_MS = 2500;

type MistralResponse = {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  message?: string;
};

export function mistralModels(): string[] {
  const raw = (Deno.env.get("MISTRAL_MODEL") || DEFAULT_MISTRAL_MODELS).trim();
  const list = raw.split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_MISTRAL_MODELS.split(",");
}

function toMistralBody(req: AnthropicMessagesRequest, model: string): Record<string, unknown> {
  const sys = blocksToText(req.system);
  const messages: Array<{ role: string; content: string }> = [];
  if (sys) messages.push({ role: "system", content: sys });
  for (const m of req.messages || []) {
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: blocksToText(m.content) });
  }
  const body: Record<string, unknown> = { model, messages, max_tokens: req.max_tokens };
  if (typeof req.temperature === "number") body.temperature = req.temperature;
  if (messages.some((m) => m.role !== "assistant" && JSON_DEMAND_RE.test(m.content))) {
    body.response_format = { type: "json_object" };
  }
  return body;
}

function mistralText(c: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (!c) return "";
  if (typeof c === "string") return c;
  return c.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
}

function mistralToAnthropic(m: MistralResponse, model: string): AnthropicShapedResponse {
  const choice = m.choices?.[0];
  const text = mistralText(choice?.message?.content);
  const stop_reason = choice?.finish_reason === "length" ? "max_tokens" : "end_turn";
  return {
    id: "mistral_" + Date.now().toString(36),
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text }],
    stop_reason,
    usage: {
      input_tokens: m.usage?.prompt_tokens ?? 0,
      output_tokens: m.usage?.completion_tokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    llm_provider: "mistral",
  };
}

// One attempt against one model. Non-2xx comes back as a Response (not a throw).
async function callMistralOnce(
  req: AnthropicMessagesRequest,
  apiKey: string,
  model: string,
  fallback: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const t0 = Date.now();
  let res: Response;
  let text: string;
  try {
    res = await fetch(MISTRAL_URL, {
      method: "POST",
      headers: { "authorization": "Bearer " + apiKey, "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify(toMistralBody(req, model)),
      signal,
    });
    text = await res.text();
  } catch (e) {
    logBackup("mistral", model, Date.now() - t0, fallback, null, { error: isAbortError(e, signal) ? "timeout" : "network" }, null);
    throw e;
  }
  const latency = Date.now() - t0;
  if (!res.ok) {
    const msg = "mistral HTTP " + res.status + ": " + text.slice(0, 600);
    logBackup("mistral", model, latency, fallback, res.status, { body: msg }, null);
    return new Response(msg, { status: res.status, headers: { "content-type": "text/plain" } });
  }
  let parsed: MistralResponse;
  try {
    parsed = JSON.parse(text) as MistralResponse;
  } catch {
    const msg = "mistral non-JSON body: " + text.slice(0, 300);
    logBackup("mistral", model, latency, fallback, 502, { body: msg }, null);
    return new Response(msg, { status: 502 });
  }
  if (!parsed.choices?.length) {
    const msg = "mistral empty: " + (parsed.message || "no choices");
    logBackup("mistral", model, latency, fallback, 502, { body: msg }, null);
    return new Response(msg, { status: 502 });
  }
  const shaped = mistralToAnthropic(parsed, model);
  logBackup("mistral", model, latency, fallback, 200, null, shaped.usage);
  console.log(
    "[llm] provider=mistral model=" + model + " stop_reason=" + shaped.stop_reason +
      " in=" + shaped.usage.input_tokens + " out=" + shaped.usage.output_tokens,
  );
  return new Response(JSON.stringify(shaped), { status: 200, headers: { "content-type": "application/json" } });
}

// Same walk as callGemini: retry transient statuses per model, then next model.
async function callMistral(
  req: AnthropicMessagesRequest,
  fallback: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const apiKey = (Deno.env.get("MISTRAL_API_KEY") || "").trim();
  if (!apiKey) throw new Error("missing_env:MISTRAL_API_KEY");
  let last: Response | null = null;
  for (const model of mistralModels()) {
    for (let attempt = 1; attempt <= MISTRAL_ATTEMPTS; attempt++) {
      if (signal?.aborted) break;
      const res = await callMistralOnce(req, apiKey, model, fallback, signal);
      if (res.ok) return res;
      last = res;
      const retry = geminiRetryable(res.status);
      console.log(
        "[llm] mistral_fail model=" + model + " attempt=" + attempt + " status=" + res.status +
          (retry ? (attempt < MISTRAL_ATTEMPTS ? " retrying" : " next_model") : " not_retryable next_model"),
      );
      if (!retry) break;
      if (attempt < MISTRAL_ATTEMPTS) await sleep(MISTRAL_RETRY_MS, signal);
    }
  }
  return last ?? new Response("mistral: no models configured", { status: 502 });
}

// P108 backup chain after a Claude failure: every Gemini model, then every
// Mistral model. A provider without a key is skipped. The caller's timeout
// (abort) is never carried into the next provider.
async function callBackups(
  req: AnthropicMessagesRequest,
  fallback: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  let last: Response | null = null;
  let lastError: unknown = null;
  if (geminiConfigured()) {
    try {
      const res = await callGemini(req, fallback, signal);
      if (res.ok) return res;
      last = res;
    } catch (e) {
      if (isAbortError(e, signal) || !mistralConfigured()) throw e;
      lastError = e;
    }
  }
  if (mistralConfigured() && !signal?.aborted) {
    console.log("[llm] provider=mistral reason=" + (geminiConfigured() ? "gemini_failed" : "no_gemini_key") +
      (last ? " gemini_status=" + last.status : lastError ? " gemini_error=" + String(lastError).slice(0, 80) : ""));
    return callMistral(req, fallback, signal);
  }
  if (last) return last;
  if (lastError) throw lastError;
  throw new Error("missing_env:GEMINI_API_KEY");
}

/**
 * POST an Anthropic Messages request. Returns a Response exactly like
 * fetch(ANTHROPIC_URL) would, except that a credit/quota/outage failure (or
 * LLM_FORCE_PROVIDER=gemini|mistral) is served by the backup chain (Gemini,
 * then Mistral; P108) re-shaped as Anthropic JSON.
 */
export async function anthropicMessages(
  req: AnthropicMessagesRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const forced = forcedProvider();
  if (forced === "gemini") {
    console.log("[llm] provider=gemini reason=LLM_FORCE_PROVIDER");
    return callGemini(req, false, signal);
  }
  if (forced === "mistral") {
    console.log("[llm] provider=mistral reason=LLM_FORCE_PROVIDER");
    return callMistral(req, false, signal);
  }

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!apiKey) {
    if (forced !== "anthropic" && backupConfigured()) {
      console.log("[llm] provider=backup reason=missing_env:ANTHROPIC_API_KEY");
      return callBackups(req, true, signal);
    }
    throw new Error("missing_env:ANTHROPIC_API_KEY");
  }

  const t0 = Date.now();
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
    logCall({ ...anthropicRow(req.model, Date.now() - t0), error_class: aborted ? "timeout" : "network" });
    if (aborted || forced === "anthropic" || !backupConfigured()) throw e;
    console.log("[llm] provider=backup reason=anthropic_network:" + String(e).slice(0, 120));
    return callBackups(req, true, signal);
  }
  const latency = Date.now() - t0;

  if (res.ok) {
    logAnthropicOk(res, req.model, latency);
    return res;
  }
  if (forced === "anthropic" || !backupConfigured()) {
    logAnthropicFailUnread(res, req.model, latency);
    return res;
  }

  const body = await res.text();
  logAnthropicFail(res.status, body, req.model, latency);
  if (!shouldFallback(res.status, body)) {
    // Re-wrap: the body was consumed to inspect it.
    return new Response(body, { status: res.status, headers: res.headers });
  }
  console.log("[llm] provider=backup reason=anthropic_http_" + res.status + " " + body.slice(0, 160).replace(/\s+/g, " "));
  return callBackups(req, true, signal);
}
