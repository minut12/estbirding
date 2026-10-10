// supabase/functions/species-info-save/index.ts
// redeploy-marker: 2026-10-10 - P120 species-info-save (bookmarklet -> TartuNLP -> species_info)
// redeploy-marker: 2026-10-10 - P120d taxonomy (order/family/category from eBird taxonomy API) + family name EN->ET
// redeploy-marker: 2026-10-10 - P120g translation via free LLM chain (Gemini -> Mistral, never Claude); action=translate
// redeploy-marker: 2026-10-10 - P120h LLM_MAX_TOKENS 8192 (Gemini thinking budget)
//
// Two entry points, both writing public.species_info with the service role:
//
//  A) Bookmarklet save (X-Species-Info-Secret == SPECIES_INFO_SECRET), body
//     { code, comName, sciName, text, url, orderSci, familySci, familyComEn, category }.
//     Stores the English data + an optional CC0 / CC BY / CC BY-SA iNaturalist photo,
//     then translates the text as the last step.
//
//  B) Translate (X-Webhook-Secret == VAATLUSTE_WEBHOOK_SECRET, i.e. m7_call_ef), body
//     { action: "translate", codes?: string[], limit?: number }.
//     Without codes: rows whose id_text_et is missing or came from TartuNLP. Replies 202
//     at once and translates in the background (EdgeRuntime.waitUntil).
//
// Translation: _shared/llm.ts freeMessages (Gemini model chain, then Mistral). Claude is
// never called. The prompt gets the row's name_glossary (English -> Estonian bird names
// from the EOU checklist, filled when the row is written) so species names come out right.
// verify_jwt = false (config.toml); the two secrets above are the auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { freeMessages, type AnthropicShapedResponse } from "../_shared/llm.ts";

const INAT_API = "https://api.inaturalist.org/v1";
const USER_AGENT = "EstBirds/1.0 (+https://estbirds.netlify.app)";
const INAT_TIMEOUT_MS = 8_000;
const LLM_TIMEOUT_MS = 60_000;
// P120h: Gemini 3.x thinking tokens count against maxOutputTokens; 1200 ended in
// stop_reason=max_tokens with 45 visible tokens (eupowl1, 2026-10-10).
const LLM_MAX_TOKENS = 8_192;
const MAX_BODY_CHARS = 20_000;
const MIN_TEXT = 20;
const MAX_TEXT = 4_000;
const MAX_TAXON = 120;
const DEFAULT_BATCH = 10;
const MAX_BATCH = 25;
const CODE_RE = /^[a-z0-9]{3,12}$/;

type JsonRecord = Record<string, unknown>;
type License = "cc0" | "cc-by" | "cc-by-sa";
type Category = "species" | "issf" | "slash" | "spuh" | "hybrid" | "intergrade" | "domestic" | "form";
type Translator = "gemini" | "mistral";
type GlossaryEntry = { en: string; et: string };
type Payload = {
  code: string; comName: string | null; sciName: string | null; text: string; url: string;
  orderSci: string | null; familySci: string | null; familyComEn: string | null; category: Category | null;
};
type Photo = { url: string; credit: string; license: License };
type Translation = { text: string; translator: Translator } | { text: null; error: string };
type InfoRow = { ebird_code: string; id_text_en: string; name_glossary: unknown };

const CATEGORIES: readonly Category[] = ["species", "issf", "slash", "spuh", "hybrid", "intergrade", "domestic", "form"];

const SYSTEM_PROMPT = [
  "You translate short bird identification texts from eBird (English) into Estonian for EstBirds,",
  "an Estonian birdwatching app. Write natural, fluent Estonian, as an experienced Estonian birder",
  "would write it in a field guide.",
  "Rules:",
  "1. Translate the meaning, not word by word. Keep every fact; add nothing, drop nothing.",
  "2. Bird terms are about birds: 'perches' is the verb (istub, istuma), never the fish ahven;",
  "   'crown' is pealagi; 'bill' is nokk; 'song' is laul.",
  "3. Bird species names: when the glossary lists a name, use exactly that Estonian name, declined",
  "   as the sentence needs, in lower case unless it starts the sentence. Never invent a bird name;",
  "   if a name is not in the glossary, keep the English name in quotes.",
  "4. Keep vocalisation transcriptions (text in quotes such as \"kig-gag-gag\") unchanged.",
  "5. Use a neutral descriptive register, no imperatives (not 'Pane tahele').",
  "6. Output only the Estonian text: no preface, no notes, no quotes around the whole text.",
].join("\n");

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "https://ebird.org",
    "Access-Control-Allow-Headers": "content-type, x-species-info-secret",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function short(v: unknown): string | null {
  const t = str(v);
  return t && t.length <= MAX_TAXON ? t : null;
}

