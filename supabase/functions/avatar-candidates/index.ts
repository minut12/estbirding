// redeploy-marker: 2026-10-07 - P97c2b avatar-candidates (iNat taxa lookup: rank=species,subspecies, is_active, per_page 30)
//
// Admin-only avatar picker backend.
//   GET  ?probe=1                                  -> upstream reachability (no auth, no data)
//   POST { action: "search", scientificName }       -> { ok, candidates } (iNaturalist first, then Wikimedia)
//   POST { action: "fetch", url }                   -> image bytes from an allow-listed https host
// Only CC0 / CC BY / CC BY-SA images are returned.
// Auth (mirrors event-from-url): Supabase JWT (Authorization header, auth.getUser -> 401)
// plus the events_admin_assert_admin RPC (error -> 403), checked before the body is read
// and before outbound fetches (the probe is the only unauthenticated path).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const USER_AGENT = "EstBirds/1.0 (https://estbirds.netlify.app)";
const UPSTREAM_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CANDIDATES_PER_SOURCE = 9;
const MAX_REDIRECTS = 3;
const NAME_MIN_CHARS = 3;
const NAME_MAX_CHARS = 120;
const NAME_PATTERN = /^[A-Za-z .-]+$/;
const UNKNOWN_AUTHOR = "Tundmatu";

const INAT_API = "https://api.inaturalist.org/v1";
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

const IMAGE_HOSTS: ReadonlySet<string> = new Set([
  "inaturalist-open-data.s3.amazonaws.com",
  "static.inaturalist.org",
  "upload.wikimedia.org",
]);
const IMAGE_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

type JsonRecord = Record<string, unknown>;
type License = "cc0" | "cc-by" | "cc-by-sa";
type Source = "inaturalist" | "wikimedia";

type Candidate = {
  id: string;
  source: Source;
  thumbUrl: string;
  fullUrl: string;
  author: string;
  license: License;
  licenseUrl: string;
  pageUrl: string;
};

const LICENSE_URLS: Record<License, string> = {
  "cc0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "cc-by": "https://creativecommons.org/licenses/by/4.0/",
  "cc-by-sa": "https://creativecommons.org/licenses/by-sa/4.0/",
};

// ---------------------------------------------------------------------------
// CORS + JSON helpers (copied from event-from-url, methods widened to GET)
// ---------------------------------------------------------------------------

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
});

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Small utilities / runtime guards
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Runs `work` with an AbortSignal that fires after UPSTREAM_TIMEOUT_MS; the timer is always cleared. */
async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function upstreamInit(signal: AbortSignal, extra: Record<string, string> = {}): RequestInit {
  return { signal, headers: { "User-Agent": USER_AGENT, ...extra } };
}

/** GET a JSON document; throws on network error, timeout or non-2xx. */
function fetchJson(url: string, extraHeaders: Record<string, string> = {}): Promise<unknown> {
  return withTimeout(async (signal) => {
    const res = await fetch(url, upstreamInit(signal, { Accept: "application/json", ...extraHeaders }));
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    }
    const data: unknown = await res.json();
    return data;
  });
}

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

async function probeStatus(url: string): Promise<number> {
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(url, upstreamInit(signal));
      await res.body?.cancel();
      return res.status;
    });
  } catch {
    return 0;
  }
}

async function probe(): Promise<{ ok: true; inat: number; wikidata: number; commons: number }> {
  const [inat, wikidata, commons] = await Promise.all([
    probeStatus(`${INAT_API}/taxa?q=Parus&per_page=1`),
    probeStatus(`${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent("ASK {}")}`),
    probeStatus(`${COMMONS_API}?action=query&meta=siteinfo&format=json`),
  ]);
  return { ok: true, inat, wikidata, commons };
}

// ---------------------------------------------------------------------------
// iNaturalist
// ---------------------------------------------------------------------------

interface InatTaxon {
  id: number;
  name: string;
}

