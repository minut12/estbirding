// redeploy-marker: P178d6 2026-10-29
// ext-rare-refresh (P178d3)
// pg_cron -> pg_net -> public.m7_call_ef('ext-rare-refresh', '{"mode":...}') -> here.
//
// Modes:
//   dry_run  synchronous JSON summary. Fetches LOFK + Tarsiger, parses, maps
//            Estonian names, reads the geocode cache, eBird and existing ext
//            rows and computes merges. NO DB writes
//            (needs_lookup counts distinct queries with no cache row).
//   run      202 + background: same pipeline, plus queueing of uncached LOFK
//            district hints in ext_place_geocode, upsert of
//            ext_rare_observations and merged_into updates on existing rows.
//            Ends with exactly one console.log(JSON summary) line.
//
// Sources: LOFK (birdlife.lt admin-ajax, current + previous Tallinn month) and
// Tarsiger (latest 100). A failing source only adds to its errors list: other
// sources continue and existing DB rows of the failed source are left as they
// are (no merged_into updates either). summary.sources.<src>.fetched = number
// of HTTP replies that came back OK and were accepted as data.
//
// HTTP etiquette: own User-Agent, 20 s timeout per call, one retry on HTTP 5xx
// or network error.
// Geocoding via DB queue, see ext_geocode_step (P178d5).
//
// Auth on this function: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  type ExtRareRecord,
  parseLofkHtml,
  parseTarsigerJson,
} from "../_shared/ext-rare/lib.ts";
import { assignMerges, type MergeItem } from "../_shared/ext-rare/merge.ts";
import {
  type EbirdMergeRow,
  ebirdToMergeItem,
  geocodeQuery,
  lofkMonths,
  toMergeItem,
  unwrapLofkReply,
} from "./lib.ts";

declare const EdgeRuntime:
  | { waitUntil(promise: Promise<unknown>): void }
  | undefined;

type Mode = "dry_run" | "run";

type ExtRow = ExtRareRecord & { species_et: string | null; merged_into: string | null };

type ExistingRow = {
  source: string;
  source_id: string;
  country_code: string;
  species_sci: string;
  obs_date_from: string;
  obs_date_to: string;
  lat: number | null;
  lng: number | null;
  coord_precision: MergeItem["precision"];
  merged_into: string | null;
};

type GeoCacheRow = {
  query: string;
  lat: number | null;
  lng: number | null;
  retry_after: string | null;
};

type Summary = {
  mode: Mode;
  sources: {
    lofk: { months: string[]; fetched: number; parsed: number; errors: string[] };
    tarsiger: { fetched: number; parsed: number; errors: string[] };
  };
  species_matched: number;
  species_unmatched: number;
  geocode: {
    cached_hits: number;
    queued: number;
    pending: number;
    needs_lookup: number;
    errors: string[];
  };
  merged: { into_ebird: number; into_ext: number; mains: number };
  written: number;
  sample: Array<{
    key: string;
    species_sci: string;
    species_et: string | null;
    country_code: string;
    obs_date_from: string;
    coord_precision: string;
    merged_into: string | null;
  }>;
  error: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const USER_AGENT = "EstBirds/1.0 (+https://estbirds.netlify.app)";
const LOFK_URL = "https://birdlife.lt/wp-admin/admin-ajax.php";
const TARSIGER_URL = "https://tarsiger.com/api/observations/?limit=100&offset=0";

const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const RETRY_PAUSE_MS = 1_000;
const MERGE_WINDOW_DAYS = 35;
const GEOCODE_COUNTRY = "LT";
const DB_CHUNK = 200;
const PAGE = 1000;
const SAMPLE_SIZE = 8;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const rowKey = (r: { source: string; source_id: string }) => `${r.source}:${r.source_id}`;
const normSci = (s: string) => s.trim().toLowerCase();

function serviceClient() {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
}

type Sb = ReturnType<typeof serviceClient>;

function emptySummary(mode: Mode): Summary {
  return {
    mode,
    sources: {
      lofk: { months: [], fetched: 0, parsed: 0, errors: [] },
      tarsiger: { fetched: 0, parsed: 0, errors: [] },
    },
    species_matched: 0,
    species_unmatched: 0,
    geocode: { cached_hits: 0, queued: 0, pending: 0, needs_lookup: 0, errors: [] },
    merged: { into_ebird: 0, into_ext: 0, mains: 0 },
    written: 0,
    sample: [],
    error: null,
  };
}

// ---------------------------------------------------------------------------
// HTTP

async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_PAUSE_MS);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const text = await res.text();
      if (res.ok) return text;
      lastError = `HTTP ${res.status}: ${text.slice(0, 120)}`;
      if (res.status < 500) break;
    } catch (e) {
      lastError = errMsg(e);
    }
  }
  throw new Error(lastError);
}

