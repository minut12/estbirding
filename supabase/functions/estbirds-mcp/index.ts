// redeploy-marker: 2026-11-12 - P181h estbirds-mcp (read-only MCP server)
// estbirds-mcp (P181h)
// Read-only MCP server over Streamable HTTP (JSON-RPC 2.0 via POST, plain
// application/json replies, no SSE). Lets the owner's Claude sessions query
// EstBirds app state with typed tools instead of hand-written SQL.
//
// Methods: initialize, notifications/initialized (and any other notification
// -> 202), ping, tools/list, tools/call. GET/DELETE -> 405 (no SSE stream).
//
// Auth: every request needs `Authorization: Bearer <secret>`, compared in
// constant time to env ESTBIRDS_MCP_SECRET. Env missing -> 500, wrong -> 401.
//
// Safety: service-role client is used internally, but every tool only runs
// SELECTs through PostgREST (plus the read-only feed_health() RPC when it
// exists). Inputs are validated server-side against the same rules as the
// JSON Schemas in tools/list. Result lists are capped at MAX_ROWS (200).
// No sensitive-site flag exists in the DB, so all observation coordinates are
// rounded to 0.1 deg; observer names from eElurikkus are not returned.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

type RpcId = string | number | null;

type RpcRequest = {
  jsonrpc: "2.0";
  id?: RpcId;
  method: string;
  params?: JsonObject;
};

type ToolError = { code: string; message: string; details?: Json };

class ToolFailure extends Error {
  readonly info: ToolError;
  constructor(info: ToolError) {
    super(info.message);
    this.info = info;
  }
}

type ArgSpec =
  | { kind: "string"; required: boolean; minLength: number; maxLength: number; pattern: RegExp; patternSrc: string; description: string }
  | { kind: "integer"; required: boolean; minimum: number; maximum: number; def: number; description: string };

type ToolDef = {
  name: string;
  title: string;
  description: string;
  args: Record<string, ArgSpec>;
  run: (db: SupabaseClient, args: Record<string, string | number>) => Promise<JsonObject>;
};

const SERVER_INFO = { name: "estbirds-mcp", title: "EstBirds (read-only)", version: "1.0.0" };
const LATEST_PROTOCOL = "2025-06-18";
const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_ROWS = 200;
const QUERY_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 64 * 1024;

// Known cron_runs jobs (live list, 12 Nov 2026). Jobs seen in the latest 300
// cron_runs rows are added at run time, so new jobs still show up.
const KNOWN_JOBS = [
  "elurikkus", "elurikkus_recent", "elurikkus-raport", "ennustus", "news",
  "toenaosus-raport", "toenaosus-sightings", "vaatluste-raport", "ufo",
  "prediction-outcomes", "gbif", "gbif_fi", "gbif_se", "gbif_lv", "gbif_lt", "gbif_ru",
];

// Key cache tables and the timestamp column that shows their freshness.
const CACHE_TABLES: Array<{ table: string; column: string }> = [
  { table: "elurikkus_cache", column: "fetched_at" },
  { table: "elurikkus_observations", column: "fetched_at" },
  { table: "ebird_cache", column: "fetched_at" },
  { table: "europe_ebird_cache", column: "fetched_at" },
  { table: "ennustus_cache", column: "updated_at" },
  { table: "ennustus_cells_cache", column: "updated_at" },
  { table: "ebird_rare_observations", column: "last_seen_at" },
  { table: "ext_rare_observations", column: "last_seen_at" },
  { table: "hk_species", column: "updated_at" },
  { table: "llm_calls", column: "created_at" },
];

// ---------- helpers ----------