interface InatPhoto {
  id: number;
  url: string;
  licenseCode: string;
  attributionName: string | null;
}

interface InatObservation {
  userLogin: string | null;
  photos: InatPhoto[];
}

function parseInatTaxa(data: unknown): InatTaxon[] {
  if (!isRecord(data)) return [];
  const out: InatTaxon[] = [];
  for (const item of arr(data.results)) {
    if (!isRecord(item)) continue;
    const id = num(item.id);
    const name = str(item.name);
    if (id !== null && name !== null) out.push({ id, name });
  }
  return out;
}

function parseInatPhoto(value: unknown): InatPhoto | null {
  if (!isRecord(value)) return null;
  const id = num(value.id);
  const url = str(value.url);
  const licenseCode = str(value.license_code);
  if (id === null || url === null || licenseCode === null) return null;
  return { id, url, licenseCode: licenseCode.toLowerCase(), attributionName: str(value.attribution_name) };
}

function parseInatObservations(data: unknown): InatObservation[] {
  if (!isRecord(data)) return [];
  const out: InatObservation[] = [];
  for (const item of arr(data.results)) {
    if (!isRecord(item)) continue;
    const user = isRecord(item.user) ? item.user : {};
    const photos: InatPhoto[] = [];
    for (const raw of arr(item.photos)) {
      const photo = parseInatPhoto(raw);
      if (photo) photos.push(photo);
    }
    out.push({ userLogin: str(user.login), photos });
  }
  return out;
}

function inatLicense(code: string): License | null {
  return code === "cc0" || code === "cc-by" || code === "cc-by-sa" ? code : null;
}

function inatCandidate(photo: InatPhoto, userLogin: string | null): Candidate | null {
  const license = inatLicense(photo.licenseCode);
  if (!license || !photo.url.startsWith("https://") || !photo.url.includes("/square.")) return null;
  return {
    id: `inat-${photo.id}`,
    source: "inaturalist",
    thumbUrl: photo.url.replace("/square.", "/medium."),
    fullUrl: photo.url.replace("/square.", "/large."),
    author: photo.attributionName ?? userLogin ?? UNKNOWN_AUTHOR,
    license,
    licenseUrl: LICENSE_URLS[license],
    pageUrl: `https://www.inaturalist.org/photos/${photo.id}`,
  };
}

