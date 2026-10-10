// supabase/functions/species-info-save/index.ts
// redeploy-marker: 2026-10-10 - P120 species-info-save (bookmarklet -> TartuNLP -> species_info)
// redeploy-marker: 2026-10-10 - P120d taxonomy (order/family/category from eBird taxonomy API) + family name EN->ET
//
// Kristian clicks the "-> EstBirds" bookmarklet on an ebird.org/species/<code> page
// in his own browser. The bookmarklet POSTs the page's species code, names and
// identification text here. This function:
//   1. checks X-Species-Info-Secret against SPECIES_INFO_SECRET (before reading the body),
//   2. validates the payload (code shape, ebird.org source URL, text length),
//   3. translates the text EN->ET with TartuNLP (free, no key); on failure the row
//      is still saved with id_text_et = null so the card can fall back to English,
//   4. looks up one CC0 / CC BY / CC BY-SA iNaturalist photo for the scientific name
//      (same licence rule as avatar-candidates); optional, failure is not an error,
//   5. upserts public.species_info with the service role.
// No LLM is called. verify_jwt = false (config.toml): the bookmarklet runs on
// ebird.org and has no Supabase session; the shared secret is the auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TARTUNLP_URL = "https://api.tartunlp.ai/translation/v2";
const INAT_API = "https://api.inaturalist.org/v1";
const USER_AGENT = "EstBirds/1.0 (+https://estbirds.netlify.app)";
const TRANSLATE_TIMEOUT_MS = 25_000;
const INAT_TIMEOUT_MS = 8_000;
const MAX_BODY_CHARS = 20_000;
const MIN_TEXT = 20;
const MAX_TEXT = 4_000;
const CODE_RE = /^[a-z0-9]{3,12}$/;
const CATEGORIES: readonly Category[] = ["species", "issf", "slash", "spuh", "hybrid", "intergrade", "domestic", "form"];
const MAX_TAXON = 120;

type JsonRecord = Record<string, unknown>;
type License = "cc0" | "cc-by" | "cc-by-sa";
type Category = "species" | "issf" | "slash" | "spuh" | "hybrid" | "intergrade" | "domestic" | "form";
type Payload = {
  code: string; comName: string | null; sciName: string | null; text: string; url: string;
  orderSci: string | null; familySci: string | null; familyComEn: string | null; category: Category | null;
};
type Photo = { url: string; credit: string; license: License };
type Translation = { text: string | null; error: string | null };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://ebird.org",
  "Access-Control-Allow-Headers": "content-type, x-species-info-secret",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Vary": "Origin",
};

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function short(v: unknown): string | null {
  const t = str(v);
  return t && t.length <= MAX_TAXON ? t : null;
}

function asCategory(v: unknown): Category | null {
  const t = str(v)?.toLowerCase() ?? "";
  return CATEGORIES.find((c) => c === t) ?? null;
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

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function translateToEstonian(text: string): Promise<Translation> {
  try {
    const res = await fetchWithTimeout(TARTUNLP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ text, src: "eng", tgt: "est", domain: "general" }),
    }, TRANSLATE_TIMEOUT_MS);
    if (!res.ok) return { text: null, error: `TARTUNLP_HTTP_${res.status}` };
    const data: unknown = await res.json();
    const result = isRecord(data) ? data.result : null;
    const out = typeof result === "string" ? result : Array.isArray(result) ? result.filter((s) => typeof s === "string").join(" ") : "";
    return out.trim() ? { text: out.trim(), error: null } : { text: null, error: "TARTUNLP_EMPTY" };
  } catch (e) {
    return { text: null, error: `TARTUNLP_${e instanceof Error ? e.name : "ERROR"}` };
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (req.method === "GET") {
    const ping = new URL(req.url).searchParams.get("ping");
    return ping === "1" ? json({ ok: true, fn: "species-info-save" }) : json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  const expected = Deno.env.get("SPECIES_INFO_SECRET") ?? "";
  if (!expected) return json({ ok: false, error: "SPECIES_INFO_SECRET_MISSING" }, 500);
  const given = req.headers.get("x-species-info-secret") ?? "";
  if (!safeEqual(given, expected)) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const rawText = await req.text();
  if (rawText.length > MAX_BODY_CHARS) return json({ ok: false, error: "BODY_TOO_LARGE" }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }
  const parsed = parsePayload(raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
  const p = parsed.p;

  // Everything above is English; translation is the last step (text + family name).
  const [photo, tr, fam] = await Promise.all([
    p.sciName ? findInatPhoto(p.sciName) : Promise.resolve(null),
    translateToEstonian(p.text),
    p.familyComEn ? translateToEstonian(p.familyComEn) : Promise.resolve<Translation>({ text: null, error: null }),
  ]);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = new Date().toISOString();

  const row: JsonRecord = {
    ebird_code: p.code,
    com_name_en: p.comName,
    sci_name: p.sciName,
    id_text_en: p.text,
    id_text_et: tr.text,
    translator: tr.text ? "tartunlp" : null,
    translated_at: tr.text ? now : null,
    source_url: p.url,
    order_sci: p.orderSci,
    family_sci: p.familySci,
    family_com_en: p.familyComEn,
    family_com_et: fam.text,
    category: p.category,
    updated_at: now,
  };
  if (photo) {
    row.photo_url = photo.url;
    row.photo_credit = photo.credit;
    row.photo_license = photo.license;
  }

  const { error } = await db.from("species_info").upsert(row, { onConflict: "ebird_code" });
  if (error) {
    console.error("species-info-save upsert failed", p.code, error.message);
    return json({ ok: false, error: "DB_UPSERT_FAILED" }, 500);
  }

  console.log("species-info-save ok", p.code, tr.error ?? "translated", photo ? "photo" : "no-photo");
  return json({
    ok: true,
    code: p.code,
    translated: tr.text !== null,
    translate_error: tr.error,
    photo: photo !== null,
    id_text_et: tr.text,
    family_com_et: fam.text,
  });
});