const NAME_RE = /^[\p{L}\p{M} .'()-]+$/u;
const COUNTRY_RE = /^[A-Za-z]{2}$/;

function nameArg(description: string): ArgSpec {
  return {
    kind: "string", required: true, minLength: 2, maxLength: 80,
    pattern: NAME_RE, patternSrc: "^[\\p{L}\\p{M} .'()-]+$", description,
  };
}

function daysArg(def: number): ArgSpec {
  return { kind: "integer", required: false, minimum: 1, maximum: 30, def, description: `Look-back window in days (1-30, default ${def}).` };
}

function round1(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

// eBird personal-location names embed exact coordinates, e.g.
// "Unknown Road, ..., BY (53,975, 27,417)": strip such pairs from free text.
const COORD_PAIR_RE = /\(?\s*-?\d{1,3}[.,]\d{2,}\s*[,;]\s*-?\d{1,3}[.,]\d{2,}\s*\)?/g;
function scrubCoords(s: string | null): string | null {
  if (s === null) return null;
  const out = s.replace(COORD_PAIR_RE, " ").replace(/\s{2,}/g, " ").replace(/[\s,]+$/, "").trim();
  return out || null;
}

function ageMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.round((Date.now() - t) / 60000) : null;
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// Repairs UTF-8 text that was decoded as Latin-1 (e.g. "p" + 0xC3 0xB5 pairs instead of o-tilde).
function fixMojibake(s: string): string {
  if (!/[\u00c3\u00c5]/.test(s)) return s;
  const bytes = new Uint8Array([...s].map((c) => c.charCodeAt(0)));
  if ([...s].some((c) => c.charCodeAt(0) > 255)) return s;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

function fail(code: string, message: string, details?: Json): never {
  throw new ToolFailure({ code, message, details });
}

// Row shapes are declared by each caller (supabase-js is untyped here: no
// generated Database type in Deno), so the data is cast to T after the check.
async function q<T>(label: string, p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T | null> {
  const { data, error } = await p;
  if (error) fail("db_error", `${label}: ${error.message}`, error.code ?? null);
  return (data ?? null) as T | null;
}

function validateArgs(tool: ToolDef, raw: Json | undefined): Record<string, string | number> {
  const input: JsonObject = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    fail("invalid_arguments", "arguments must be an object");
  }
  const out: Record<string, string | number> = {};
  for (const key of Object.keys(input)) {
    if (!(key in tool.args)) fail("invalid_arguments", `unknown argument '${key}'`);
  }
  for (const [key, spec] of Object.entries(tool.args)) {
    const v = input[key];
    if (v === undefined || v === null) {
      if (spec.required) fail("invalid_arguments", `missing required argument '${key}'`);
      if (spec.kind === "integer") out[key] = spec.def;
      continue;
    }
    if (spec.kind === "string") {
      if (typeof v !== "string") fail("invalid_arguments", `'${key}' must be a string`);
      const s = fixMojibake(v.normalize("NFC").trim().replace(/\s+/g, " "));
      if (s.length < spec.minLength || s.length > spec.maxLength) {
        fail("invalid_arguments", `'${key}' length must be ${spec.minLength}-${spec.maxLength}`);
      }
      if (!spec.pattern.test(s)) fail("invalid_arguments", `'${key}' has invalid characters`);
      out[key] = s;
    } else {
      if (typeof v !== "number" || !Number.isInteger(v)) fail("invalid_arguments", `'${key}' must be an integer`);
      if (v < spec.minimum || v > spec.maximum) {
        fail("invalid_arguments", `'${key}' must be between ${spec.minimum} and ${spec.maximum}`);
      }
      out[key] = v;
    }
  }
  return out;
}

function schemaFor(tool: ToolDef): JsonObject {
  const properties: JsonObject = {};
  const required: string[] = [];
  for (const [key, spec] of Object.entries(tool.args)) {
    if (spec.kind === "string") {
      properties[key] = {
        type: "string", minLength: spec.minLength, maxLength: spec.maxLength,
        pattern: spec.patternSrc, description: spec.description,
      };
    } else {
      properties[key] = {
        type: "integer", minimum: spec.minimum, maximum: spec.maximum,
        default: spec.def, description: spec.description,
      };
    }
    if (spec.required) required.push(key);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

// ---------- species resolution ----------

type ResolvedSpecies = {
  input: string;
  et_name: string | null;
  sci_name: string | null;
  en_name: string | null;
  matched_via: string;
};

type NameRow = { et: string | null; sci: string | null; en: string | null };

// Input contains no LIKE wildcards (NAME_RE), so ilike = case-insensitive equality.
async function resolveSpecies(db: SupabaseClient, name: string): Promise<ResolvedSpecies> {
  const sig = () => AbortSignal.timeout(QUERY_TIMEOUT_MS);
  const lookups: Array<{ via: string; run: () => Promise<NameRow | null> }> = [
    {
      via: "gbif_taxon_keys.species_name",
      run: async () => {
        const r = await q<Array<{ species_name: string; species_lat: string | null }>>("gbif_taxon_keys",
          db.from("gbif_taxon_keys").select("species_name,species_lat").ilike("species_name", name).limit(1).abortSignal(sig()));
        return r && r[0] ? { et: r[0].species_name, sci: r[0].species_lat, en: null } : null;
      },
    },
    {
      via: "hk_species.et_name",
      run: async () => {
        const r = await q<Array<{ et_name: string | null; species_sci: string | null; en_name: string | null }>>("hk_species",
          db.from("hk_species").select("et_name,species_sci,en_name").ilike("et_name", name).limit(1).abortSignal(sig()));
        return r && r[0] ? { et: r[0].et_name, sci: r[0].species_sci, en: r[0].en_name } : null;
      },
    },
    {
      via: "gbif_taxon_keys.species_lat",
      run: async () => {
        const r = await q<Array<{ species_name: string; species_lat: string | null }>>("gbif_taxon_keys",
          db.from("gbif_taxon_keys").select("species_name,species_lat").ilike("species_lat", name).limit(1).abortSignal(sig()));
        return r && r[0] ? { et: r[0].species_name, sci: r[0].species_lat, en: null } : null;
      },
    },
    {
      via: "hk_species.species_sci",
      run: async () => {
        const r = await q<Array<{ et_name: string | null; species_sci: string | null; en_name: string | null }>>("hk_species",
          db.from("hk_species").select("et_name,species_sci,en_name").ilike("species_sci", name).limit(1).abortSignal(sig()));
        return r && r[0] ? { et: r[0].et_name, sci: r[0].species_sci, en: r[0].en_name } : null;
      },
    },
    {
      via: "species_info.com_name_en",
      run: async () => {
        const r = await q<Array<{ sci_name: string | null; com_name_en: string | null }>>("species_info",
          db.from("species_info").select("sci_name,com_name_en").ilike("com_name_en", name).limit(1).abortSignal(sig()));
        return r && r[0] ? { et: null, sci: r[0].sci_name, en: r[0].com_name_en } : null;
      },
    },
  ];
  const hits = await Promise.all(lookups.map((l) => l.run()));
  const idx = hits.findIndex((h) => h !== null);
  if (idx < 0) fail("species_not_found", `No species matches '${name}' (Estonian, scientific or English name).`);
  const hit = hits[idx] as NameRow;
  let { et, sci, en } = hit;
  if (sci && !et) {
    const r = await q<Array<{ species_name: string }>>("gbif_taxon_keys",
      db.from("gbif_taxon_keys").select("species_name").ilike("species_lat", sci).limit(1).abortSignal(sig()));
    et = r && r[0] ? r[0].species_name : null;
  }
  if (sci && !en) {
    const r = await q<Array<{ com_name_en: string | null }>>("species_info",
      db.from("species_info").select("com_name_en").ilike("sci_name", sci).limit(1).abortSignal(sig()));
    en = r && r[0] ? r[0].com_name_en : null;
  }
  return { input: name, et_name: et, sci_name: sci, en_name: en, matched_via: lookups[idx].via };
}

const ENNUSTUS_COLS = "species_name,score,current_pct,best_period_pct,best_period_label,season,no_data,exit_reason,cell_lat,cell_lon,computed_at,updated_at";

// ---------- tools ----------

async function feedHealthFallback(db: SupabaseClient): Promise<JsonObject> {
  const sig = () => AbortSignal.timeout(QUERY_TIMEOUT_MS);
  const recent = await q<Array<{ job: string }>>("cron_runs",
    db.from("cron_runs").select("job").order("started_at", { ascending: false }).limit(300).abortSignal(sig()));
  const jobs = [...new Set([...KNOWN_JOBS, ...(recent ?? []).map((r) => r.job)])].slice(0, MAX_ROWS);
  type RunRow = { started_at: string | null; finished_at: string | null; ok: boolean | null; error: string | null };
  const jobRows = await Promise.all(jobs.map(async (job) => {
    const [last, lastOk] = await Promise.all([
      q<RunRow[]>("cron_runs", db.from("cron_runs").select("started_at,finished_at,ok,error").eq("job", job)
        .order("started_at", { ascending: false }).limit(1).abortSignal(sig())),
      q<RunRow[]>("cron_runs", db.from("cron_runs").select("started_at,finished_at").eq("job", job).eq("ok", true)
        .order("started_at", { ascending: false }).limit(1).abortSignal(sig())),
    ]);
    const l = last && last[0] ? last[0] : null;
    const o = lastOk && lastOk[0] ? lastOk[0] : null;
    const row: JsonObject = {
      job,
      last_started_at: l ? l.started_at : null,
      last_finished_at: l ? l.finished_at : null,
      last_ok: l ? l.ok : null,
      last_error: l && l.error ? l.error.slice(0, 300) : null,
      last_ok_started_at: o ? o.started_at : null,
      minutes_since_last_start: ageMinutes(l ? l.started_at : null),
      minutes_since_last_ok: ageMinutes(o ? o.started_at : null),
    };
    return row;
  }));
  const caches = await Promise.all(CACHE_TABLES.map(async ({ table, column }) => {
    const r = await q<Array<Record<string, string | null>>>(table, db.from(table).select(column)
      .not(column, "is", null).order(column, { ascending: false }).limit(1).abortSignal(sig()));
    const ts = r && r[0] ? r[0][column] ?? null : null;
    const row: JsonObject = { table, column, latest: ts, minutes_since: ageMinutes(ts) };
    return row;
  }));
  return { source: "fallback", jobs: jobRows.filter((j) => j.last_started_at !== null), caches };
}

async function feedHealth(db: SupabaseClient): Promise<JsonObject> {
  const { data, error } = await db.rpc("feed_health").abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
  if (!error) {
    const rows = Array.isArray(data) ? (data as Json[]).slice(0, MAX_ROWS) : (data as Json);
    return { source: "rpc:feed_health", result: rows };
  }
  const fb = await feedHealthFallback(db);
  fb.rpc_error = error.message.slice(0, 200);
  return fb;
}

async function speciesStatus(db: SupabaseClient, args: Record<string, string | number>): Promise<JsonObject> {
  const sp = await resolveSpecies(db, String(args.name));
  const sig = () => AbortSignal.timeout(QUERY_TIMEOUT_MS);
  type EnnRow = Record<string, Json>;
  type EluObs = { observed_at: string | null; observed_dt: string | null; locality: string | null; county: string | null; lat: number | null; lon: number | null; individual_count: number | null; behavior: string | null };
  type EluCache = { t: string | null; occ7: number | null; lat: number | null; lon: number | null; coords_source: string | null; locality: string | null; municipality: string | null; county: string | null; fetched_at: string | null };
  type EbCache = { t: string | null; occ7: number | null; lat: number | null; lon: number | null; location_name: string | null; fetched_at: string | null };
  const et = sp.et_name;
  const [enn, obs, eluCache, ebCache, hkCount] = await Promise.all([
    et ? q<EnnRow[]>("ennustus_cache", db.from("ennustus_cache").select(ENNUSTUS_COLS).eq("species_name", et).limit(5).abortSignal(sig())) : Promise.resolve(null),
    et ? q<EluObs[]>("elurikkus_observations", db.from("elurikkus_observations")
      .select("observed_at,observed_dt,locality,county,lat,lon,individual_count,behavior")
      .eq("species_name", et).order("observed_at", { ascending: false }).limit(10).abortSignal(sig())) : Promise.resolve(null),
    et ? q<EluCache[]>("elurikkus_cache", db.from("elurikkus_cache")
      .select("t,occ7,lat,lon,coords_source,locality,municipality,county,fetched_at").eq("species_name", et).limit(1).abortSignal(sig())) : Promise.resolve(null),
    sp.en_name ? q<EbCache[]>("ebird_cache", db.from("ebird_cache")
      .select("t,occ7,lat,lon,location_name,fetched_at").eq("species_name", sp.en_name).limit(1).abortSignal(sig())) : Promise.resolve(null),
    sp.sci_name ? (async () => {
      const { count, error } = await db.from("hk_records").select("id", { count: "exact", head: true })
        .ilike("taxon_sci", `${sp.sci_name}%`).abortSignal(sig());
      if (error) fail("db_error", `hk_records: ${error.message}`);
      return count ?? 0;
    })() : Promise.resolve(null),
  ]);
  const e = eluCache && eluCache[0] ? eluCache[0] : null;
  const b = ebCache && ebCache[0] ? ebCache[0] : null;
  return {
    species: sp as unknown as JsonObject,
    ennustus: enn ?? [],
    elurikkus_last_observations: (obs ?? []).map((o) => ({
      observed_at: o.observed_at, observed_dt: o.observed_dt, locality: scrubCoords(o.locality), county: o.county,
      lat: round1(o.lat), lon: round1(o.lon), individual_count: o.individual_count, behavior: o.behavior,
    })),
    elurikkus_cache: e ? {
      t: e.t, occ7: e.occ7, lat: round1(e.lat), lon: round1(e.lon), coords_source: e.coords_source,
      locality: scrubCoords(e.locality), municipality: e.municipality, county: e.county, fetched_at: e.fetched_at,
    } : null,
    ebird_ee_cache: b ? {
      t: b.t, occ7: b.occ7, lat: round1(b.lat), lon: round1(b.lon), location_name: scrubCoords(b.location_name), fetched_at: b.fetched_at,
    } : null,
    hk_record_count: hkCount,
    coords_note: "Coordinates rounded to 0.1 deg (no sensitive-site flag in DB).",
  };
}

async function recentRarities(db: SupabaseClient, args: Record<string, string | number>): Promise<JsonObject> {
  const days = Number(args.days);
  const country = typeof args.country === "string" ? args.country.toUpperCase() : null;
  const sig = () => AbortSignal.timeout(QUERY_TIMEOUT_MS);
  const since = sinceIso(days);
  type EbRare = { species_et_name: string | null; species_lat_name: string | null; species_code: string | null; rarity_level: string | null; country_code: string | null; region: string | null; location: string | null; lat: number | null; lng: number | null; distance_to_ee_km: number | null; obs_date: string | null; obs_count: number | null };
  type ExtRare = { source: string; species_et: string | null; species_sci: string | null; country_code: string | null; obs_date_from: string | null; obs_date_to: string | null; place_text: string | null; district_hint: string | null; lat: number | null; lng: number | null; coord_precision: string | null; nth_record: number | null; is_important: boolean | null; source_url: string | null };
  let eb = db.from("ebird_rare_observations")
    .select("species_et_name,species_lat_name,species_code,rarity_level,country_code,region,location,lat,lng,distance_to_ee_km,obs_date,obs_count")
    .gte("obs_date", since).order("obs_date", { ascending: false }).limit(MAX_ROWS);
  let ext = db.from("ext_rare_observations")
    .select("source,species_et,species_sci,country_code,obs_date_from,obs_date_to,place_text,district_hint,lat,lng,coord_precision,nth_record,is_important,source_url")
    .gte("obs_date_to", since.slice(0, 10)).is("merged_into", null).order("obs_date_to", { ascending: false }).limit(MAX_ROWS);
  if (country) {
    eb = eb.eq("country_code", country);
    ext = ext.eq("country_code", country);
  }
  const [ebRows, extRows] = await Promise.all([
    q<EbRare[]>("ebird_rare_observations", eb.abortSignal(sig())),
    q<ExtRare[]>("ext_rare_observations", ext.abortSignal(sig())),
  ]);
  const e = ebRows ?? [];
  const x = extRows ?? [];
  return {
    days, country, since,
    ebird: e.map((r) => ({ ...r, location: scrubCoords(r.location), lat: round1(r.lat), lng: round1(r.lng), distance_to_ee_km: r.distance_to_ee_km === null ? null : Math.round(Number(r.distance_to_ee_km)) })),
    ebird_truncated: e.length >= MAX_ROWS,
    ext: x.map((r) => ({ ...r, place_text: scrubCoords(r.place_text), lat: round1(r.lat), lng: round1(r.lng) })),
    ext_truncated: x.length >= MAX_ROWS,
    coords_note: "Coordinates rounded to 0.1 deg and coordinate pairs stripped from place text (no sensitive-site flag in DB). ext rows merged into eBird rows are omitted.",
  };
}

async function predictionFor(db: SupabaseClient, args: Record<string, string | number>): Promise<JsonObject> {
  const sp = await resolveSpecies(db, String(args.name));
  if (!sp.et_name) fail("no_estonian_name", `Species '${sp.input}' has no Estonian name in gbif_taxon_keys, so no Ennustus row.`);
  const sig = () => AbortSignal.timeout(QUERY_TIMEOUT_MS);
  type Period = { pct?: number; label?: string; obsCount?: number; isCurrent?: boolean };
  type Cell = { centerLat?: number; centerLon?: number; probability?: number; eluCount?: number; gbifCount?: number; isTopScore?: boolean; scoreRecency?: number; periods?: Period[] };
  const [rows, cells] = await Promise.all([
    q<Array<Record<string, Json>>>("ennustus_cache", db.from("ennustus_cache").select(ENNUSTUS_COLS).eq("species_name", sp.et_name).limit(MAX_ROWS).abortSignal(sig())),
    q<Array<{ cells: Cell[] | null; computed_at: number | null; updated_at: string | null }>>("ennustus_cells_cache",
      db.from("ennustus_cells_cache").select("cells,computed_at,updated_at").eq("species_name", sp.et_name).limit(1).abortSignal(sig())),
  ]);
  const c = cells && cells[0] ? cells[0] : null;
  const list = c && Array.isArray(c.cells) ? c.cells : [];
  const top = [...list].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0)).slice(0, 10).map((cell) => {
    const cur = (cell.periods ?? []).find((p) => p.isCurrent) ?? null;
    return {
      center_lat: cell.centerLat ?? null, center_lon: cell.centerLon ?? null, probability: cell.probability ?? null,
      elu_count: cell.eluCount ?? null, gbif_count: cell.gbifCount ?? null, is_top_score: cell.isTopScore ?? null,
      current_period: cur ? { label: cur.label ?? null, pct: cur.pct ?? null, obs_count: cur.obsCount ?? null } : null,
    };
  });
  return {
    species: sp as unknown as JsonObject,
    ennustus_cache: rows ?? [],
    cells: c ? { cell_count: list.length, computed_at: c.computed_at, updated_at: c.updated_at, top_cells_by_probability: top } : null,
  };
}

async function hkRecords(db: SupabaseClient, args: Record<string, string | number>): Promise<JsonObject> {
  const sp = await resolveSpecies(db, String(args.name));
  const limit = Number(args.limit);
  const sig = () => AbortSignal.timeout(QUERY_TIMEOUT_MS);
  if (!sp.sci_name) fail("no_scientific_name", `Species '${sp.input}' has no scientific name to match HK records.`);
  const [species, records] = await Promise.all([
    q<Array<Record<string, Json>>>("hk_species", db.from("hk_species")
      .select("taxon_sci,species_sci,is_subspecies,et_name,et_alt_name,en_name,category,hk_status,hk_scope_et,hk_removed_from_year,origin_text_et,nth_record_et,counts_text,records_before,inds_before,records_year,inds_year,counts_year,updated_at")
      .ilike("species_sci", sp.sci_name).limit(20).abortSignal(sig())),
    (async () => {
      const { data, error, count } = await db.from("hk_records")
        .select("source_id,seq,taxon_sci,heading_et,category,status,date_text,date_from,date_to,year,place,kihelkond,county,county_2021,individuals_text,count_min,evidence,observers,breeding,rejection_reason_et,page", { count: "exact" })
        .ilike("taxon_sci", `${sp.sci_name}%`).order("year", { ascending: false, nullsFirst: false })
        .order("date_from", { ascending: false, nullsFirst: false }).limit(limit).abortSignal(sig());
      if (error) fail("db_error", `hk_records: ${error.message}`);
      return { rows: (data ?? []) as Array<Record<string, Json>>, total: count ?? 0 };
    })(),
  ]);
  return {
    species: sp as unknown as JsonObject,
    hk_species: species ?? [],
    records_total: records.total,
    records: records.rows,
    truncated: records.total > records.rows.length,
  };
}

async function llmStatus(db: SupabaseClient, args: Record<string, string | number>): Promise<JsonObject> {
  const days = Number(args.days);
  const since = sinceIso(days);
  const FETCH_CAP = 10000;
  type Row = { source: string | null; provider: string | null; model: string | null; ok: boolean | null; error_class: string | null; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null; fallback: boolean | null; created_at: string };
  const rows = await q<Row[]>("llm_calls", db.from("llm_calls")
    .select("source,provider,model,ok,error_class,input_tokens,output_tokens,latency_ms,fallback,created_at")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(FETCH_CAP)
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))) ?? [];
  type Agg = { source: string | null; provider: string | null; model: string | null; ok: boolean | null; error_class: string | null; calls: number; fallback_calls: number; input_tokens: number; output_tokens: number; latency_sum: number; latency_n: number; last_at: string };
  const groups = new Map<string, Agg>();
  for (const r of rows) {
    const key = JSON.stringify([r.source, r.provider, r.model, r.ok, r.error_class]);
    let g = groups.get(key);
    if (!g) {
      g = { source: r.source, provider: r.provider, model: r.model, ok: r.ok, error_class: r.error_class, calls: 0, fallback_calls: 0, input_tokens: 0, output_tokens: 0, latency_sum: 0, latency_n: 0, last_at: r.created_at };
      groups.set(key, g);
    }
    g.calls += 1;
    if (r.fallback) g.fallback_calls += 1;
    g.input_tokens += r.input_tokens ?? 0;
    g.output_tokens += r.output_tokens ?? 0;
    if (typeof r.latency_ms === "number") { g.latency_sum += r.latency_ms; g.latency_n += 1; }
    if (r.created_at > g.last_at) g.last_at = r.created_at;
  }
  const out = [...groups.values()].sort((a, b) => b.calls - a.calls).slice(0, MAX_ROWS).map((g) => ({
    source: g.source, provider: g.provider, model: g.model, ok: g.ok, error_class: g.error_class,
    calls: g.calls, fallback_calls: g.fallback_calls, input_tokens: g.input_tokens, output_tokens: g.output_tokens,
    avg_latency_ms: g.latency_n ? Math.round(g.latency_sum / g.latency_n) : null, last_at: g.last_at,
  }));
  return {
    days, since, total_calls: rows.length, ok_calls: rows.filter((r) => r.ok === true).length,
    rows_capped: rows.length >= FETCH_CAP, groups: out, groups_truncated: groups.size > MAX_ROWS,
  };
}

const TOOLS: ToolDef[] = [
  {
    name: "feed_health",
    title: "Feed freshness",
    description: "Freshness of every EstBirds data feed: last start / last OK per cron_runs job and newest timestamp of key cache tables (minutes since). Uses public.feed_health() when it exists, else a fallback.",
    args: {},
    run: (db) => feedHealth(db),
  },
  {
    name: "species_status",
    title: "Species status",
    description: "Current state of one species (Estonian, scientific or English name): resolved names, Ennustus probability fields, last 10 eElurikkus observations in Estonia, elurikkus/eBird EE cache rows and HK (rarities committee) record count.",
    args: { name: nameArg("Species name: Estonian (e.g. Siidisaba), scientific (Bombycilla garrulus) or English.") },
    run: speciesStatus,
  },
  {
    name: "recent_rarities",
    title: "Recent rarities",
    description: "Rare-bird reports from the last N days: eBird notable (ebird_rare_observations) and non-eBird feeds (ext_rare_observations: LOFK, Tarsiger, ...), optionally for one country. Coordinates rounded to 0.1 deg. Max 200 rows per source.",
    args: {
      days: daysArg(7),
      country: {
        kind: "string", required: false, minLength: 2, maxLength: 2, pattern: COUNTRY_RE,
        patternSrc: "^[A-Za-z]{2}$", description: "Optional ISO 3166-1 alpha-2 country code, e.g. EE, FI, LV, LT, SE.",
      },
    },
    run: recentRarities,
  },
  {
    name: "prediction_for",
    title: "Ennustus prediction",
    description: "Ennustus (prediction) for one species: its ennustus_cache row(s) and a summary of ennustus_cells_cache (cell count and top 10 cells by probability with the current period).",
    args: { name: nameArg("Species name: Estonian, scientific or English.") },
    run: predictionFor,
  },
  {
    name: "hk_records",
    title: "HK rarity records",
    description: "Estonian Rarities Committee (HK) data for one species: hk_species summary rows and hk_records (newest year first, includes subspecies).",
    args: {
      name: nameArg("Species name: Estonian, scientific or English."),
      limit: { kind: "integer", required: false, minimum: 1, maximum: MAX_ROWS, def: 50, description: "Max records to return (1-200, default 50)." },
    },
    run: hkRecords,
  },
  {
    name: "llm_status",
    title: "LLM call status",
    description: "Aggregate of public.llm_calls over the last N days grouped by source, provider, model, ok and error_class: call counts, fallback calls, tokens, average latency, last call time.",
    args: { days: daysArg(7) },
    run: llmStatus,
  },
];

// ---------- JSON-RPC / HTTP ----------

function json(body: Json | JsonObject, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });
}