async function searchInaturalist(scientificName: string): Promise<Candidate[]> {
  const taxa = parseInatTaxa(
    await fetchJson(
      `${INAT_API}/taxa?q=${encodeURIComponent(scientificName)}&rank=species,subspecies&is_active=true&per_page=30`,
    ),
  );
  const wanted = scientificName.toLowerCase();
  const taxon = taxa.find((t) => t.name.toLowerCase() === wanted);
  if (!taxon) return [];

  const params = new URLSearchParams({
    taxon_id: String(taxon.id),
    photo_license: "cc0,cc-by,cc-by-sa",
    quality_grade: "research",
    photos: "true",
    order_by: "votes",
    per_page: "20",
  });
  const observations = parseInatObservations(await fetchJson(`${INAT_API}/observations?${params}`));

  const seen = new Set<number>();
  const out: Candidate[] = [];
  for (const obs of observations) {
    for (const photo of obs.photos) {
      if (out.length >= MAX_CANDIDATES_PER_SOURCE) return out;
      if (seen.has(photo.id)) continue;
      const candidate = inatCandidate(photo, obs.userLogin);
      if (!candidate) continue;
      seen.add(photo.id);
      out.push(candidate);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wikimedia (Wikidata P225 -> Commons haswbstatement:P180)
// ---------------------------------------------------------------------------

interface CommonsImage {
  pageId: number;
  index: number;
  thumbUrl: string;
  fullUrl: string;
  pageUrl: string;
  licenseShortName: string | null;
  licenseUrl: string | null;
  artist: string | null;
}

function sparqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseWikidataQid(data: unknown): string | null {
  if (!isRecord(data) || !isRecord(data.results)) return null;
  const first = arr(data.results.bindings)[0];
  if (!isRecord(first) || !isRecord(first.item)) return null;
  const uri = str(first.item.value);
  const match = uri ? /\/(Q\d+)$/.exec(uri) : null;
  return match ? match[1] : null;
}

function extValue(ext: JsonRecord, key: string): string | null {
  const entry = ext[key];
  return isRecord(entry) ? str(entry.value) : null;
}

function parseCommonsPage(page: unknown): CommonsImage | null {
  if (!isRecord(page)) return null;
  const pageId = num(page.pageid);
  const info = arr(page.imageinfo)[0];
  if (pageId === null || !isRecord(info)) return null;
  const thumbUrl = str(info.thumburl);
  const fullUrl = str(info.url);
  const pageUrl = str(info.descriptionurl);
  if (!thumbUrl || !fullUrl || !pageUrl) return null;
  const ext = isRecord(info.extmetadata) ? info.extmetadata : {};
  return {
    pageId,
    index: num(page.index) ?? Number.MAX_SAFE_INTEGER,
    thumbUrl,
    fullUrl,
    pageUrl,
    licenseShortName: extValue(ext, "LicenseShortName"),
    licenseUrl: extValue(ext, "LicenseUrl"),
    artist: extValue(ext, "Artist"),
  };
}

function parseCommonsImages(data: unknown): CommonsImage[] {
  if (!isRecord(data) || !isRecord(data.query) || !isRecord(data.query.pages)) return [];
  const out: CommonsImage[] = [];
  for (const page of Object.values(data.query.pages)) {
    const image = parseCommonsPage(page);
    if (image) out.push(image);
  }
  return out.sort((a, b) => a.index - b.index);
}

function commonsLicense(shortName: string | null): License | null {
  if (!shortName) return null;
  const name = shortName.trim();
  if (name === "CC0" || name === "CC0 1.0") return "cc0";
  if (/^CC BY-SA \d/.test(name)) return "cc-by-sa";
  if (/^CC BY \d/.test(name)) return "cc-by";
  return null;
}

function cleanArtist(html: string | null): string {
  if (!html) return UNKNOWN_AUTHOR;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || UNKNOWN_AUTHOR;
}

function absoluteHttps(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}

function commonsCandidate(image: CommonsImage): Candidate | null {
  const license = commonsLicense(image.licenseShortName);
  if (!license || !image.licenseUrl) return null;
  return {
    id: `wm-${image.pageId}`,
    source: "wikimedia",
    thumbUrl: absoluteHttps(image.thumbUrl),
    fullUrl: absoluteHttps(image.fullUrl),
    author: cleanArtist(image.artist),
    license,
    licenseUrl: absoluteHttps(image.licenseUrl),
    pageUrl: absoluteHttps(image.pageUrl),
  };
}

async function searchWikimedia(scientificName: string): Promise<Candidate[]> {
  const sparql = `SELECT ?item WHERE { ?item wdt:P225 "${sparqlString(scientificName)}" } LIMIT 1`;
  const qid = parseWikidataQid(
    await fetchJson(`${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(sparql)}`, {
      Accept: "application/sparql-results+json",
    }),
  );
  if (!qid) return [];

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `haswbstatement:P180=${qid}`,
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "640",
    format: "json",
  });
  const images = parseCommonsImages(await fetchJson(`${COMMONS_API}?${params}`));

  const out: Candidate[] = [];
  for (const image of images) {
    if (out.length >= MAX_CANDIDATES_PER_SOURCE) break;
    const candidate = commonsCandidate(image);
    if (candidate) out.push(candidate);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function validScientificName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length < NAME_MIN_CHARS || name.length > NAME_MAX_CHARS) return null;
  return NAME_PATTERN.test(name) ? name : null;
}

async function safeSearch(label: Source, run: () => Promise<Candidate[]>): Promise<Candidate[]> {
  try {
    return await run();
  } catch (err) {
    console.error(`[avatar-candidates] ${label} search failed:`, errorMessage(err));
    return [];
  }
}

async function handleSearch(body: JsonRecord, headers: Record<string, string>): Promise<Response> {
  const scientificName = validScientificName(body.scientificName);
  if (!scientificName) return json(400, { ok: false, error: "invalid_scientific_name" }, headers);

  const [inat, wikimedia] = await Promise.all([
    safeSearch("inaturalist", () => searchInaturalist(scientificName)),
    safeSearch("wikimedia", () => searchWikimedia(scientificName)),
  ]);
  const candidates: Candidate[] = [...inat, ...wikimedia];
  return json(200, { ok: true, candidates }, headers);
}

function allowedImageUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url;
}

type ImageResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; contentType: string }
  | { ok: false; status: number; error: string };

async function readCapped(body: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Follows at most MAX_REDIRECTS redirects manually, re-checking every hop against the allow-list. */
async function fetchAllowedImage(start: URL, signal: AbortSignal): Promise<Response | ImageResult> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), { ...upstreamInit(signal), redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    await res.body?.cancel();
    const location = res.headers.get("location");
    const next = location ? allowedImageUrl(new URL(location, current).toString()) : null;
    if (!next) return { ok: false, status: 502, error: "redirect_not_allowed" };
    current = next;
  }
  return { ok: false, status: 502, error: "too_many_redirects" };
}

async function fetchImage(target: URL): Promise<ImageResult> {
  return await withTimeout(async (signal): Promise<ImageResult> => {
    const res = await fetchAllowedImage(target, signal);
    if (!(res instanceof Response)) return res;
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      return { ok: false, status: 502, error: `upstream_${res.status}` };
    }
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(contentType)) {
      await res.body.cancel();
      return { ok: false, status: 502, error: "unsupported_content_type" };
    }
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      await res.body.cancel();
      return { ok: false, status: 413, error: "image_too_large" };
    }
    const bytes = await readCapped(res.body);
    if (!bytes) return { ok: false, status: 413, error: "image_too_large" };
    return { ok: true, bytes, contentType };
  });
}

async function handleFetch(body: JsonRecord, headers: Record<string, string>): Promise<Response> {
  const raw = str(body.url);
  const target = raw ? allowedImageUrl(raw) : null;
  if (!target) return json(400, { ok: false, error: "url_not_allowed" }, headers);

  let result: ImageResult;
  try {
    result = await fetchImage(target);
  } catch (err) {
    console.error("[avatar-candidates] image fetch failed:", errorMessage(err));
    return json(502, { ok: false, error: "upstream_unreachable" }, headers);
  }
  if (!result.ok) return json(result.status, { ok: false, error: result.error }, headers);

  return new Response(result.bytes, {
    status: 200,
    headers: { ...headers, "Content-Type": result.contentType, "Cache-Control": "no-store" },
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    if (req.method === "GET") {
      if (new URL(req.url).searchParams.get("probe") === "1") return json(200, await probe(), headers);
      return json(405, { ok: false, error: "method_not_allowed" }, headers);
    }
    if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" }, headers);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { ok: false, error: "Unauthorized" }, headers);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json(401, { ok: false, error: "Unauthorized" }, headers);

    const { error: adminError } = await authClient.rpc("events_admin_assert_admin");
    if (adminError) return json(403, { ok: false, error: "forbidden" }, headers);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json(400, { ok: false, error: "invalid_json" }, headers);
    }
    if (!isRecord(rawBody)) return json(400, { ok: false, error: "invalid_json" }, headers);

    if (rawBody.action === "search") return await handleSearch(rawBody, headers);
    if (rawBody.action === "fetch") return await handleFetch(rawBody, headers);
    return json(400, { ok: false, error: "unknown_action" }, headers);
  } catch (err) {
    console.error("[avatar-candidates] unhandled error:", errorMessage(err));
    return json(500, { ok: false, error: "internal_error" }, headers);
  }
});
