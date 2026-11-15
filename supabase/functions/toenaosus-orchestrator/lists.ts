// supabase/functions/toenaosus-orchestrator/lists.ts
// P184c1: the three evidence lists (Juba Eestis / Lahenemas / Hooaeg) stored on
// toenaosus_raport.evidence_lists. Shadow mode: nothing reads them yet.
// Never import index.ts from here (its top-level Deno.serve would start a server
// inside `deno test`).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RarityLevel = "rare" | "super" | "mega";

export interface EvidenceLists {
  version: "v5-evidence";
  as_of: string; // YYYY-MM-DD, Europe/Tallinn
  juba_eestis: JubaEestisItem[]; // last_date desc
  lahenemas: LahenemasItem[]; // latest_km asc
  hooaeg: HooaegItem[]; // years desc, then last10 desc; only >= 2 years
  diag: { rarity_species: number; errors: string[]; elapsed_ms: number };
}

export interface JubaEestisItem {
  species_et: string;
  species_lat: string;
  ebird_code: string | null;
  rarity_level: RarityLevel;
  avatar_url: string | null;
  first_date: string;
  last_date: string;
  n_obs: number;
  max_count: number | null;
  counties: string[];
  stay: { n_birds: number; median_days: number; pct_over_3d: number } | null;
  hk: { accepted_records: number; months: number[] } | null;
}

export interface SightingEvent {
  date: string;
  country_code: string;
  location: string;
  lat: number;
  lon: number;
  km_to_turi: number;
  count: number | null;
}

export interface LahenemasItem {
  species_et: string;
  species_lat: string;
  ebird_code: string;
  rarity_level: RarityLevel;
  avatar_url: string | null;
  kind: "near" | "track";
  events: SightingEvent[];
  latest_km: number;
  hooaeg_years: number | null;
}

export interface HooaegItem {
  species_et: string;
  species_lat: string;
  ebird_code: string | null;
  rarity_level: RarityLevel;
  avatar_url: string | null;
  years_in_window_since_1990: number;
  years_in_window_last10: number;
  last_year_in_window: number | null;
  years_by_month: number[];
  sites: {
    lat: number;
    lon: number;
    label: string | null;
    county: string | null;
    n_days: number;
  }[];
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Structural subset of index.ts SpeciesMeta, so SpeciesMeta[] is assignable. */
export interface SpeciesMetaInput {
  name?: string;
  estonianName?: string;
  scientificName?: string;
  rarityLevel?: string;
  ebirdCode?: string;
  avatarUrl?: string | null;
  predictionExclude?: boolean;
}

export interface RaritySpecies {
  name_et: string;
  sci: string;
  ebird_code: string | null;
  level: RarityLevel;
  avatar_url: string | null;
}

export interface JubaRow {
  species_et: string;
  date: string;
  county: string | null;
  count: number | null;
}

export interface JubaGroup {
  species_et: string;
  first_date: string;
  last_date: string;
  n_obs: number;
  max_count: number | null;
  counties: string[];
}

export interface RareObsRow {
  species_et_name: string | null;
  species_code: string;
  obs_date: string;
  lat: number | null;
  lng: number | null;
  distance_to_ee_km: number | null;
  obs_count: number | null;
  country_code: string | null;
  location: string | null;
}

export interface SpeciesEvent extends SightingEvent {
  species_et: string;
  species_code: string;
}

export interface LahenemasPick {
  species_et: string;
  species_code: string;
  kind: "near" | "track";
  events: SightingEvent[];
  latest_km: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RARITY_LEVELS: readonly RarityLevel[] = ["rare", "super", "mega"];
const JUBA_WINDOW_DAYS = 14;
const LAHENEMAS_WINDOW_DAYS = 14;
const NEAR_KM = 300;
const NEAR_MAX_AGE_DAYS = 5;
const TRACK_MAX_AGE_DAYS = 7;
const TRACK_STEP_DAYS = 7;
const TRACK_STEP_KM = 300;
const TRACK_MIN_DROP_KM = 50;
const TRACK_EXCLUDED_CC = new Set(["PL", "BY"]);
const SE_MAX_KM = 400;
const HOOAEG_HALFWIDTH = 14;
const HOOAEG_MIN_YEARS = 2;
const HOOAEG_SITES_PER_SPECIES = 3;
const HOOAEG_SITES_FETCH = 9;
const HOOAEG_MIN_SEASONALITY = 1.5;
const HOOAEG_SITES_SINCE = "1990-01-01";
const RPC_CHUNK = 400;
const IN_CHUNK = 150;
const PAGE = 1000;
const PAGE_CAP = 100_000;
const EE_BOX = { latMin: 57.3, latMax: 60.0, lonMin: 21.3, lonMax: 28.3 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function tallinnDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, n: number): string {
  const t = Date.parse(date.slice(0, 10) + "T00:00:00Z") + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(a.slice(0, 10) + "T00:00:00Z") -
      Date.parse(b.slice(0, 10) + "T00:00:00Z")) / DAY_MS,
  );
}