async function fetchLofk(summary: Summary): Promise<ExtRareRecord[]> {
  const months = lofkMonths(new Date());
  summary.sources.lofk.months = months;
  const out: ExtRareRecord[] = [];
  for (const m of months) {
    try {
      const body = new URLSearchParams({
        action: "get_reti_stebejimai_by_date",
        year_month: m,
        bird_species: "",
      }).toString();
      const text = await fetchText(LOFK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const recs = parseLofkHtml(unwrapLofkReply(text));
      summary.sources.lofk.fetched++;
      summary.sources.lofk.parsed += recs.length;
      out.push(...recs);
    } catch (e) {
      summary.sources.lofk.errors.push(`${m}: ${errMsg(e)}`);
    }
  }
  return out;
}

async function fetchTarsiger(summary: Summary): Promise<ExtRareRecord[]> {
  try {
    const text = await fetchText(TARSIGER_URL);
    const recs = parseTarsigerJson(JSON.parse(text));
    summary.sources.tarsiger.fetched++;
    summary.sources.tarsiger.parsed = recs.length;
    return recs;
  } catch (e) {
    summary.sources.tarsiger.errors.push(errMsg(e));
    return [];
  }
}

function dedupe(recs: readonly ExtRareRecord[]): ExtRareRecord[] {
  const byKey = new Map<string, ExtRareRecord>();
  for (const r of recs) byKey.set(rowKey(r), r); // last wins
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// DB reads (paged; advances by rows received so any max-rows cap is safe)

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

async function selectAll<T>(label: string, page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = (data ?? []) as T[];
    if (batch.length === 0) return rows;
    rows.push(...batch);
  }
}

async function readSpeciesMap(sb: Sb): Promise<Map<string, string>> {
  const { data, error } = await sb.rpc("ext_rare_species_map");
  if (error) throw new Error(`ext_rare_species_map: ${error.message}`);
  const rows = (data ?? []) as Array<{ species_sci: string | null; species_et: string | null }>;
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.species_sci && r.species_et) map.set(normSci(r.species_sci), r.species_et);
  }
  return map;
}

function withSpecies(recs: readonly ExtRareRecord[], map: Map<string, string>, summary: Summary): ExtRow[] {
  return recs.map((r) => {
    const species_et = map.get(normSci(r.species_sci)) ?? null;
    if (species_et === null) summary.species_unmatched++;
    else summary.species_matched++;
    return { ...r, species_et, merged_into: null };
  });
}

function tallinnDateDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * DAY_MS);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tallinn" }).format(d);
}

// ---------------------------------------------------------------------------
// Geocoding (LOFK district hints, LT only)

async function readGeocodeCache(sb: Sb, queries: string[]): Promise<Map<string, GeoCacheRow>> {
  if (queries.length === 0) return new Map();
  const rows = await selectAll<GeoCacheRow>("ext_place_geocode", (from, to) =>
    sb.from("ext_place_geocode").select("query,lat,lng,retry_after")
      .eq("country_code", GEOCODE_COUNTRY).in("query", queries)
      .order("query").range(from, to));
  return new Map(rows.map((r) => [r.query, r]));
}

type Coords = { lat: number; lng: number } | null;

// Cache-only. Uncached queries go to `toQueue` (run) for ext_geocode_step.
function resolveQuery(
  query: string, cached: GeoCacheRow | undefined, mode: Mode, summary: Summary, toQueue: Set<string>,
): Coords {
  const g = summary.geocode;
  if (cached && cached.lat !== null && cached.lng !== null) {
    g.cached_hits++;
    return { lat: Number(cached.lat), lng: Number(cached.lng) };
  }
  if (cached) {
    g.pending++; // pending or miss: the DB owns retries
    return null;
  }
  if (mode === "dry_run") g.needs_lookup++;
  else toQueue.add(query);
  return null;
}

