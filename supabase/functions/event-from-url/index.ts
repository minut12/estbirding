// redeploy-marker: 2026-10-04 - P92b event-from-url (admin URL -> prefilled event fields)
// redeploy-marker: 2026-10-04 - P92b2 JWT + events_admin_assert_admin auth, drop temperature; own model env ANTHROPIC_MODEL_EVENT_FROM_URL
// redeploy-marker: 2026-10-05 - P92c2 Accept-Language et; facebook -> LLM over og fields; organiser -> source_hint
// redeploy-marker: 2026-10-05 - P92c4 facebook boilerplate description dropped; geocode comma-tail fallback
//
// Admin pastes a URL (estbirding.ee, eoy.ee, facebook.com, any public https page);
// this function fetches it and returns prefilled event fields.
// Extraction order: JSON-LD schema.org Event -> LLM (_shared/llm.ts, Gemini
// fallback built in) -> og:/<title> only. Location is geocoded with Nominatim
// (countrycodes=ee). Dates come back as ISO 8601 with the Europe/Tallinn offset.
// Auth: Supabase JWT (Authorization header, auth.getUser -> 401) plus the
// events_admin_assert_admin RPC (error -> 403), checked before the body is read
// and before any outbound fetch. CORS mirrors events-image-upload.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { anthropicMessages, llmConfigured, type AnthropicShapedResponse } from "../_shared/llm.ts";

const USER_AGENT = "Mozilla/5.0 (compatible; EstBirds/1.0; +https://estbirds.netlify.app)";
const FETCH_TIMEOUT_MS = 10_000;
const GEOCODE_TIMEOUT_MS = 5_000;
const GEOCODE_MAX_ATTEMPTS = 3;
const GEOCODE_RETRY_PAUSE_MS = 1_000;
const LLM_TIMEOUT_MS = 45_000;
const MAX_BODY_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_DESCRIPTION_CHARS = 2_000;
const LLM_MAX_TOKENS = 800;
const DEFAULT_MODEL = "claude-sonnet-5-5";
const TIME_ZONE = "Europe/Tallinn";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ee&q=";

type JsonRecord = Record<string, unknown>;
type Extraction = "jsonld" | "llm" | "og-only";
type SourceHint = "estbirding" | "eoy" | "muu";

type DraftFields = {
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location_name: string | null;
  description: string | null;
  image_url: string | null;
};

type PageMeta = { og: Record<string, string>; title: string | null };
type FetchedPage = { finalUrl: string; html: string; truncated: boolean };
type FetchResult = { ok: true; page: FetchedPage } | { ok: false; status: number; error: string };
type LlmResult = { fields: DraftFields | null; warnings: string[] };
type GeoResult = { lat: number | null; lon: number | null; warning: string | null };

// ---------------------------------------------------------------------------
// CORS + JSON helpers (copied from events-image-upload)
// ---------------------------------------------------------------------------

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
});

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-",
  laquo: "<<", raquo: ">>", hellip: "...", copy: "(c)", bull: "*",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#")) {
      const codePoint = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      try {
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : whole;
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[lower] ?? whole;
  });
}

function stripTags(input: string): string {
  return decodeEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function capDescription(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_DESCRIPTION_CHARS) : null;
}

// ---------------------------------------------------------------------------
// URL validation (string checks on the hostname; https only)
// ---------------------------------------------------------------------------

function blockedHostReason(target: URL): string | null {
  if (target.protocol !== "https:") return "https_only";
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return "invalid_host";
  if (host === "localhost" || host.endsWith(".localhost")) return "blocked_host";
  if (host === "::1" || host === "0.0.0.0") return "blocked_host";
  if (host.endsWith(".internal") || host === "supabase.co" || host.endsWith(".supabase.co")) return "blocked_host";
  if (/^(127|10|169\.254|192\.168)\./.test(host)) return "blocked_host";
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return "blocked_host";
  return null;
}

function sourceHintFor(host: string): SourceHint {
  const lower = host.toLowerCase();
  if (lower === "estbirding.ee" || lower.endsWith(".estbirding.ee")) return "estbirding";
  if (lower === "eoy.ee" || lower.endsWith(".eoy.ee")) return "eoy";
  return "muu";
}

function isFacebookHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === "facebook.com" || lower.endsWith(".facebook.com") || lower === "fb.com" || lower.endsWith(".fb.com");
}

