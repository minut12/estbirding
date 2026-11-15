// P184d2: frontend copy of the toenaosus_raport.evidence_lists contract
// (source of truth: supabase/functions/toenaosus-orchestrator/lists.ts -- do not
// import from supabase/). Runtime guard + pure text helpers for the three lists
// Juba Eestis / Lahenemas / Hooaeg. All Estonian text lives in
// evidenceListsText.et.json (this file must stay ASCII).

import TEXT_JSON from './evidenceListsText.et.json';

export const TEXT = TEXT_JSON;

// Typographic punctuation, built from char codes so this file stays ASCII.
export const NDASH = String.fromCharCode(0x2013);
export const MIDDOT = String.fromCharCode(0x00b7);
export const ARROW = String.fromCharCode(0x2192);

// ---------------------------------------------------------------------------
// Contract (copied from lists.ts)
// ---------------------------------------------------------------------------

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
// Runtime guard
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strOrNull = (v: unknown): string | null => (isStr(v) && v ? v : null);
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
const isRarity = (v: unknown): v is RarityLevel => v === 'rare' || v === 'super' || v === 'mega';

function compact<T>(raw: unknown, parse: (r: Rec) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    if (!isRec(r)) return [];
    const out = parse(r);
    return out === null ? [] : [out];
  });
}

function parseStay(v: unknown): JubaEestisItem['stay'] {
  if (!isRec(v) || !isNum(v.n_birds) || !isNum(v.median_days) || !isNum(v.pct_over_3d)) return null;
  return { n_birds: v.n_birds, median_days: v.median_days, pct_over_3d: v.pct_over_3d };
}

function parseHk(v: unknown): JubaEestisItem['hk'] {
  if (!isRec(v) || !isNum(v.accepted_records)) return null;
  const months = Array.isArray(v.months) ? v.months.filter(isNum) : [];
  return { accepted_records: v.accepted_records, months };
}

function parseJuba(r: Rec): JubaEestisItem | null {
  if (!isStr(r.species_et) || !isStr(r.species_lat) || !isRarity(r.rarity_level)) return null;
  if (!isStr(r.first_date) || !isStr(r.last_date) || !isNum(r.n_obs)) return null;
  return {
    species_et: r.species_et,
    species_lat: r.species_lat,
    ebird_code: strOrNull(r.ebird_code),
    rarity_level: r.rarity_level,
    avatar_url: strOrNull(r.avatar_url),
    first_date: r.first_date,
    last_date: r.last_date,
    n_obs: r.n_obs,
    max_count: numOrNull(r.max_count),
    counties: Array.isArray(r.counties) ? r.counties.filter(isStr) : [],
    stay: parseStay(r.stay),
    hk: parseHk(r.hk),
  };
}

function parseEvent(r: Rec): SightingEvent | null {
  if (!isStr(r.date) || !isStr(r.location) || !isNum(r.km_to_turi)) return null;
  if (!isNum(r.lat) || !isNum(r.lon)) return null;
  return {
    date: r.date,
    country_code: isStr(r.country_code) ? r.country_code : '',
    location: r.location,
    lat: r.lat,
    lon: r.lon,
    km_to_turi: r.km_to_turi,
    count: numOrNull(r.count),
  };
}

function parseLahenemas(r: Rec): LahenemasItem | null {
  if (!isStr(r.species_et) || !isStr(r.species_lat) || !isRarity(r.rarity_level)) return null;
  if (!isStr(r.ebird_code) || !r.ebird_code || !isNum(r.latest_km)) return null;
  if (r.kind !== 'near' && r.kind !== 'track') return null;
  const events = compact(r.events, parseEvent);
  if (events.length === 0) return null;
  return {
    species_et: r.species_et,
    species_lat: r.species_lat,
    ebird_code: r.ebird_code,
    rarity_level: r.rarity_level,
    avatar_url: strOrNull(r.avatar_url),
    kind: r.kind,
    events,
    latest_km: r.latest_km,
    hooaeg_years: numOrNull(r.hooaeg_years),
  };
}

function parseSite(r: Rec): HooaegItem['sites'][number] | null {
  if (!isNum(r.lat) || !isNum(r.lon)) return null;
  return {
    lat: r.lat,
    lon: r.lon,
    label: strOrNull(r.label),
    county: strOrNull(r.county),
    n_days: isNum(r.n_days) ? r.n_days : 0,
  };
}

