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