export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isRarityLevel(v: unknown): v is RarityLevel {
  return typeof v === "string" && (RARITY_LEVELS as readonly string[]).includes(v);
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export function raritySet(meta: SpeciesMetaInput[]): RaritySpecies[] {
  const out: RaritySpecies[] = [];
  const seen = new Set<string>();
  for (const sp of meta) {
    if (!sp || !isRarityLevel(sp.rarityLevel) || sp.predictionExclude === true) {
      continue;
    }
    const name = sp.name || sp.estonianName;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({
      name_et: name,
      sci: sp.scientificName ?? "",
      ebird_code: sp.ebirdCode ?? null,
      level: sp.rarityLevel,
      avatar_url: sp.avatarUrl ?? null,
    });
  }
  return out;
}

export function groupJubaEestis(rows: JubaRow[], asOf: string): JubaGroup[] {
  const since = addDays(asOf, -JUBA_WINDOW_DAYS);
  const groups = new Map<string, JubaGroup & { countySet: Set<string> }>();
  for (const r of rows) {
    const d = r.date.slice(0, 10);
    if (d < since || d > asOf) continue;
    const g = groups.get(r.species_et);
    if (!g) {
      groups.set(r.species_et, {
        species_et: r.species_et,
        first_date: d,
        last_date: d,
        n_obs: 1,
        max_count: r.count ?? null,
        counties: [],
        countySet: new Set(r.county ? [r.county] : []),
      });
      continue;
    }
    g.n_obs += 1;
    if (d < g.first_date) g.first_date = d;
    if (d > g.last_date) g.last_date = d;
    if (r.count !== null && (g.max_count === null || r.count > g.max_count)) {
      g.max_count = r.count;
    }
    if (r.county) g.countySet.add(r.county);
  }
  return [...groups.values()]
    .map(({ countySet, ...g }) => ({ ...g, counties: [...countySet].sort() }))
    .sort((a, b) =>
      a.last_date === b.last_date
        ? a.species_et.localeCompare(b.species_et)
        : a.last_date < b.last_date ? 1 : -1
    );
}

export function dedupeEvents(rows: RareObsRow[]): SpeciesEvent[] {
  interface Acc {
    species_et: string;
    species_code: string;
    date: string;
    country_code: string;
    location: string;
    km: number;
    count: number | null;
    latSum: number;
    lonSum: number;
    n: number;
  }
  const byKey = new Map<string, Acc>();
  for (const r of rows) {
    if (
      !r.species_et_name || r.lat === null || r.lng === null ||
      r.distance_to_ee_km === null || !DATE_RE.test(r.obs_date)
    ) continue;
    const day = r.obs_date.slice(0, 10);
    const key = `${r.species_et_name}|${day}|${Math.round(r.lat * 4)}|${
      Math.round(r.lng * 2.5)
    }`;
    const a = byKey.get(key);
    if (!a) {
      byKey.set(key, {
        species_et: r.species_et_name,
        species_code: r.species_code,
        date: day,
        country_code: r.country_code ?? "",
        location: r.location ?? "",
        km: r.distance_to_ee_km,
        count: r.obs_count ?? null,
        latSum: r.lat,
        lonSum: r.lng,
        n: 1,
      });
      continue;
    }
    if (r.distance_to_ee_km < a.km) {
      a.km = r.distance_to_ee_km;
      a.location = r.location ?? "";
    }
    if (r.obs_count !== null && (a.count === null || r.obs_count > a.count)) {
      a.count = r.obs_count;
    }
    a.latSum += r.lat;
    a.lonSum += r.lng;
    a.n += 1;
  }
  return [...byKey.values()].map((a) => ({
    species_et: a.species_et,
    species_code: a.species_code,
    date: a.date,
    country_code: a.country_code,
    location: a.location,
    lat: a.latSum / a.n,
    lon: a.lonSum / a.n,
    km_to_turi: a.km,
    count: a.count,
  }));
}

/** Most recent first; same day -> nearest first. */
function byRecency(a: SightingEvent, b: SightingEvent): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.km_to_turi - b.km_to_turi;
}

