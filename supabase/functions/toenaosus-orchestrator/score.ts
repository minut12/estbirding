// toenaosus-orchestrator / score.ts
// Tõenäosus score v4 — pure functions only. No env, no network, no Deno.serve,
// so a test or the Deno backtest can import this without starting a server.
//
// v4 = v3's count/distance/season terms, plus three phenology-derived terms
// (direction, source region, upstream follow-through), the whole thing gated
// multiplicatively by a phenology gate and squashed through a Platt sigmoid.

export type Season = "spring" | "autumn";
export type ArrivalMode =
  | "spring_overshoot"
  | "autumn_drift"
  | "post_breeding_dispersal"
  | "winter_irruption";

export interface PhenologyRow {
  scientific_name: string;
  ebird_code: string | null;
  arrival_modes: ArrivalMode[];
  spring_window: string | null; // daterange text, e.g. "[2000-04-15,2000-07-01)"
  autumn_window: string | null;
  arrival_bearing_spring: number | null; // bearing the bird arrives FROM
  arrival_bearing_autumn: number | null;
  source_regions_spring: string[] | null;
  source_regions_autumn: string[] | null;
  flight_class: string | null; // P6b: steers the predicted-site anchor fallback
  // P6d watch arc: WHERE the bird is SEEN, traversed clockwise from `from` to
  // `to`, wrapping through 0. Deliberately distinct from arrival_bearing_*,
  // which means where it comes FROM and which P4.1's source-direction gate
  // reads -- for a coastal passage the two diverge. Optional because nothing on
  // the scoring path reads them and existing callers construct this type
  // without them; null/absent means no arc is curated, and sites.ts then
  // behaves exactly as it did before P6d.
  watch_arc_spring_from?: number | null;
  watch_arc_spring_to?: number | null;
  watch_arc_autumn_from?: number | null;
  watch_arc_autumn_to?: number | null;
  // P8b/P8c source arc: the arc of bearings FROM Türi that an upstream
  // observation must fall in to be this species' track/ETA source. A third,
  // independent meaning again -- watch_arc_* is where the bird is SEEN,
  // arrival_bearing_* is the single direction P4.1b's multiplier measures
  // against, and a source arc is a curated corridor that can be far wider than
  // +-SOURCE_DIR_OK_DEG around that bearing. Optional because these columns
  // arrive with the P8c migration: absent/null must behave exactly as the code
  // did before P8b.
  source_arc_spring_from?: number | null;
  source_arc_spring_to?: number | null;
  source_arc_autumn_from?: number | null;
  source_arc_autumn_to?: number | null;
  autumn_eligible?: boolean | null;
  spring_eligible?: boolean | null;
}

export interface UpstreamRow {
  species_lat: string;
  from_country: string;
  foreign_days: number;
  p_ee_30d: number;
}

export interface Wind {
  from_deg: number | null; // direction the wind blows FROM
  speed_kmh: number | null;
}

export interface V4Inputs {
  tier_base: number;
  count: number;
  distance: number;
  season_signal: number;
  today: Date;
  species_lat: string; // decoupled from phen: a species with no phenology row
  phen: PhenologyRow | null; // still gets its upstream signal
  wind: Wind;
  regions: string[]; // every country_code in neighbor_breakdown, not just the nearest
  upstream: UpstreamRow[];
}

export interface V4Factors {
  season: Season | null;
  phenology_gate: number;
  phenology_source: "row" | "missing";
  direction_fit: number;
  source_fit: number;
  upstream: number;
  raw: number;
  calibrated_score: number;
  pct: number;
}

// Widened so the Phase D grid search can sweep DIR_W/SRC_W/UP_W and refit
// CAL_A/CAL_B; `typeof V4` (readonly literals) is assignable to it.
export interface V4Weights {
  COUNT_W: number;
  DIST_W: number;
  SEASON_W: number;
  DIR_W: number;
  SRC_W: number;
  UP_W: number;
  CAL_A: number;
  CAL_B: number;
  MIN_TRANSPORT_KMH: number;
  FLOOR: number;
  CEIL: number;
  FORMULA_VERSION: string;
}