function parseHooaeg(r: Rec): HooaegItem | null {
  if (!isStr(r.species_et) || !isStr(r.species_lat) || !isRarity(r.rarity_level)) return null;
  if (!isNum(r.years_in_window_since_1990) || !isNum(r.years_in_window_last10)) return null;
  const rawMonths = Array.isArray(r.years_by_month) ? r.years_by_month : [];
  const years_by_month = Array.from({ length: 12 }, (_, i) => (isNum(rawMonths[i]) ? rawMonths[i] : 0));
  return {
    species_et: r.species_et,
    species_lat: r.species_lat,
    ebird_code: strOrNull(r.ebird_code),
    rarity_level: r.rarity_level,
    avatar_url: strOrNull(r.avatar_url),
    years_in_window_since_1990: r.years_in_window_since_1990,
    years_in_window_last10: r.years_in_window_last10,
    last_year_in_window: numOrNull(r.last_year_in_window),
    years_by_month,
    sites: compact(r.sites, parseSite),
  };
}

/** Null unless version is v5-evidence and the three lists are arrays. Malformed items are dropped. */
export function parseEvidenceLists(raw: unknown): EvidenceLists | null {
  if (!isRec(raw) || raw.version !== 'v5-evidence') return null;
  if (!Array.isArray(raw.juba_eestis) || !Array.isArray(raw.lahenemas) || !Array.isArray(raw.hooaeg)) return null;
  const diag = isRec(raw.diag) ? raw.diag : {};
  return {
    version: 'v5-evidence',
    as_of: isStr(raw.as_of) ? raw.as_of : '',
    juba_eestis: compact(raw.juba_eestis, parseJuba),
    lahenemas: compact(raw.lahenemas, parseLahenemas),
    hooaeg: compact(raw.hooaeg, parseHooaeg),
    diag: {
      rarity_species: isNum(diag.rarity_species) ? diag.rarity_species : 0,
      errors: Array.isArray(diag.errors) ? diag.errors.filter(isStr) : [],
      elapsed_ms: isNum(diag.elapsed_ms) ? diag.elapsed_ms : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** "7. nov" from YYYY-MM-DD; the raw string when it does not parse. */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = TEXT.months_short[Number(m[2]) - 1];
  return month ? `${Number(m[3])}. ${month}` : iso;
}

/** "7.-9. nov" (en dash), "9. nov" when equal, "28. okt-2. nov" across months. */
export function formatDateRange(first: string, last: string): string {
  if (first === last) return formatDay(first);
  const a = /^\d{4}-(\d{2})-(\d{2})/.exec(first);
  const b = /^\d{4}-(\d{2})-(\d{2})/.exec(last);
  if (a && b && a[1] === b[1]) return `${Number(a[2])}.${NDASH}${formatDay(last)}`;
  return `${formatDay(first)}${NDASH}${formatDay(last)}`;
}

/** "a", "a ja b", "a, b ja c". */
export function joinCounties(counties: readonly string[]): string {
  if (counties.length <= 1) return counties[0] ?? '';
  return `${counties.slice(0, -1).join(', ')} ${TEXT.and} ${counties[counties.length - 1]}`;
}

export function staySentence(stay: JubaEestisItem['stay']): string {
  // The orchestrator already sends null below 2 birds; guard here too.
  if (!stay || stay.n_birds < 2) return TEXT.stay_none;
  const k = Math.round((stay.n_birds * stay.pct_over_3d) / 100);
  if (stay.median_days === 1) return fill(TEXT.stay_one, { n: stay.n_birds, k });
  return fill(TEXT.stay_many, { d: stay.median_days, n: stay.n_birds, k });
}

export function hkSentence(hk: JubaEestisItem['hk']): string | null {
  if (!hk) return null;
  return fill(TEXT.hk, { n: hk.accepted_records });
}

export function jubaLine(item: Pick<JubaEestisItem, 'n_obs' | 'first_date' | 'last_date' | 'counties'>): string {
  const obs = `${item.n_obs} ${item.n_obs === 1 ? TEXT.obs_one : TEXT.obs_many}`;
  const parts = [obs, formatDateRange(item.first_date, item.last_date)];
  const counties = joinCounties(item.counties);
  if (counties) parts.push(counties);
  return parts.join(` ${MIDDOT} `);
}

const LOCATION_MAX = 28;

/** Text before the first comma, trimmed to 28 characters. */
export function shortLocation(location: string): string {
  return location.split(',')[0].trim().slice(0, LOCATION_MAX).trim();
}

/** "{loc1} {d1} -> {locN} {dN}"; for one event "{loc} . {date}". */
export function trackLine(events: readonly SightingEvent[]): string {
  if (events.length === 0) return '';
  const first = events[0];
  if (events.length === 1) return `${shortLocation(first.location)} ${MIDDOT} ${formatDay(first.date)}`;
  const last = events[events.length - 1];
  return `${shortLocation(first.location)} ${formatDay(first.date)} ${ARROW} ${shortLocation(last.location)} ${formatDay(last.date)}`;
}

export function moveLine(events: readonly SightingEvent[]): string {
  if (events.length === 0) return '';
  const first = Math.round(events[0].km_to_turi);
  if (events.length === 1) return fill(TEXT.distance, { km: first });
  return fill(TEXT.move, { a: first, b: Math.round(events[events.length - 1].km_to_turi) });
}

/** "{n} isend/isendit" for the last event, or null when it has no count. */
export function countLine(events: readonly SightingEvent[]): string | null {
  const c = events.length ? events[events.length - 1].count : null;
  if (c === null) return null;
  return `${c} ${c === 1 ? TEXT.ind_one : TEXT.ind_many}`;
}

export function hooSeenLine(item: Pick<HooaegItem, 'years_in_window_since_1990'>): string {
  return fill(TEXT.hoo_seen, { n: item.years_in_window_since_1990 });
}

/** Only the part before the middot when last_year_in_window is null. */
export function hooLast10Line(item: Pick<HooaegItem, 'years_in_window_last10' | 'last_year_in_window'>): string {
  if (item.last_year_in_window === null) {
    const head = TEXT.hoo_last10.split(` ${MIDDOT} `)[0];
    return fill(head, { n: item.years_in_window_last10 });
  }
  return fill(TEXT.hoo_last10, { n: item.years_in_window_last10, year: item.last_year_in_window });
}

export interface MonthBar {
  heightPx: number;
  current: boolean;
  label: string;
}

const BAR_MIN_PX = 2;
const BAR_MAX_PX = 30;

/** 12 bars, 2-30 px scaled to the max. currentMonth is 1-12. */
export function monthBars(yearsByMonth: readonly number[], currentMonth: number): MonthBar[] {
  const values = Array.from({ length: 12 }, (_, i) => (isNum(yearsByMonth[i]) ? Math.max(0, yearsByMonth[i]) : 0));
  const max = Math.max(...values);
  return values.map((v, i) => ({
    heightPx: max > 0 ? Math.max(BAR_MIN_PX, Math.round((v / max) * BAR_MAX_PX)) : BAR_MIN_PX,
    current: i + 1 === currentMonth,
    label: TEXT.months_initial[i],
  }));
}

export function monthChartLabel(yearsByMonth: readonly number[]): string {
  const parts = TEXT.months_short.map((m, i) => `${m} ${isNum(yearsByMonth[i]) ? yearsByMonth[i] : 0}`);
  return `${TEXT.hoo_chart}: ${parts.join(', ')}`;
}

/** Current month (1-12) in Europe/Tallinn. */
export function currentTallinnMonth(now: Date = new Date()): number {
  const m = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', month: 'numeric' }).format(now));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1;
}

// ---------------------------------------------------------------------------
// P6 jump targets
// ---------------------------------------------------------------------------

export type EvidenceSegment = 'juba' | 'lah' | 'hoo';

export const HOOAEG_TOP_N = 8;

export interface JumpTarget {
  segment: EvidenceSegment;
  index: number;
}

/**
 * First occurrence of each ebird_code in the order Juba Eestis -> Lahenemas -> Hooaeg.
 * Only that card carries id="toenaosus-{code}", so DOM ids stay unique.
 */
export function firstOccurrences(lists: EvidenceLists): Map<string, JumpTarget> {
  const out = new Map<string, JumpTarget>();
  const add = (segment: EvidenceSegment, items: readonly { ebird_code: string | null }[]) => {
    items.forEach((it, index) => {
      if (it.ebird_code && !out.has(it.ebird_code)) out.set(it.ebird_code, { segment, index });
    });
  };
  add('juba', lists.juba_eestis);
  add('lah', lists.lahenemas);
  add('hoo', lists.hooaeg);
  return out;
}