export function nearEvent(
  events: SightingEvent[],
  asOf: string,
): SightingEvent | null {
  const since = addDays(asOf, -NEAR_MAX_AGE_DAYS);
  const hits = events
    .filter((e) => e.km_to_turi <= NEAR_KM && e.date >= since)
    .sort(byRecency);
  return hits[0] ?? null;
}

export function findTrack(
  events: SightingEvent[],
  asOf: string,
): SightingEvent[] | null {
  if (events.length === 0) return null;
  const c0 = [...events].sort(byRecency)[0];
  if (c0.date < addDays(asOf, -TRACK_MAX_AGE_DAYS)) return null;
  if (TRACK_EXCLUDED_CC.has(c0.country_code)) return null;
  if (c0.country_code === "SE" && c0.km_to_turi > SE_MAX_KM) return null;

  const chain: SightingEvent[] = [c0];
  let c = c0;
  for (;;) {
    const cur = c;
    const preds = events.filter((p) =>
      p.date < cur.date &&
      dayDiff(cur.date, p.date) <= TRACK_STEP_DAYS &&
      haversineKm(p, cur) <= TRACK_STEP_KM &&
      p.km_to_turi > cur.km_to_turi
    );
    if (preds.length === 0) break;
    preds.sort((a, b) =>
      a.km_to_turi !== b.km_to_turi
        ? b.km_to_turi - a.km_to_turi
        : a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
    c = preds[0];
    chain.push(c);
  }
  if (chain.length < 2) return null;
  chain.reverse(); // chronological
  const drop = chain[0].km_to_turi - chain[chain.length - 1].km_to_turi;
  return drop >= TRACK_MIN_DROP_KM ? chain : null;
}

function stripSpecies(e: SightingEvent): SightingEvent {
  return {
    date: e.date,
    country_code: e.country_code,
    location: e.location,
    lat: e.lat,
    lon: e.lon,
    km_to_turi: e.km_to_turi,
    count: e.count,
  };
}

export function pickLahenemas(
  events: SpeciesEvent[],
  asOf: string,
): LahenemasPick[] {
  const bySpecies = new Map<string, SpeciesEvent[]>();
  for (const e of events) {
    const list = bySpecies.get(e.species_et);
    if (list) list.push(e);
    else bySpecies.set(e.species_et, [e]);
  }
  const out: LahenemasPick[] = [];
  for (const [species_et, list] of bySpecies) {
    const code = list[0].species_code;
    const track = findTrack(list, asOf);
    if (track) {
      out.push({
        species_et,
        species_code: code,
        kind: "track",
        events: track.map(stripSpecies),
        latest_km: track[track.length - 1].km_to_turi,
      });
      continue;
    }
    const near = nearEvent(list, asOf);
    if (near) {
      out.push({
        species_et,
        species_code: code,
        kind: "near",
        events: [stripSpecies(near)],
        latest_km: near.km_to_turi,
      });
    }
  }
  return out.sort((a, b) =>
    a.latest_km !== b.latest_km
      ? a.latest_km - b.latest_km
      : a.species_et.localeCompare(b.species_et)
  );
}

export function sortHooaeg<
  T extends {
    species_et: string;
    years_in_window_since_1990: number;
    years_in_window_last10: number;
  },
>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    b.years_in_window_since_1990 - a.years_in_window_since_1990 ||
    b.years_in_window_last10 - a.years_in_window_last10 ||
    a.species_et.localeCompare(b.species_et)
  );
}