// fit 2026-09-05, Newton–Raphson Platt on calibrated_score; train May 1–Jul 31
// (5057 rows), test Aug 1–19 (478, fully resolved): Brier v4 0.1002 vs v3 0.2006
// vs const-11.5% 0.1018; UP_W at elbow (100 = 0.0999). DIR_W/SRC_W earned 0 on
// this data — factors kept for watch-list/UI.
export const V4 = {
  COUNT_W: 25,
  DIST_W: 25,
  SEASON_W: 25,
  DIR_W: 0,
  SRC_W: 0,
  UP_W: 60,
  CAL_A: 0.02055,
  CAL_B: -2.0367,
  MIN_TRANSPORT_KMH: 25,
  FLOOR: 5,
  CEIL: 95,
  FORMULA_VERSION: "v4",
} as const;

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

// Postgres daterange text anchored to year 2000, half-open. An upper bound in
// year 2001 means "through Dec 31", encoded as the sentinel "12-32" so plain
// string compare stays correct.
export function parseDateRange(
  r: string | null,
): { lo: string; hi: string } | null {
  if (!r) return null;
  const m = /^[\[(](\d{4})-(\d{2})-(\d{2}),(\d{4})-(\d{2})-(\d{2})[\])]$/
    .exec(r.trim());
  if (!m) return null;
  return {
    lo: `${m[2]}-${m[3]}`,
    hi: m[4] === "2001" ? "12-32" : `${m[5]}-${m[6]}`,
  };
}

const monthDay = (d: Date): string =>
  `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${
    String(d.getUTCDate()).padStart(2, "0")
  }`;

function inWindow(md: string, r: { lo: string; hi: string } | null): boolean {
  if (!r) return false;
  if (r.hi === "12-32") return md >= r.lo; // runs to year end
  if (r.lo <= r.hi) return md >= r.lo && md < r.hi; // half-open
  return md >= r.lo || md < r.hi; // wraps the new year
}

export function seasonFor(today: Date, phen: PhenologyRow | null): Season | null {
  if (!phen) return null;
  const md = monthDay(today);
  if (inWindow(md, parseDateRange(phen.spring_window))) return "spring";
  if (inWindow(md, parseDateRange(phen.autumn_window))) return "autumn";
  return null;
}

// ---------------------------------------------------------------------------
// P8b source arc
// ---------------------------------------------------------------------------

// Angular half-width of the fallback source arc, and the delta at or below
// which P4.1b applies no direction penalty. Deliberately ONE constant: the
// fallback arc is defined as "the band that would not have been penalised".
// index.ts imports this rather than keeping its own copy, so the two cannot
// drift apart.
export const SOURCE_DIR_OK_DEG = 60;

/**
 * Is `b` inside the arc swept clockwise from `from` to `to`? Both bounds are
 * inclusive and the arc may wrap through 0 (300 -> 20 means 300..360 U 0..20).
 *
 * Same wrap maths as sites.ts's `inWatchArc`, deliberately not shared: that one
 * answers a different question (where the bird is SEEN) and treats a null bound
 * as "no arc, filter nothing". Here the null case never reaches this function
 * -- `sourceArcFor` returns null and the caller skips the test entirely.
 */
export function bearingInArc(b: number, from: number, to: number): boolean {
  const norm = (d: number) => ((d % 360) + 360) % 360;
  const x = norm(b);
  const f = norm(from);
  const t = norm(to);
  return f <= t ? (x >= f && x <= t) : (x >= f || x <= t);
}

/**
 * The season's curated source arc, else `arrival_bearing +- SOURCE_DIR_OK_DEG`,
 * else null.
 *
 * Null means NO ARC IS CURATED AND NO BEARING IS KNOWN, and the caller must
 * then treat every observation as in-arc -- an uncurated species keeps exactly
 * its pre-P8b freshest-anywhere source. The returned bounds are intentionally
 * left un-normalised (the fallback can be negative or > 360); `bearingInArc`
 * normalises both ends.
 */