async function queueGeocodes(sb: Sb, queries: ReadonlySet<string>, summary: Summary): Promise<void> {
  if (queries.size === 0) return;
  const rows = [...queries].map((q) => ({ country_code: GEOCODE_COUNTRY, query: q }));
  const { error } = await sb.from("ext_place_geocode").upsert(
    rows,
    { onConflict: "country_code,query", ignoreDuplicates: true },
  );
  summary.geocode.queued = rows.length;
  if (error) summary.geocode.errors.push(`ext_place_geocode queue: ${error.message}`);
}

async function geocodeRows(sb: Sb, rows: readonly ExtRow[], mode: Mode, summary: Summary): Promise<ExtRow[]> {
  const queries = [...new Set(
    rows.filter((r) => r.lat === null).map(geocodeQuery).filter((q): q is string => q !== null),
  )];
  const cache = await readGeocodeCache(sb, queries);
  const resolved = new Map<string, Coords>();
  const toQueue = new Set<string>();
  for (const q of queries) resolved.set(q, resolveQuery(q, cache.get(q), mode, summary, toQueue));
  if (mode === "run") await queueGeocodes(sb, toQueue, summary);
  return rows.map((r) => {
    const q = r.lat === null ? geocodeQuery(r) : null;
    const c = q === null ? null : resolved.get(q) ?? null;
    return c === null ? r : { ...r, lat: c.lat, lng: c.lng, coord_precision: "municipality" };
  });
}

// ---------------------------------------------------------------------------
// Merge

async function readEbirdItems(sb: Sb, codes: string[], cutoff: string): Promise<MergeItem[]> {
  if (codes.length === 0) return [];
  const rows = await selectAll<EbirdMergeRow>("ebird_rare_observations", (from, to) =>
    sb.from("ebird_rare_observations")
      .select("ebird_sub_id,species_lat_name,country_code,obs_date,lat,lng")
      .in("country_code", codes).gte("obs_date", cutoff)
      .order("id").range(from, to));
  return rows
    .map((r) => ({ ...r, lat: r.lat === null ? null : Number(r.lat), lng: r.lng === null ? null : Number(r.lng) }))
    .map(ebirdToMergeItem)
    .filter((m): m is MergeItem => m !== null);
}

async function readExisting(sb: Sb, cutoff: string): Promise<ExistingRow[]> {
  const rows = await selectAll<ExistingRow>("ext_rare_observations", (from, to) =>
    sb.from("ext_rare_observations")
      .select("source,source_id,country_code,species_sci,obs_date_from,obs_date_to,lat,lng,coord_precision,merged_into")
      .gte("obs_date_to", cutoff)
      .order("source").order("source_id").range(from, to));
  return rows.filter((r) => r.source === "lofk" || r.source === "tarsiger");
}

function existingToMergeItem(r: ExistingRow): MergeItem {
  return {
    key: rowKey(r),
    source: r.source === "lofk" ? "lofk" : "tarsiger",
    species_sci: r.species_sci,
    country_code: r.country_code,
    date_from: r.obs_date_from,
    date_to: r.obs_date_to,
    lat: r.lat,
    lng: r.lng,
    precision: r.coord_precision,
  };
}

type MergePlan = { fresh: ExtRow[]; updates: Array<{ row: ExistingRow; merged_into: string | null }> };

function countMerged(values: readonly (string | null)[], summary: Summary): void {
  for (const v of values) {
    if (v === null) summary.merged.mains++;
    else if (v.startsWith("ebird:")) summary.merged.into_ebird++;
    else summary.merged.into_ext++;
  }
}