function rpcResult(id: RpcId, result: JsonObject): JsonObject {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: RpcId, code: number, message: string, data?: Json): JsonObject {
  const err: JsonObject = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: "2.0", id, error: err };
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// Constant-time compare on fixed-length digests (no length leak).
async function secretMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

let dbClient: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!dbClient) {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) fail("config_error", "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    dbClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return dbClient;
}

async function handleRpc(msg: RpcRequest): Promise<JsonObject | null> {
  const id: RpcId = msg.id === undefined ? null : msg.id;
  const isNotification = msg.id === undefined;
  if (isNotification) return null; // notifications/initialized etc.: nothing to send back
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params && typeof msg.params.protocolVersion === "string" ? msg.params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(asked) ? asked : LATEST_PROTOCOL;
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "Read-only EstBirds app state. All tools are SELECT-only; lists are capped at 200 rows; observation coordinates are rounded to 0.1 deg.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({
          name: t.name, title: t.title, description: t.description, inputSchema: schemaFor(t),
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const p = msg.params ?? {};
      const name = typeof p.name === "string" ? p.name : "";
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name || "(missing)"}`);
      try {
        const args = validateArgs(tool, p.arguments);
        const out = await tool.run(getDb(), args);
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false });
      } catch (e) {
        const info: ToolError = e instanceof ToolFailure
          ? e.info
          : { code: e instanceof Error && e.name === "AbortError" ? "timeout" : "internal_error", message: e instanceof Error ? e.message : String(e) };
        if (!(e instanceof ToolFailure)) console.error(`estbirds-mcp ${name}: ${info.message}`);
        const err = info as unknown as JsonObject;
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify({ error: err }) }], structuredContent: { error: err }, isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const secret = Deno.env.get("ESTBIRDS_MCP_SECRET") ?? "";
  if (!secret) return json({ error: "ESTBIRDS_MCP_SECRET not configured" }, 500);
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m || !(await secretMatches(m[1].trim(), secret))) {
    return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  }
  if (req.method !== "POST") return json({ error: "method not allowed; use POST (no SSE stream)" }, 405, { Allow: "POST" });

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json(rpcError(null, -32600, "Request too large"), 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }
  if (Array.isArray(parsed)) return json(rpcError(null, -32600, "JSON-RPC batches are not supported"), 400);
  if (!parsed || typeof parsed !== "object") return json(rpcError(null, -32600, "Invalid Request"), 400);
  const msg = parsed as Partial<RpcRequest> & { result?: Json; error?: Json };
  if (msg.jsonrpc !== "2.0") return json(rpcError(msg.id ?? null, -32600, "Invalid Request: jsonrpc must be '2.0'"), 400);
  if (typeof msg.method !== "string") {
    // A client response (result/error) to a server request: nothing to do.
    return new Response(null, { status: 202 });
  }
  if (msg.id !== undefined && msg.id !== null && typeof msg.id !== "string" && typeof msg.id !== "number") {
    return json(rpcError(null, -32600, "Invalid Request: bad id"), 400);
  }
  if (msg.params !== undefined && (typeof msg.params !== "object" || msg.params === null || Array.isArray(msg.params))) {
    return json(rpcError(msg.id ?? null, -32602, "params must be an object"), 400);
  }
  const reply = await handleRpc(msg as RpcRequest);
  if (!reply) return new Response(null, { status: 202 });
  return json(reply);
});