// Facebook og:description is often "N people interested" style boilerplate, not a description.
function isFacebookBoilerplate(text: string | null): boolean {
  if (!text) return false;
  return /people interested|inimest .*huvitatud|Personen interessiert|interested in this event/i.test(text);
}

// Organiser named in the page text; only consulted for third-party hosts.
function organiserHint(text: string): SourceHint | null {
  if (/ornitoloogia|eoy\.ee|eo\u00dc/i.test(text)) return "eoy";
  if (/estbirding/i.test(text)) return "estbirding";
  return null;
}

// ---------------------------------------------------------------------------
// Fetch with timeout + 1.5 MB cap
// ---------------------------------------------------------------------------

async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  cap: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const room = cap - total;
    if (value.byteLength >= room) {
      chunks.push(value.subarray(0, room));
      total += room;
      truncated = value.byteLength > room;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const headerCharset = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase() ?? null;
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const metaCharset = headerCharset ? null
    : /<meta[^>]+charset=["']?([\w-]+)/i.exec(utf8.slice(0, 4096))?.[1]?.toLowerCase() ?? null;
  const label = headerCharset ?? metaCharset;
  if (!label || label === "utf-8" || label === "utf8") return utf8;
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return utf8;
  }
}

async function fetchPage(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "et-EE,et;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { ok: false, status: 502, error: "upstream_http_" + res.status };
    }
    const finalUrl = res.url || url;
    const blocked = blockedHostReason(new URL(finalUrl));
    if (blocked) {
      await res.body?.cancel().catch(() => undefined);
      return { ok: false, status: 400, error: "redirect_" + blocked };
    }
    const { bytes, truncated } = await readCapped(res.body, MAX_BODY_BYTES);
    const html = decodeBody(bytes, res.headers.get("content-type"));
    return { ok: true, page: { finalUrl, html, truncated } };
  } catch (error) {
    const reason = isAbortError(error) ? "upstream_timeout" : "upstream_fetch_failed: " + errorMessage(error);
    return { ok: false, status: 502, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// HTML parsing (regex only, no DOM lib)
// ---------------------------------------------------------------------------

function attributeValue(tag: string, name: string): string | null {
  const re = new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))", "i");
  const match = re.exec(tag);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function parseMeta(html: string): PageMeta {
  const og: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attributeValue(tag, "property") ?? attributeValue(tag, "name");
    const content = attributeValue(tag, "content");
    if (!key || content === null) continue;
    const lowerKey = key.toLowerCase();
    if (!(lowerKey in og)) og[lowerKey] = decodeEntities(content).trim();
  }
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? nonEmpty(stripTags(titleMatch[1])) : null;
  return { og, title };
}