export function sourceArcFor(
  phen: PhenologyRow | null,
  season: string | null,
): { from: number; to: number } | null {
  if (!phen) return null;
  const from = season === "spring"
    ? phen.source_arc_spring_from
    : season === "autumn"
    ? phen.source_arc_autumn_from
    : null;
  const to = season === "spring"
    ? phen.source_arc_spring_to
    : season === "autumn"
    ? phen.source_arc_autumn_to
    : null;
  if (typeof from === "number" && typeof to === "number") return { from, to };
  const bearing = season === "spring"
    ? phen.arrival_bearing_spring
    : season === "autumn"
    ? phen.arrival_bearing_autumn
    : null;
  if (typeof bearing === "number") {
    return {
      from: bearing - SOURCE_DIR_OK_DEG,
      to: bearing + SOURCE_DIR_OK_DEG,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// P23 source regions
// ---------------------------------------------------------------------------

export type SourceRegionsVerdict = "filtered" | "unfetched" | "missing";

/**
 * The RUN season's curated source_regions list, or null.
 *
 * Keyed on the run season (config.season), never on seasonFor(): that is null
 * outside the species' own window, and an out-of-window species is exactly one
 * whose foreign records should not be counted from the wrong direction.
 */
export function sourceRegionsFor(
  phen: PhenologyRow | null,
  season: "spring_summer" | "fall_winter",
): string[] | null {
  if (!phen) return null;
  return season === "fall_winter"
    ? phen.source_regions_autumn
    : phen.source_regions_spring;
}

/**
 * Keep only observations whose `_region` is on the species' list.
 *
 * `_region` is the region code the orchestrator queried (PL, RU-LEN), not
 * eBird's subnational1Code (PL-KP), so it compares directly with the list.
 *
 * Two cases leave the pool untouched: no list at all ("missing"), and a list
 * that shares no region with what this run fetched ("unfetched") -- filtering
 * there would empty every pool for a reason that is about the fetch, not the
 * bird. A "filtered" result may be empty; dropping the species is the caller's.
 */
export function applySourceRegions<T extends { _region?: string }>(
  obs: T[],
  listed: string[] | null,
  fetched: string[],
): { obs: T[]; verdict: SourceRegionsVerdict } {
  if (!listed || listed.length === 0) return { obs, verdict: "missing" };
  if (!listed.some((r) => fetched.includes(r))) {
    return { obs, verdict: "unfetched" };
  }
  return {
    obs: obs.filter((o) =>
      typeof o._region === "string" && listed.includes(o._region)
    ),
    verdict: "filtered",
  };
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

const SPRING_MODES: ArrivalMode[] = ["spring_overshoot"];
const AUTUMN_MODES: ArrivalMode[] = [
  "autumn_drift",
  "winter_irruption",
  "post_breeding_dispersal",
];

function modesFor(season: Season): ArrivalMode[] {
  return season === "spring" ? SPRING_MODES : AUTUMN_MODES;
}

export function phenologyGate(
  season: Season | null,
  phen: PhenologyRow | null,
): { gate: number; mode: ArrivalMode | null; source: "row" | "missing" } {
  if (!phen) return { gate: 0.5, mode: null, source: "missing" };

  const modes = Array.isArray(phen.arrival_modes) ? phen.arrival_modes : [];
  if (modes.length === 0) return { gate: 0.05, mode: null, source: "row" };
  if (!season) return { gate: 0.05, mode: null, source: "row" };

  const wanted = modesFor(season);
  const matching = modes.filter((m) => wanted.includes(m));
  // In-window by date but the matching mode is absent -- the window exists
  // while the mode does not, which is exactly what "gate by modes" is for.
  if (matching.length === 0) return { gate: 0.05, mode: null, source: "row" };

  // More specific than the arrival_modes[0] rule, so it is checked first.
  if (matching.length === 1 && matching[0] === "post_breeding_dispersal") {
    return { gate: 0.35, mode: "post_breeding_dispersal", source: "row" };
  }
  if (matching.includes(modes[0])) {
    return { gate: 1, mode: modes[0], source: "row" };
  }
  return { gate: 0.6, mode: matching[0], source: "row" };
}

// ---------------------------------------------------------------------------
// Direction / source / upstream
// ---------------------------------------------------------------------------

// Both angles are "from" bearings (wind blows from X, bird arrives from Y), so
// they are compared directly -- no +180 flip.
export function directionFit(wind: Wind, bearingFrom: number | null): number {
  if (bearingFrom === null || wind.from_deg === null) return 0.5;
  if (wind.speed_kmh === null || wind.speed_kmh < V4.MIN_TRANSPORT_KMH) {
    return 0.5;
  }
  const rad = (wind.from_deg - bearingFrom) * Math.PI / 180;
  return Math.max(0, Math.cos(rad));
}

// `observed` = every country_code the species was seen in this run; a match on
// ANY of them counts, not just the nearest observation's region.
export function sourceFit(
  observed: string[],
  sourceRegions: string[] | null | undefined,
): number {
  if (!sourceRegions || sourceRegions.length === 0) return 0.5; // no row / no season
  if (!observed || observed.length === 0) return 0.5; // nothing to compare
  return observed.some((r) => sourceRegions.includes(r)) ? 1 : 0.3;
}

export function regionToCountry(region: string | null): string | null {
  if (!region) return null;
  if (region === "RU" || region.startsWith("RU-")) return "RU";
  if (region === "FI" || region === "SE" || region === "LV" || region === "LT") {
    return region;
  }
  return null; // PL, BY, EE, anything else -> no upstream stats
}

// Best (max) follow-through probability across every country the species was
// observed in, not just the nearest one.
export function upstreamP(
  speciesLat: string,
  regions: string[],
  rows: UpstreamRow[],
): number {
  if (!speciesLat || !regions || regions.length === 0) return 0;
  const countries = new Set<string>();
  for (const r of regions) {
    const c = regionToCountry(r);
    if (c) countries.add(c);
  }
  if (countries.size === 0) return 0;
  const key = speciesLat.trim().toLowerCase();
  let best = 0;
  for (const r of rows) {
    if (!countries.has(r.from_country)) continue;
    if (String(r.species_lat).trim().toLowerCase() !== key) continue;
    if (r.foreign_days < 5) continue;
    const p = Number(r.p_ee_30d) || 0;
    if (p > best) best = p;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export function scoreV4(i: V4Inputs, w: V4Weights = V4): V4Factors {
  const season = seasonFor(i.today, i.phen);
  const g = phenologyGate(season, i.phen);

  const bearing = season === "spring"
    ? i.phen?.arrival_bearing_spring ?? null
    : season === "autumn"
    ? i.phen?.arrival_bearing_autumn ?? null
    : null;
  const direction_fit = directionFit(i.wind, bearing);

  const regions = season === "spring"
    ? i.phen?.source_regions_spring
    : season === "autumn"
    ? i.phen?.source_regions_autumn
    : null;
  const source_fit = sourceFit(i.regions, regions);

  // Keyed off species_lat, never phen: the upstream signal survives a missing
  // phenology row.
  const upstream = upstreamP(i.species_lat, i.regions, i.upstream);

  const raw = i.tier_base +
    w.COUNT_W * i.count +
    w.DIST_W * i.distance +
    w.SEASON_W * i.season_signal +
    w.DIR_W * direction_fit +
    w.SRC_W * source_fit +
    w.UP_W * upstream;

  // The gated score is what the Platt sigmoid consumes; `pct` is the result.
  const calibrated_score = raw * g.gate;
  const pct = Math.max(
    w.FLOOR,
    Math.min(
      w.CEIL,
      Math.round(100 * sigmoid(w.CAL_A * calibrated_score + w.CAL_B)),
    ),
  );

  return {
    season,
    phenology_gate: g.gate,
    phenology_source: g.source,
    direction_fit: Math.round(direction_fit * 1000) / 1000,
    source_fit,
    upstream: Math.round(upstream * 1000) / 1000,
    raw: Math.round(raw * 100) / 100,
    calibrated_score: Math.round(calibrated_score * 100) / 100,
    pct,
  };
}

// ---------------------------------------------------------------------------
// P24 narrative cap
//
// 30 entries per raport, but the tail sits at 1-4% and Sonnet writes the same
// weight of confident Estonian for a 1% bird as for a 42% one. The fix is NOT
// to ask Sonnet to taper -- instructing a model to write less is a behaviour
// gamble against a SHA-pinned prompt with no test coverage on that stage.
// Instead the tail never reaches Sonnet at all: the EF drops it from the
// payload and fills `why_likely_et` from a deterministic template.
// ---------------------------------------------------------------------------

// Alongside V4 in the same style: the cut is a tuned rule, not three literals
// scattered across the call site.
export const NARRATIVE = {
  MIN_PCT: 5,
  FLOOR: 8,
  CEILING: 15,
} as const;

export interface NarrativeCutOpts {
  minPct: number;
  floor: number;
  ceiling: number;
}

/**
 * Split an already-ranked list into the entries that get a full Sonnet
 * narrative and the entries that get the stub.
 *
 * Narrate every entry at or above `minPct`, but never fewer than `floor` and
 * never more than `ceiling`. Both bounds are counts, not percentages: a raport
 * whose whole pool is weak still gets `floor` narrated entries rather than a
 * page of stubs, and a freak day where everything clears `minPct` still costs
 * at most `ceiling` narratives.
 *
 * `entries` MUST already be in report order -- the caller's sort is the only
 * ranking, and the bounds take from the top of it. A tie spanning the cut is
 * therefore resolved by position, which is deterministic but arbitrary; that is
 * the same rule the TOP_N slice already applies one boundary further down.
 */
export function narrateCut<T extends { probability_pct: number }>(
  entries: T[],
  opts: NarrativeCutOpts,
): { narrated: T[]; stubbed: T[] } {
  const above = entries.filter((e) => e.probability_pct >= opts.minPct).length;
  // Clamp to the band, then to what actually exists: a list shorter than the
  // floor is narrated whole rather than padded with entries that are not there.
  const n = Math.min(
    entries.length,
    Math.max(opts.floor, Math.min(opts.ceiling, above)),
  );
  return { narrated: entries.slice(0, n), stubbed: entries.slice(n) };
}

// The full live set, confirmed against every country_code present across
// upstream_obs[] and neighbor_breakdown[] in every raport to date: PL, SE, FI,
// LV, LT, BY, RU-LEN. Nominative, because the stub sentence puts the name after
// a colon and so never needs a case-inflected form.
const COUNTRY_NAME_ET: Record<string, string> = {
  PL: "Poola",
  SE: "Rootsi",
  FI: "Soome",
  LV: "Läti",
  LT: "Leedu",
  BY: "Valgevene",
  "RU-LEN": "Venemaa",
};

/**
 * Region code -> Estonian country name, nominative.
 *
 * Subnational codes are not countries: every RU-* collapses to Venemaa by
 * prefix, so RU-KGD works the day it first appears (it never has yet). Same
 * prefix shape as `regionToCountry` above, deliberately NOT that function --
 * it returns null for PL and BY, which is right for upstream stats and wrong
 * for naming. An unmapped code degrades to itself, uppercased, so a new region
 * shows up as "EE" rather than as a crash or the word null.
 */
export function countryNameEt(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  if (!c) return null;
  const named = COUNTRY_NAME_ET[c];
  if (named) return named;
  if (c === "RU" || c.startsWith("RU-")) return "Venemaa";
  return c;
}

// Nominative, lowercase -- Estonian does not capitalise month names. Fixed
// list, never generated.
const MONTHS_ET = [
  "jaanuar",
  "veebruar",
  "märts",
  "aprill",
  "mai",
  "juuni",
  "juuli",
  "august",
  "september",
  "oktoober",
  "november",
  "detsember",
];

/**
 * "2026-09-12" or "2026-09-12 07:30" -> "12. september".
 *
 * Parsed by regex on the date prefix, never through Date: `new Date("2026-09-12")`
 * is UTC midnight, and reading getDate() from a timezone west of UTC would
 * silently report the 11th. The two accepted shapes are what eBird and the
 * neighbour breakdown actually carry.
 */
export function formatDateEt(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date).trim());
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${day}. ${MONTHS_ET[month - 1]}`;
}

export interface StubEntry {
  country_code?: string | null;
  date?: string | null;
}

const STUB_LEAD_ET = "Madal tõenäosus.";

/**
 * The tail entry's `why_likely_et`, in place of a Sonnet narrative.
 *
 * Estonian verified with estonian-mcp (0 officialese issues, spell- and
 * capitalisation-clean). Do not reword, do not hedge, do not add a third
 * sentence -- this function exists so the string is pinned by a test.
 *
 * A missing country or date degrades to the lead sentence alone. Half a
 * sentence, or one carrying the word "null", is worse than a short one.
 */
export function stubWhyLikely(entry: StubEntry): string {
  const country = countryNameEt(entry.country_code ?? null);
  const date = formatDateEt(entry.date ?? null);
  if (!country || !date) return STUB_LEAD_ET;
  return `${STUB_LEAD_ET} Lähimad vaatlused: ${country}, viimane ${date}.`;
}