async function planMerges(sb: Sb, fresh: readonly ExtRow[], failed: Set<string>, summary: Summary): Promise<MergePlan> {
  const cutoff = tallinnDateDaysAgo(MERGE_WINDOW_DAYS);
  const existing = await readExisting(sb, cutoff);
  // Countries from existing rows too: a stale row must still see its eBird partner.
  const codes = [...new Set([...fresh, ...existing].map((r) => r.country_code.trim().toUpperCase()))];
  const ebird = await readEbirdItems(sb, codes, cutoff);
  const freshKeys = new Set(fresh.map(rowKey));
  const stale = existing.filter((r) => !freshKeys.has(rowKey(r)));
  const result = assignMerges([...ebird, ...stale.map(existingToMergeItem), ...fresh.map(toMergeItem)]);
  const merged = fresh.map((r) => ({ ...r, merged_into: result.get(rowKey(r)) ?? null }));
  const staleTargets = stale.map((row) => ({ row, merged_into: result.get(rowKey(row)) ?? null }));
  countMerged([...merged, ...staleTargets].map((x) => x.merged_into), summary);
  const updates = staleTargets.filter((u) => u.merged_into !== u.row.merged_into && !failed.has(u.row.source));
  return { fresh: merged, updates };
}

// ---------------------------------------------------------------------------
// Writes (run only)

async function writeRows(sb: Sb, plan: MergePlan, summary: Summary): Promise<void> {
  const last_seen_at = new Date().toISOString();
  const rows = plan.fresh.map((r) => ({ ...r, last_seen_at }));
  for (let i = 0; i < rows.length; i += DB_CHUNK) {
    const chunk = rows.slice(i, i + DB_CHUNK);
    const { error } = await sb.from("ext_rare_observations").upsert(chunk, { onConflict: "source,source_id" });
    if (error) throw new Error(`ext_rare_observations upsert: ${error.message}`);
    summary.written += chunk.length;
  }
  for (const u of plan.updates) {
    const { error } = await sb.from("ext_rare_observations").update({ merged_into: u.merged_into })
      .eq("source", u.row.source).eq("source_id", u.row.source_id);
    if (error) throw new Error(`merged_into update ${rowKey(u.row)}: ${error.message}`);
    summary.written++;
  }
}

function sampleOf(rows: readonly ExtRow[]): Summary["sample"] {
  return rows.slice(0, SAMPLE_SIZE).map((r) => ({
    key: rowKey(r),
    species_sci: r.species_sci,
    species_et: r.species_et,
    country_code: r.country_code,
    obs_date_from: r.obs_date_from,
    coord_precision: r.coord_precision,
    merged_into: r.merged_into,
  }));
}

function failedSources(summary: Summary): Set<string> {
  const failed = new Set<string>();
  if (summary.sources.lofk.errors.length > 0) failed.add("lofk");
  if (summary.sources.tarsiger.errors.length > 0) failed.add("tarsiger");
  return failed;
}

async function runPipeline(mode: Mode): Promise<Summary> {
  const summary = emptySummary(mode);
  try {
    const sb = serviceClient();
    const [lofk, tarsiger] = await Promise.all([fetchLofk(summary), fetchTarsiger(summary)]);
    const fresh = withSpecies(dedupe([...lofk, ...tarsiger]), await readSpeciesMap(sb), summary);
    const geocoded = await geocodeRows(sb, fresh, mode, summary);
    const plan = await planMerges(sb, geocoded, failedSources(summary), summary);
    summary.sample = sampleOf(plan.fresh);
    if (mode === "run") await writeRows(sb, plan, summary);
  } catch (e) {
    summary.error = errMsg(e);
  }
  return summary;
}

async function runInBackgroundJob(): Promise<void> {
  const summary = await runPipeline("run");
  console.log(JSON.stringify(summary));
}

function runInBackground(p: Promise<void>): void {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(p);
  else p.catch((e) => console.error("[ext-rare-refresh background]", errMsg(e)));
}

async function readMode(req: Request): Promise<Mode | null> {
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const mode = (parsed as Record<string, unknown>).mode;
    return mode === "dry_run" || mode === "run" ? mode : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expectedSecret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json(500, { error: "server_misconfigured", detail: "VAATLUSTE_WEBHOOK_SECRET not set" });
  }
  if (req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json(401, { error: "unauthorized" });
  }

  const mode = await readMode(req);
  if (mode === null) return json(400, { error: "body must be JSON {mode: \"dry_run\" | \"run\"}" });

  if (mode === "run") {
    runInBackground(runInBackgroundJob());
    return json(202, { accepted: true, mode });
  }
  return json(200, await runPipeline("dry_run"));
});