function plainText(html: string): string {
  const withoutBlocks = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = withoutBlocks
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(withBreaks)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function isEventType(type: unknown): boolean {
  const list = Array.isArray(type) ? type : [type];
  return list.some((entry) => typeof entry === "string" && (entry === "Event" || entry.endsWith("Event")));
}

function findEventNode(node: unknown, depth: number): JsonRecord | null {
  if (depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  if (isEventType(node["@type"])) return node;
  for (const value of Object.values(node)) {
    if (typeof value !== "object" || value === null) continue;
    const found = findEventNode(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function extractJsonLdEvent(html: string): JsonRecord | null {
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const found = findEventNode(parsed, 0);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Europe/Tallinn date normalisation (Intl only, no libraries)
// ---------------------------------------------------------------------------

type WallClock = { y: number; mo: number; d: number; h: number; mi: number; s: number };

const tallinnFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function wallClockAt(utcMs: number): WallClock {
  const parts = tallinnFormatter.formatToParts(new Date(utcMs));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: part("year"), mo: part("month"), d: part("day"), h: part("hour") % 24, mi: part("minute"), s: part("second") };
}

function tallinnOffsetMinutes(utcMs: number): number {
  const w = wallClockAt(utcMs);
  return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - utcMs) / 60_000);
}

// Wall clock -> UTC: two passes so a guess on the wrong side of a DST switch corrects itself.
function wallClockToUtcMs(w: WallClock): number {
  const naive = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  const firstGuess = naive - tallinnOffsetMinutes(naive) * 60_000;
  return naive - tallinnOffsetMinutes(firstGuess) * 60_000;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTallinnIso(utcMs: number): string {
  const w = wallClockAt(utcMs);
  const offset = tallinnOffsetMinutes(utcMs);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${w.y}-${pad2(w.mo)}-${pad2(w.d)}T${pad2(w.h)}:${pad2(w.mi)}:${pad2(w.s)}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

// Returns ISO 8601 with the Europe/Tallinn offset, or null when unparseable.
// - No offset in the input -> interpreted as Tallinn local wall clock.
// - Date-only input (YYYY-MM-DD) -> becomes T00:00:00 Tallinn local (a full
//   timestamp is what the event form's datetime input expects).
// - Input with an offset or Z -> converted to the Tallinn wall clock + offset.
function normalizeTallinnDate(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (match && !match[7]) {
    const wall: WallClock = {
      y: Number(match[1]), mo: Number(match[2]), d: Number(match[3]),
      h: Number(match[4] ?? "0"), mi: Number(match[5] ?? "0"), s: Number(match[6] ?? "0"),
    };
    const utcMs = wallClockToUtcMs(wall);
    return Number.isFinite(utcMs) ? formatTallinnIso(utcMs) : null;
  }
  const withColon = match && match[7] && match[7].length === 5
    ? value.slice(0, -5) + match[7].slice(0, 3) + ":" + match[7].slice(3)
    : value;
  const utcMs = Date.parse(withColon);
  return Number.isFinite(utcMs) ? formatTallinnIso(utcMs) : null;
}

function todayInTallinn(): string {
  return formatTallinnIso(Date.now()).slice(0, 10);
}

// ---------------------------------------------------------------------------
// JSON-LD -> fields
// ---------------------------------------------------------------------------

function jsonLdAddress(address: unknown): string | null {
  if (typeof address === "string") return nonEmpty(address);
  if (!isRecord(address)) return null;
  const country = isRecord(address.addressCountry) ? address.addressCountry.name : address.addressCountry;
  const parts = [address.streetAddress, address.postalCode, address.addressLocality, address.addressRegion, country]
    .map(nonEmpty)
    .filter((part): part is string => part !== null);
  return parts.length ? parts.join(", ") : null;
}

// location.name wins (best geocoding query); the address is the fallback.
function jsonLdLocation(location: unknown): string | null {
  const first = Array.isArray(location) ? location[0] : location;
  if (typeof first === "string") return nonEmpty(first);
  if (!isRecord(first)) return null;
  return nonEmpty(first.name) ?? jsonLdAddress(first.address);
}

function jsonLdImage(image: unknown): string | null {
  const first = Array.isArray(image) ? image[0] : image;
  if (typeof first === "string") return nonEmpty(first);
  if (!isRecord(first)) return null;
  return nonEmpty(first.url) ?? nonEmpty(first.contentUrl);
}

function fieldsFromJsonLd(event: JsonRecord, meta: PageMeta): DraftFields {
  const description = nonEmpty(event.description);
  return {
    title: nonEmpty(event.name) ?? nonEmpty(meta.og["og:title"]) ?? meta.title,
    starts_at: nonEmpty(event.startDate),
    ends_at: nonEmpty(event.endDate),
    location_name: jsonLdLocation(event.location),
    description: description ? stripTags(description) : nonEmpty(meta.og["og:description"]),
    image_url: jsonLdImage(event.image) ?? nonEmpty(meta.og["og:image"]),
  };
}

function fieldsFromOg(meta: PageMeta): DraftFields {
  return {
    title: nonEmpty(meta.og["og:title"]) ?? meta.title,
    starts_at: null,
    ends_at: null,
    location_name: null,
    description: nonEmpty(meta.og["og:description"]),
    image_url: nonEmpty(meta.og["og:image"]),
  };
}

function ogDraftForFacebook(meta: PageMeta): DraftFields {
  const og = fieldsFromOg(meta);
  return isFacebookBoilerplate(og.description) ? { ...og, description: null } : og;
}

// ---------------------------------------------------------------------------
// LLM extraction (one call, strict JSON)
// ---------------------------------------------------------------------------

function llmSystemPrompt(): string {
  return [
    "You extract event details from a web page for an Estonian birding events calendar.",
    "Reply with STRICT JSON only, no prose, no markdown fences, exactly this shape:",
    '{"title":string|null,"starts_at":string|null,"ends_at":string|null,"location_name":string|null,"description":string|null}',
    "Rules:",
    "- Today's date in Europe/Tallinn is " + todayInTallinn() + ".",
    "- Dates and times on the page are Europe/Tallinn local time unless the page says otherwise.",
    "- A date without a year means the next future occurrence relative to today.",
    "- Output starts_at and ends_at as ISO 8601 with the Europe/Tallinn offset (+02:00 in winter, +03:00 in summer), e.g. 2026-05-09T07:00:00+03:00. If only a date is known use T00:00:00.",
    "- Use null when a value is not on the page. Never invent values.",
    "- location_name is the venue or place name as written, suitable for geocoding inside Estonia.",
    "- Text like 'Freitag, Oktober 16 2026 in Tallinn' or 'reede, 16. oktoober 2026 Tallinnas' is a date and a location; a city alone is a valid location_name.",
    "- title and description are in the page language; description is plain text, at most 1500 characters.",
  ].join("\n");
}

function isShapedResponse(value: unknown): value is Pick<AnthropicShapedResponse, "content" | "stop_reason"> {
  return isRecord(value) && Array.isArray(value.content) && typeof value.stop_reason === "string";
}

function parseLlmJson(text: string): DraftFields | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  return {
    title: nonEmpty(parsed.title),
    starts_at: nonEmpty(parsed.starts_at),
    ends_at: nonEmpty(parsed.ends_at),
    location_name: nonEmpty(parsed.location_name),
    description: nonEmpty(parsed.description),
    image_url: null,
  };
}

async function llmExtract(pageUrl: string, meta: PageMeta, text: string): Promise<LlmResult> {
  const userContent = [
    "Page URL: " + pageUrl,
    "og:title: " + (meta.og["og:title"] ?? ""),
    "og:description: " + (meta.og["og:description"] ?? ""),
    "<title>: " + (meta.title ?? ""),
    "",
    "Page text:",
    text,
  ].join("\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await anthropicMessages({
      model: Deno.env.get("ANTHROPIC_MODEL_EVENT_FROM_URL") || DEFAULT_MODEL,
      max_tokens: LLM_MAX_TOKENS,
      system: llmSystemPrompt(),
      messages: [{ role: "user", content: userContent }],
    }, controller.signal);
    const body = await res.text();
    if (!res.ok) return { fields: null, warnings: ["llm_http_" + res.status] };
    let shaped: unknown;
    try {
      shaped = JSON.parse(body);
    } catch {
      return { fields: null, warnings: ["llm_non_json_response"] };
    }
    if (!isShapedResponse(shaped)) return { fields: null, warnings: ["llm_unexpected_shape"] };
    if (shaped.stop_reason === "max_tokens") return { fields: null, warnings: ["llm_max_tokens"] };
    const outputText = shaped.content
      .map((block) => (isRecord(block) && typeof block.text === "string" ? block.text : ""))
      .join("");
    const fields = parseLlmJson(outputText);
    return fields ? { fields, warnings: [] } : { fields: null, warnings: ["llm_json_parse_failed"] };
  } catch (error) {
    const reason = isAbortError(error) ? "llm_timeout" : "llm_error: " + errorMessage(error).slice(0, 160);
    return { fields: null, warnings: [reason] };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Geocoding (Nominatim, Estonia only)
// ---------------------------------------------------------------------------

// Nominatim usage policy: max 1 request/s; at most 3 attempts per location.
async function geocode(query: string): Promise<GeoResult> {
  let attempt = query;
  let result = await geocodeOnce(attempt);
  for (let tries = 1; tries < GEOCODE_MAX_ATTEMPTS && result.warning === "geocode_no_hit"; tries++) {
    const comma = attempt.indexOf(",");
    if (comma < 0) break;
    attempt = attempt.slice(comma + 1).trim();
    if (!attempt) break;
    await new Promise((resolve) => setTimeout(resolve, GEOCODE_RETRY_PAUSE_MS));
    result = await geocodeOnce(attempt);
    if (result.warning === null) return { ...result, warning: "geocode_fallback" };
  }
  return result;
}

async function geocodeOnce(query: string): Promise<GeoResult> {
  const failed: GeoResult = { lat: null, lon: null, warning: "geocode_failed" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(NOMINATIM_URL + encodeURIComponent(query), {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return failed;
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return { lat: null, lon: null, warning: "geocode_no_hit" };
    const first: unknown = data[0];
    if (!isRecord(first)) return failed;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return failed;
    return { lat, lon, warning: null };
  } catch {
    return failed;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Field resolution
// ---------------------------------------------------------------------------

function absoluteUrl(candidate: string | null, base: string): string | null {
  if (!candidate) return null;
  try {
    const resolved = new URL(candidate, base);
    return resolved.protocol === "https:" || resolved.protocol === "http:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function normalizeDateField(raw: string | null, field: string, warnings: string[]): string | null {
  const normalized = normalizeTallinnDate(raw);
  if (raw && !normalized) warnings.push("date_unparsed:" + field);
  return normalized;
}

function mergeLlmWithOg(fields: DraftFields, meta: PageMeta): DraftFields {
  const og = fieldsFromOg(meta);
  return { ...fields, title: fields.title ?? og.title, description: fields.description ?? og.description, image_url: og.image_url };
}

async function resolveDraft(
  page: FetchedPage,
  host: string,
  warnings: string[],
): Promise<{ draft: DraftFields; extraction: Extraction; meta: PageMeta }> {
  const meta = parseMeta(page.html);
  const event = extractJsonLdEvent(page.html);
  if (event) return { draft: fieldsFromJsonLd(event, meta), extraction: "jsonld", meta };
  if (isFacebookHost(host)) {
    if (!llmConfigured()) {
      warnings.push("facebook_og_only");
      return { draft: ogDraftForFacebook(meta), extraction: "og-only", meta };
    }
    // Facebook bodies are login walls; feed the LLM only the og fields.
    const fbText = [meta.og["og:title"], meta.og["og:description"]].filter(Boolean).join("\n");
    const fbLlm = await llmExtract(page.finalUrl, meta, fbText);
    warnings.push(...fbLlm.warnings);
    warnings.push(fbLlm.fields?.starts_at ? "facebook_og_meta" : "facebook_og_only");
    if (!fbLlm.fields) return { draft: ogDraftForFacebook(meta), extraction: "og-only", meta };
    const fbDraft = mergeLlmWithOg(fbLlm.fields, meta);
    const dropDescription =
      isFacebookBoilerplate(meta.og["og:description"] ?? null) || isFacebookBoilerplate(fbDraft.description);
    return { draft: dropDescription ? { ...fbDraft, description: null } : fbDraft, extraction: "llm", meta };
  }
  if (!llmConfigured()) {
    warnings.push("llm_not_configured");
    return { draft: fieldsFromOg(meta), extraction: "og-only", meta };
  }
  const llm = await llmExtract(page.finalUrl, meta, plainText(page.html));
  warnings.push(...llm.warnings);
  if (!llm.fields) return { draft: fieldsFromOg(meta), extraction: "og-only", meta };
  return { draft: mergeLlmWithOg(llm.fields, meta), extraction: "llm", meta };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" }, headers);

  try {
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

    const rawBody: unknown = await req.json().catch(() => ({}));
    const body: JsonRecord = isRecord(rawBody) ? rawBody : {};

    const inputUrl = nonEmpty(body.url);
    if (!inputUrl) return json(400, { ok: false, error: "url is required" }, headers);
    let target: URL;
    try {
      target = new URL(inputUrl);
    } catch {
      return json(400, { ok: false, error: "invalid_url" }, headers);
    }
    const blocked = blockedHostReason(target);
    if (blocked) return json(400, { ok: false, error: blocked }, headers);

    const fetched = await fetchPage(target.toString());
    if (!fetched.ok) return json(fetched.status, { ok: false, error: fetched.error }, headers);

    const page = fetched.page;
    const host = new URL(page.finalUrl).hostname.toLowerCase();
    const warnings: string[] = page.truncated ? ["body_truncated"] : [];
    const { draft, extraction, meta } = await resolveDraft(page, host, warnings);
    const hint = organiserHint(
      [meta.og["og:title"], meta.og["og:description"], draft.title, draft.description].filter(Boolean).join(" "),
    );
    const hostHint = sourceHintFor(host);

    const locationName = draft.location_name;
    const geo: GeoResult = locationName ? await geocode(locationName) : { lat: null, lon: null, warning: null };
    if (geo.warning) warnings.push(geo.warning);

    const fields = {
      title: draft.title,
      starts_at: normalizeDateField(draft.starts_at, "starts_at", warnings),
      ends_at: normalizeDateField(draft.ends_at, "ends_at", warnings),
      location_name: locationName,
      lat: geo.lat,
      lon: geo.lon,
      description: capDescription(draft.description),
      image_url: absoluteUrl(draft.image_url, page.finalUrl),
    };

    return json(200, {
      ok: true,
      url: page.finalUrl,
      host,
      source_hint: hostHint !== "muu" ? hostHint : (hint ?? "muu"),
      extraction,
      fields,
      warnings,
    }, headers);
  } catch (error) {
    return json(500, { ok: false, error: String(error) }, headers);
  }
});