function asCategory(v: unknown): Category | null {
  const t = str(v)?.toLowerCase() ?? "";
  return CATEGORIES.find((c) => c === t) ?? null;
}

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function headerMatches(req: Request, header: string, envName: string): boolean {
  const expected = Deno.env.get(envName) ?? "";
  if (!expected) return false;
  return safeEqual(req.headers.get(header) ?? "", expected);
}

function parsePayload(raw: unknown): { ok: true; p: Payload } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "BODY_NOT_OBJECT" };
  const code = str(raw.code)?.toLowerCase() ?? "";
  if (!CODE_RE.test(code)) return { ok: false, error: "BAD_CODE" };
  const text = (str(raw.text) ?? "").replace(/\s+/g, " ");
  if (text.length < MIN_TEXT || text.length > MAX_TEXT) return { ok: false, error: "BAD_TEXT_LENGTH" };
  const url = str(raw.url) ?? "";
  if (!url.startsWith(`https://ebird.org/species/${code}`)) return { ok: false, error: "BAD_SOURCE_URL" };
  return {
    ok: true,
    p: {
      code, text, url: `https://ebird.org/species/${code}`, comName: short(raw.comName), sciName: short(raw.sciName),
      orderSci: short(raw.orderSci), familySci: short(raw.familySci), familyComEn: short(raw.familyComEn), category: asCategory(raw.category),
    },
  };
}

function parseGlossary(v: unknown): GlossaryEntry[] {
  if (!Array.isArray(v)) return [];
  const out: GlossaryEntry[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const en = short(item.en);
    const et = short(item.et);
    if (en && et) out.push({ en, et });
  }
  return out.slice(0, 40);
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function translateToEstonian(text: string, glossary: GlossaryEntry[]): Promise<Translation> {
  const gl = glossary.length
    ? "Glossary (English = Estonian):\n" + glossary.map((g) => `${g.en} = ${g.et}`).join("\n") + "\n\n"
    : "Glossary: (none)\n\n";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await freeMessages({
      model: "free-chain",
      max_tokens: LLM_MAX_TOKENS,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: gl + "Text to translate:\n" + text }],
    }, ctrl.signal);
    if (!res.ok) return { text: null, error: `LLM_HTTP_${res.status}` };
    const data = (await res.json()) as AnthropicShapedResponse;
    if (data.stop_reason === "max_tokens") return { text: null, error: "LLM_MAX_TOKENS" };
    const out = (data.content ?? []).map((b) => b.text ?? "").join("").trim().replace(/^["\u201e]|["\u201c]$/g, "").trim();
    if (out.length < MIN_TEXT) return { text: null, error: "LLM_EMPTY" };
    const translator: Translator = data.llm_provider === "mistral" ? "mistral" : "gemini";
    return { text: out, translator };
  } catch (e) {
    return { text: null, error: `LLM_${e instanceof Error ? e.name : "ERROR"}` };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } }, INAT_TIMEOUT_MS);
  if (!res.ok) return null;
  return await res.json();
}

function asLicense(code: string): License | null {
  return code === "cc0" || code === "cc-by" || code === "cc-by-sa" ? code : null;
}