export function seasonMonthsAround(asOf: string): number[] {
  const m = Number(asOf.slice(5, 7));
  const wrap = (x: number) => ((x - 1 + 12) % 12) + 1;
  return [wrap(m - 1), m, wrap(m + 1)];
}

/** Calendar months (1-12) touched by [asOf - halfwidth, asOf + halfwidth]. */
function windowMonths(asOf: string, halfwidthDays: number): number[] {
  const mid = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  const start = new Date(mid - halfwidthDays * DAY_MS);
  const end = new Date(mid + halfwidthDays * DAY_MS);
  const out: number[] = [];
  const cur = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (cur.getTime() <= last && out.length < 12) {
    const m = cur.getUTCMonth() + 1;
    if (!out.includes(m)) out.push(m);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/**
 * True when the busiest month in the window has at least minRatio times the
 * yearly mean of years_by_month (i.e. the window is a real season peak).
 */
export function isSeasonal(
  yearsByMonth: number[],
  asOf: string,
  halfwidthDays: number,
  minRatio: number,
): boolean {
  if (yearsByMonth.length !== 12) return false;
  const mean = yearsByMonth.reduce((a, b) => a + b, 0) / 12;
  if (!(mean > 0)) return false;
  const months = windowMonths(asOf, halfwidthDays);
  if (months.length === 0) return false;
  const peak = Math.max(...months.map((m) => yearsByMonth[m - 1] ?? 0));
  return peak >= minRatio * mean;
}

function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

/**
 * Site cells -> Hooaeg sites: drops cells without coordinates, outside
 * Estonia, with no in-season days, "vt. kaardilt" labels, or with neither a
 * label nor a county. No sort / slice.
 */
export function cleanSites(rows: SiteCellRow[]): HooaegItem["sites"] {
  const out: HooaegItem["sites"] = [];
  for (const c of rows) {
    if (c.lat === null || c.lon === null) continue;
    if (
      c.lat < EE_BOX.latMin || c.lat > EE_BOX.latMax ||
      c.lon < EE_BOX.lonMin || c.lon > EE_BOX.lonMax
    ) continue;
    if ((c.n_season ?? 0) < 1) continue;
    if (c.label && /kaardilt/i.test(c.label)) continue;
    if (isBlank(c.label) && isBlank(c.county)) continue;
    out.push({
      lat: c.lat,
      lon: c.lon,
      label: c.label ?? null,
      county: c.county ?? null,
      n_days: c.n_season ?? 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

type PageResult = PromiseLike<
  { data: unknown[] | null; error: { message: string } | null }
>;

async function readPaged<T>(
  build: (from: number, to: number) => PageResult,
  page = PAGE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < PAGE_CAP; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

async function rpcRows<T>(
  sb: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (Array.isArray(data) ? data : []) as T[];
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface ElurikkusRow {
  species_name: string;
  observed_at: string;
  county: string | null;
  individual_count: number | null;
}

interface VaatlusteRow {
  estonia_entries: unknown;
}

interface StayRow {
  species_et: string;
  n_birds: number;
  median_days: number;
  pct_over_3d: number;
}

interface HkSpeciesRow {
  taxon_sci: string;
  et_name: string | null;
}

interface HkRecordRow {
  taxon_sci: string;
  date_from: string | null;
}

interface SeasonPriorRow {
  species_et: string;
  years_in_window_since_1990: number;
  years_in_window_last10: number;
  last_year_in_window: number | null;
  years_by_month: number[] | null;
}

export interface SiteCellRow {
  species_name: string;
  lat: number | null;
  lon: number | null;
  n_season: number | null;
  label: string | null;
  county: string | null;
}

async function loadJubaRows(
  sb: SupabaseClient,
  names: string[],
  since: string,
): Promise<JubaRow[]> {
  const nameSet = new Set(names);
  const rows: JubaRow[] = [];
  for (const part of chunk(names, IN_CHUNK)) {
    const el = await readPaged<ElurikkusRow>((f, t) =>
      sb.from("elurikkus_observations")
        .select("species_name, observed_at, county, individual_count")
        .in("species_name", part)
        .gte("observed_at", since)
        .range(f, t)
    );
    for (const r of el) {
      rows.push({
        species_et: r.species_name,
        date: String(r.observed_at).slice(0, 10),
        county: r.county ?? null,
        count: typeof r.individual_count === "number" ? r.individual_count : null,
      });
    }
  }
  const vr = await readPaged<VaatlusteRow>((f, t) =>
    sb.from("vaatluste_raport")
      .select("estonia_entries")
      .gte("generated_at", since)
      .range(f, t)
  );
  for (const r of vr) {
    if (!Array.isArray(r.estonia_entries)) continue;
    for (const e of r.estonia_entries as Record<string, unknown>[]) {
      if (!e || typeof e !== "object") continue;
      const sp = e.species_et;
      const date = e.date;
      if (typeof sp !== "string" || !nameSet.has(sp)) continue;
      if (typeof date !== "string" || !DATE_RE.test(date)) continue;
      rows.push({
        species_et: sp,
        date: date.slice(0, 10),
        county: null,
        count: typeof e.count === "number" ? e.count : null,
      });
    }
  }
  return rows;
}

async function loadStay(
  sb: SupabaseClient,
  names: string[],
): Promise<Map<string, StayRow>> {
  const out = new Map<string, StayRow>();
  for (const part of chunk(names, RPC_CHUNK)) {
    const rows = await rpcRows<StayRow>(sb, "rarity_stay_days", {
      p_species: part,
    });
    for (const r of rows) out.set(r.species_et, r);
  }
  return out;
}

async function loadHk(
  sb: SupabaseClient,
  names: string[],
): Promise<Map<string, { accepted_records: number; months: number[] }>> {
  const taxonToName = new Map<string, string>();
  for (const part of chunk(names, IN_CHUNK)) {
    const sp = await readPaged<HkSpeciesRow>((f, t) =>
      sb.from("hk_species").select("taxon_sci, et_name")
        .in("et_name", part).range(f, t)
    );
    for (const r of sp) if (r.et_name) taxonToName.set(r.taxon_sci, r.et_name);
  }
  const acc = new Map<string, { n: number; months: Set<number> }>();
  for (const part of chunk([...taxonToName.keys()], IN_CHUNK)) {
    const recs = await readPaged<HkRecordRow>((f, t) =>
      sb.from("hk_records").select("taxon_sci, date_from")
        .eq("status", "accepted").in("taxon_sci", part).range(f, t)
    );
    for (const r of recs) {
      const name = taxonToName.get(r.taxon_sci);
      if (!name) continue;
      const a = acc.get(name) ?? { n: 0, months: new Set<number>() };
      a.n += 1;
      if (r.date_from && DATE_RE.test(r.date_from)) {
        a.months.add(Number(r.date_from.slice(5, 7)));
      }
      acc.set(name, a);
    }
  }
  const out = new Map<string, { accepted_records: number; months: number[] }>();
  for (const [name, a] of acc) {
    if (a.n === 0) continue;
    out.set(name, {
      accepted_records: a.n,
      months: [...a.months].sort((x, y) => x - y),
    });
  }
  return out;
}

async function buildJuba(
  sb: SupabaseClient,
  bySpecies: Map<string, RaritySpecies>,
  names: string[],
  asOf: string,
): Promise<JubaEestisItem[]> {
  const rows = await loadJubaRows(sb, names, addDays(asOf, -JUBA_WINDOW_DAYS));
  const groups = groupJubaEestis(rows, asOf);
  if (groups.length === 0) return [];
  const groupNames = groups.map((g) => g.species_et);
  const [stay, hk] = await Promise.all([
    loadStay(sb, groupNames),
    loadHk(sb, groupNames),
  ]);
  const out: JubaEestisItem[] = [];
  for (const g of groups) {
    const meta = bySpecies.get(g.species_et);
    if (!meta) continue;
    const s = stay.get(g.species_et);
    out.push({
      species_et: g.species_et,
      species_lat: meta.sci,
      ebird_code: meta.ebird_code,
      rarity_level: meta.level,
      avatar_url: meta.avatar_url,
      first_date: g.first_date,
      last_date: g.last_date,
      n_obs: g.n_obs,
      max_count: g.max_count,
      counties: g.counties,
      stay: s && s.n_birds >= 2
        ? {
          n_birds: s.n_birds,
          median_days: s.median_days,
          pct_over_3d: s.pct_over_3d,
        }
        : null,
      hk: hk.get(g.species_et) ?? null,
    });
  }
  return out;
}

async function buildHooaeg(
  sb: SupabaseClient,
  bySpecies: Map<string, RaritySpecies>,
  names: string[],
  exclude: Set<string>,
  asOf: string,
): Promise<HooaegItem[]> {
  const prior: SeasonPriorRow[] = [];
  for (const part of chunk(names, RPC_CHUNK)) {
    prior.push(
      ...await rpcRows<SeasonPriorRow>(sb, "rarity_season_prior", {
        p_species: part,
        p_date: asOf,
        p_halfwidth: HOOAEG_HALFWIDTH,
      }),
    );
  }
  const kept = prior.filter((r) =>
    r.years_in_window_since_1990 >= HOOAEG_MIN_YEARS &&
    Array.isArray(r.years_by_month) &&
    isSeasonal(
      r.years_by_month,
      asOf,
      HOOAEG_HALFWIDTH,
      HOOAEG_MIN_SEASONALITY,
    ) &&
    !exclude.has(r.species_et) && bySpecies.has(r.species_et)
  );
  if (kept.length === 0) return [];

  const cells = new Map<string, HooaegItem["sites"]>();
  const months = seasonMonthsAround(asOf);
  for (const part of chunk(kept.map((r) => r.species_et), RPC_CHUNK)) {
    const rows = await rpcRows<SiteCellRow>(
      sb,
      "ennustus_predicted_site_cells",
      {
        p_species: part,
        p_months: months,
        p_since: HOOAEG_SITES_SINCE,
        p_per_species: HOOAEG_SITES_FETCH,
      },
    );
    const bySp = new Map<string, SiteCellRow[]>();
    for (const c of rows) {
      const list = bySp.get(c.species_name) ?? [];
      list.push(c);
      bySp.set(c.species_name, list);
    }
    for (const [sp, list] of bySp) {
      cells.set(sp, [...(cells.get(sp) ?? []), ...cleanSites(list)]);
    }
  }

  const items: HooaegItem[] = [];
  for (const r of kept) {
    const meta = bySpecies.get(r.species_et) as RaritySpecies;
    const sites = (cells.get(r.species_et) ?? [])
      .sort((a, b) => b.n_days - a.n_days)
      .slice(0, HOOAEG_SITES_PER_SPECIES);
    items.push({
      species_et: r.species_et,
      species_lat: meta.sci,
      ebird_code: meta.ebird_code,
      rarity_level: meta.level,
      avatar_url: meta.avatar_url,
      years_in_window_since_1990: r.years_in_window_since_1990,
      years_in_window_last10: r.years_in_window_last10,
      last_year_in_window: r.last_year_in_window ?? null,
      years_by_month: Array.isArray(r.years_by_month) ? r.years_by_month : [],
      sites,
    });
  }
  return sortHooaeg(items);
}

async function buildLahenemas(
  sb: SupabaseClient,
  names: string[],
  asOf: string,
  now: Date,
): Promise<LahenemasPick[]> {
  const since = addDays(asOf, -LAHENEMAS_WINDOW_DAYS);
  const rows: RareObsRow[] = [];
  for (const part of chunk(names, IN_CHUNK)) {
    rows.push(
      ...await readPaged<RareObsRow>((f, t) =>
        sb.from("ebird_rare_observations")
          .select(
            "species_et_name, species_code, obs_date, lat, lng, distance_to_ee_km, obs_count, country_code, location",
          )
          .in("species_et_name", part)
          .gte("obs_date", since)
          .lte("first_seen_at", now.toISOString())
          .range(f, t)
      ),
    );
  }
  return pickLahenemas(dedupeEvents(rows), asOf);
}

export async function buildEvidenceLists(
  sb: SupabaseClient,
  meta: SpeciesMetaInput[],
  now: Date,
): Promise<EvidenceLists> {
  const t0 = Date.now();
  const asOf = tallinnDate(now);
  const errors: string[] = [];
  let R: RaritySpecies[] = [];
  try {
    R = raritySet(Array.isArray(meta) ? meta : []);
  } catch (e) {
    errors.push(`rarity_set: ${errText(e)}`);
  }
  const bySpecies = new Map(R.map((r) => [r.name_et, r]));
  const names = R.map((r) => r.name_et);

  let juba: JubaEestisItem[] = [];
  try {
    juba = await buildJuba(sb, bySpecies, names, asOf);
  } catch (e) {
    errors.push(`juba_eestis: ${errText(e)}`);
    juba = [];
  }
  const jubaNames = new Set(juba.map((j) => j.species_et));
  const restNames = names.filter((n) => !jubaNames.has(n));

  const [hooaegRes, lahenemasRes] = await Promise.all([
    buildHooaeg(sb, bySpecies, names, jubaNames, asOf).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, e }),
    ),
    buildLahenemas(sb, restNames, asOf, now).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, e }),
    ),
  ]);

  let hooaeg: HooaegItem[] = [];
  if (hooaegRes.ok) hooaeg = hooaegRes.v;
  else errors.push(`hooaeg: ${errText(hooaegRes.e)}`);

  let lahenemas: LahenemasItem[] = [];
  if (lahenemasRes.ok) {
    try {
      const years = new Map(
        hooaeg.map((h) => [h.species_et, h.years_in_window_since_1990]),
      );
      lahenemas = lahenemasRes.v.flatMap((p) => {
        const m = bySpecies.get(p.species_et);
        if (!m) return [];
        return [{
          species_et: p.species_et,
          species_lat: m.sci,
          ebird_code: m.ebird_code ?? p.species_code,
          rarity_level: m.level,
          avatar_url: m.avatar_url,
          kind: p.kind,
          events: p.events,
          latest_km: p.latest_km,
          hooaeg_years: years.get(p.species_et) ?? null,
        }];
      });
    } catch (e) {
      errors.push(`lahenemas: ${errText(e)}`);
      lahenemas = [];
    }
  } else {
    errors.push(`lahenemas: ${errText(lahenemasRes.e)}`);
  }

  return {
    version: "v5-evidence",
    as_of: asOf,
    juba_eestis: juba,
    lahenemas,
    hooaeg,
    diag: {
      rarity_species: R.length,
      errors,
      elapsed_ms: Date.now() - t0,
    },
  };
}