async function findInatPhoto(sciName: string): Promise<Photo | null> {
  try {
    const taxa: unknown = await getJson(
      `${INAT_API}/taxa?q=${encodeURIComponent(sciName)}&rank=species&is_active=true&per_page=10`,
    );
    const results = isRecord(taxa) && Array.isArray(taxa.results) ? taxa.results : [];
    const wanted = sciName.toLowerCase();
    const taxon = results.find((t) => isRecord(t) && typeof t.name === "string" && t.name.toLowerCase() === wanted);
    if (!isRecord(taxon) || typeof taxon.id !== "number") return null;

    const params = new URLSearchParams({
      taxon_id: String(taxon.id),
      photo_license: "cc0,cc-by,cc-by-sa",
      quality_grade: "research",
      photos: "true",
      order_by: "votes",
      per_page: "5",
    });
    const obs: unknown = await getJson(`${INAT_API}/observations?${params}`);
    const list = isRecord(obs) && Array.isArray(obs.results) ? obs.results : [];
    for (const item of list) {
      if (!isRecord(item) || !Array.isArray(item.photos)) continue;
      const login = isRecord(item.user) ? str(item.user.login) : null;
      for (const ph of item.photos) {
        if (!isRecord(ph)) continue;
        const url = str(ph.url);
        const license = asLicense((str(ph.license_code) ?? "").toLowerCase());
        if (!url || !license || !url.startsWith("https://") || !url.includes("/square.")) continue;
        const author = str(ph.attribution_name) ?? login ?? "tundmatu autor";
        return { url: url.replace("/square.", "/medium."), credit: `iNaturalist \u00a9 ${author}`, license };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function db() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

async function translateRow(row: InfoRow): Promise<string> {
  const tr = await translateToEstonian(row.id_text_en, parseGlossary(row.name_glossary));
  if (tr.text === null) {
    console.error("species-info-save translate failed", row.ebird_code, tr.error);
    return `${row.ebird_code}:${tr.error}`;
  }
  const now = new Date().toISOString();
  const { error } = await db().from("species_info").update({
    id_text_et: tr.text, translator: tr.translator, translated_at: now, updated_at: now,
  }).eq("ebird_code", row.ebird_code);
  if (error) {
    console.error("species-info-save translate update failed", row.ebird_code, error.message);
    return `${row.ebird_code}:DB_UPDATE_FAILED`;
  }
  return `${row.ebird_code}:${tr.translator}`;
}

async function translateBatch(codes: string[] | null, limit: number): Promise<void> {
  let q = db().from("species_info").select("ebird_code,id_text_en,name_glossary");
  if (codes && codes.length) q = q.in("ebird_code", codes);
  else q = q.or("id_text_et.is.null,translator.eq.tartunlp");
  const { data, error } = await q.order("updated_at", { ascending: true }).limit(limit);
  if (error) {
    console.error("species-info-save translate select failed", error.message);
    return;
  }
  const rows = (Array.isArray(data) ? data : []) as InfoRow[];
  const results: string[] = [];
  for (const row of rows) results.push(await translateRow(row)); // sequential: free-tier rate limits
  console.log("species-info-save translate done", results.join(" "));
}

async function handleTranslate(raw: unknown): Promise<Response> {
  const body = isRecord(raw) ? raw : {};
  const codes = Array.isArray(body.codes)
    ? body.codes.map((c) => (typeof c === "string" ? c.trim().toLowerCase() : "")).filter((c) => CODE_RE.test(c)).slice(0, MAX_BATCH)
    : null;
  const lim = typeof body.limit === "number" && Number.isFinite(body.limit) ? Math.floor(body.limit) : DEFAULT_BATCH;
  const limit = Math.min(Math.max(lim, 1), MAX_BATCH);
  const job = translateBatch(codes && codes.length ? codes : null, limit);
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt) rt.waitUntil(job);
  else await job;
  return json({ ok: true, accepted: true, codes: codes ?? "pending", limit }, 202);
}

async function handleSave(p: Payload): Promise<Response> {
  const photo = p.sciName ? await findInatPhoto(p.sciName) : null;
  const now = new Date().toISOString();
  const row: JsonRecord = {
    ebird_code: p.code,
    com_name_en: p.comName,
    sci_name: p.sciName,
    id_text_en: p.text,
    source_url: p.url,
    order_sci: p.orderSci,
    family_sci: p.familySci,
    family_com_en: p.familyComEn,
    category: p.category,
    updated_at: now,
  };
  if (photo) {
    row.photo_url = photo.url;
    row.photo_credit = photo.credit;
    row.photo_license = photo.license;
  }
  const { error } = await db().from("species_info").upsert(row, { onConflict: "ebird_code" });
  if (error) {
    console.error("species-info-save upsert failed", p.code, error.message);
    return json({ ok: false, error: "DB_UPSERT_FAILED" }, 500);
  }
  // Translation is the last step; the row's name_glossary (if any) is used.
  const { data } = await db().from("species_info").select("ebird_code,id_text_en,name_glossary").eq("ebird_code", p.code).limit(1);
  const saved = (Array.isArray(data) ? data[0] : null) as InfoRow | null;
  const result = saved ? await translateRow(saved) : `${p.code}:NOT_FOUND`;
  const translated = /:(gemini|mistral)$/.test(result);
  console.log("species-info-save ok", p.code, result, photo ? "photo" : "no-photo");
  return json({ ok: true, code: p.code, translated, translate_error: translated ? null : result, photo: photo !== null });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  if (req.method === "GET") {
    const ping = new URL(req.url).searchParams.get("ping");
    return ping === "1" ? json({ ok: true, fn: "species-info-save", v: "p120g" }) : json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  const viaWebhook = headerMatches(req, "x-webhook-secret", "VAATLUSTE_WEBHOOK_SECRET");
  const viaBookmarklet = !viaWebhook && headerMatches(req, "x-species-info-secret", "SPECIES_INFO_SECRET");
  if (!viaWebhook && !viaBookmarklet) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const rawText = await req.text();
  if (rawText.length > MAX_BODY_CHARS) return json({ ok: false, error: "BODY_TOO_LARGE" }, 413);
  let raw: unknown;
  try {
    raw = rawText ? JSON.parse(rawText) : {};
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }

  if (viaWebhook) {
    if (!isRecord(raw) || raw.action !== "translate") return json({ ok: false, error: "BAD_ACTION" }, 400);
    return handleTranslate(raw);
  }
  const parsed = parsePayload(raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
  return handleSave(parsed.p);
});
