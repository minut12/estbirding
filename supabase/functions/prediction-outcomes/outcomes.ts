// supabase/functions/prediction-outcomes/outcomes.ts
// P7b: pure scoring for the prediction-outcomes Edge Function. Split out of
// index.ts so outcomes.test.ts can import it without index.ts's top-level
// Deno.serve() starting a server -- the batch-driver/state.ts precedent (P3 D0).
//
// Nothing here does I/O, reads the clock, or touches Deno.env. Every export is
// a total function of its arguments, which is what makes the window derivation
// and the hit classification testable without a database.
//
// The window derivation is the load-bearing part. `timing_band` is the only
// machine-readable timing field a raport entry carries (`arrival_window_et` is
// assigned one line after the band from the same if/else in
// toenaosus-orchestrator/index.ts:1607-1641, so it is a label, not data), and
// the band's own condition is BACKWARD-looking: `freshDays` is the age of the
// freshest upstream observation, not a forward promise. Only `imminent` states
// a forward day count in code ("järgmise ~5 päeva jooksul"). Everything below
// therefore records WHERE its window came from in `window_source`, so a
// payload-native window can supersede these rows later without rewriting
// history.

// ---------------------------------------------------------------------------
// Types -- the four text domains below mirror the table's CHECK constraints
// (prediction_outcomes_window_source_ck, _outcome_ck, _reason_ck,
// _obs_source_ck). Keep them in sync or the insert is rejected.
// ---------------------------------------------------------------------------

export type WindowSource = "code_5d" | "label_7d" | "phenology" | "none";

export type Outcome = "species_hit" | "site_hit" | "miss" | "not_scored";

export type NotScoredReason =
  | "window_closed"
  | "out_of_phenology"
  | "no_phenology_row"
  | "no_coordinates";

export type ObsSource =
  | "elurikkus_observations"
  | "vaatluste_raport"
  | "elurikkus_raport";

export type SeasonKind = "spring" | "autumn";

/**
 * Watch-list items and species-level (Ülevaade card) rows carry this, matching
 * SITE_INDEX_SPECIES_LEVEL in src/lib/predictionRatings.ts:29 so an outcome row
 * and a P7a rating for the same prediction share a key.
 */
export const SITE_INDEX_SPECIES_LEVEL = -1;

/** A predicted site counts as hit when a real record lands within this radius. */
export const SITE_HIT_RADIUS_KM = 50;

/**
 * Storage bound on a derived window, NOT a claim about the bird: an `in_season`
 * phenology window can run months, and we will not hold a row open that long.
 * A prediction whose phenology window outruns this is scored on the first 60
 * days of it and says so via window_end < the projected phenology end.
 */
export const WINDOW_MAX_DAYS = 60;

/** From the band's own label: "Lähipäevil (järgmise ~5 päeva jooksul)". */
export const IMMINENT_WINDOW_DAYS = 5;

/** From the band's own label: "Selle nädala jooksul" -- a week. */
export const THIS_WEEK_WINDOW_DAYS = 7;

/**
 * Tie-break order when two arrival records share the earliest date. Ordered
 * most to least authoritative: elurikkus_observations is per-observation data
 * straight from elurikkus.ee, while the two raport tables hold entries that
 * passed through a model.
 */
export const OBS_SOURCE_PRIORITY: readonly ObsSource[] = [
  "elurikkus_observations",
  "vaatluste_raport",
  "elurikkus_raport",
];

// ---------------------------------------------------------------------------
// Date helpers -- date-only arithmetic in UTC. Every date this module returns
// is 'YYYY-MM-DD', which is what the table's `date` columns take.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * 'YYYY-MM-DD' out of a date or timestamptz string, or '' when unparseable.
 * Accepts '2026-09-08', '2026-09-08 03:13:26+00' and full ISO timestamps.
 */
export function dateOnly(value: unknown): string {
  if (typeof value !== "string") return "";
  const direct = ISO_DATE_RE.exec(value.trim());
  if (direct) return direct[0];
  const t = Date.parse(value);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

/** Adds (or subtracts) whole days to a 'YYYY-MM-DD'. '' in, '' out. */
export function addDays(iso: string, days: number): string {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return "";
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/** True when `iso` is within [start, end] inclusive. Empty bounds fail closed. */
export function withinInclusive(
  iso: string,
  start: string,
  end: string,
): boolean {
  if (!iso || !start || !end) return false;
  return iso >= start && iso <= end;
}

/** The earlier of two 'YYYY-MM-DD' strings; lexicographic order is date order. */
export function minDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/** The later of two 'YYYY-MM-DD' strings. */
export function maxDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

// ---------------------------------------------------------------------------
// Great-circle distance
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine, copied rather than imported: there are nine implementations in the
 * repo and none lives anywhere an Edge Function may import from -- _shared/ has
 * no geo helper, and importing from toenaosus-orchestrator is forbidden.
 *
 * This is the 2*atan2(sqrt(a), sqrt(1-a)) form, matching
 * toenaosus-orchestrator/eta.ts:89-102 and, to floating point, the
 * 2*R*asin(sqrt(a)) form at toenaosus-orchestrator/index.ts:1037-1050.
 * Deliberately NOT the species-prediction/index.ts:7159-7166 variant, which
 * rounds its result to one decimal place -- rounding before a 50 km threshold
 * comparison would quantise a distance the calibration set is measured on.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Finite-number coercion; anything else (null, '', NaN, Infinity) -> null. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Phenology window projection
//
// species_phenology.spring_window / autumn_window are daterange values stored
// in year 2000, month/day only -- e.g. '[2000-08-01,2000-10-16)'. Some cross a
// year boundary: parjae autumn is '[2000-08-01,2000-10-16)' but ambduc autumn
// is '[2000-10-15,2001-01-01)'. The year OFFSET between the bounds is therefore
// part of the datum and has to survive projection.
// ---------------------------------------------------------------------------

export interface ParsedDaterange {
  lowerISO: string;
  upperISO: string;
  lowerInclusive: boolean;
  upperInclusive: boolean;
}

/** Parses Postgres daterange text, e.g. '[2000-08-01,2000-10-16)'. */
export function parseDaterange(text: unknown): ParsedDaterange | null {
  if (typeof text !== "string") return null;
  const m =
    /^([\[(])\s*"?(\d{4}-\d{2}-\d{2})"?\s*,\s*"?(\d{4}-\d{2}-\d{2})"?\s*([\])])$/
      .exec(text.trim());
  if (!m) return null;
  return {
    lowerInclusive: m[1] === "[",
    lowerISO: m[2],
    upperISO: m[3],
    upperInclusive: m[4] === "]",
  };
}

/**
 * Projects a stored phenology window's upper bound onto `raportYear` and
 * returns the INCLUSIVE last day, or null when the range is absent/unparseable.
 *
 * The bounds' year offset is preserved, so '[2000-10-15,2001-01-01)' projected
 * onto 2026 ends 2026-12-31, not 2025-12-31. A half-open upper bound (the
 * Postgres default, and what every curated row uses) has one day subtracted
 * AFTER projection, so the offset arithmetic stays on the stored bound.
 *
 * Feb 29 in a non-leap target year rolls forward to Mar 1 via Date.UTC, which
 * is a one-day imprecision on a window measured in weeks. Not corrected.
 */
export function projectPhenologyEnd(
  rangeText: unknown,
  raportYear: number,
): string | null {
  const parsed = parseDaterange(rangeText);
  if (!parsed) return null;
  if (!Number.isFinite(raportYear)) return null;

  const lowerYear = Number(parsed.lowerISO.slice(0, 4));
  const upperYear = Number(parsed.upperISO.slice(0, 4));
  const yearOffset = upperYear - lowerYear;

  const month = Number(parsed.upperISO.slice(5, 7));
  const day = Number(parsed.upperISO.slice(8, 10));
  const projected = new Date(
    Date.UTC(raportYear + yearOffset, month - 1, day),
  ).toISOString().slice(0, 10);

  return parsed.upperInclusive ? projected : addDays(projected, -1);
}

/**
 * Which seasonal window to read.
 *
 * `probability_factors.season` is the entry's own season but is null on 2401 of
 * the last 2539 entries -- it only exists on the most recent raports. So it
 * wins when present and `toenaosus_raport.season` (always present, always
 * 'spring_summer' or 'fall_winter') is the fallback.
 */
export function seasonWindowKind(
  entrySeason: unknown,
  raportSeason: unknown,
): SeasonKind | null {
  if (entrySeason === "autumn") return "autumn";
  if (entrySeason === "spring") return "spring";
  if (raportSeason === "fall_winter") return "autumn";
  if (raportSeason === "spring_summer") return "spring";
  return null;
}

// ---------------------------------------------------------------------------
// Window derivation
// ---------------------------------------------------------------------------

export interface DerivedWindow {
  windowSource: WindowSource;
  windowStart: string | null;
  windowEnd: string | null;
  /** Non-null means the entry is recorded but never scored. */
  notScoredReason: NotScoredReason | null;
}

export interface DeriveWindowInput {
  band: unknown;
  /** The raport's generated_at; only its date part is used. */
  generatedAt: string;
  /**
   * Projected inclusive end of the species' seasonal phenology window, or null
   * when there is no species_phenology row, no ebird_code to look one up by, or
   * no window for the selected season. Read for bands 'in_season' and
   * 'watchlist', which share one phenology path.
   */
  phenologyEnd: string | null;
  /**
   * `phenology_gate` off a corridor_watchlist item. Only read for the
   * 'watchlist' band: an `entries` row has already had this gate applied by the
   * orchestrator (a gate below the threshold is what makes it `out_of_window`),
   * but a watch-list item carries no band, so the gate is applied here instead.
   * Absent/null means "no gate to apply", matching the orchestrator's own
   * default of 1 at toenaosus-orchestrator/index.ts:1613-1617.
   */
  phenologyGate?: number | null;
}

/**
 * Below this, the species is outside its typical arrival window. The threshold
 * and the comparison are the orchestrator's own: `if (gate < 0.6)` at
 * toenaosus-orchestrator/index.ts:1618, the test that produces `out_of_window`.
 */
export const PHENOLOGY_GATE_MIN = 0.6;

/** `timing_band` for a corridor_watchlist row. See deriveWindow. */
export const WATCHLIST_BAND = "watchlist";

/**
 * The shared phenology path: window from the projected seasonal end, clamped.
 * Used by both `in_season` and `watchlist` so there is exactly one copy.
 */
function phenologyWindow(
  start: string,
  phenologyEnd: string | null,
): DerivedWindow {
  if (!phenologyEnd) {
    return {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "no_phenology_row",
    };
  }
  // The curated season closed before this raport was generated, so there is no
  // forward window left to score against.
  if (phenologyEnd < start) {
    return {
      windowSource: "none",
      windowStart: null,
      windowEnd: null,
      notScoredReason: "out_of_phenology",
    };
  }
  return {
    windowSource: "phenology",
    windowStart: start,
    windowEnd: minDate(phenologyEnd, addDays(start, WINDOW_MAX_DAYS)),
    notScoredReason: null,
  };
}

/**
 * The band -> window mapping. Returns null for a band this function does not
 * know, which the caller records and skips rather than guessing a window for.
 *
 * `passed` and `out_of_window` still produce a row: without one we could not
 * tell "we predicted nothing" from "we never looked". They are never scored --
 * both carry a TIMING_CAP-suppressed probability
 * (toenaosus-orchestrator/index.ts:1101, 1644-1648), so scoring them would put
 * a number that was never a real prediction into the calibration set.
 *
 * WATCHLIST_BAND is the one value here that no raport entry carries: it labels
 * a corridor_watchlist item, which has no timing_band of its own. Watch-list
 * items are not a corner case -- since the ebird_code floor, all 45 of them are
 * for species with no `entries` row in the same raport, so without this branch
 * they would never be scored at all, and the P7a ratings left on them would
 * never reach the calibration set.
 */
export function deriveWindow(input: DeriveWindowInput): DerivedWindow | null {
  const start = dateOnly(input.generatedAt);
  if (!start) return null;

  switch (input.band) {
    case "imminent":
      return {
        windowSource: "code_5d",
        windowStart: start,
        windowEnd: addDays(start, IMMINENT_WINDOW_DAYS),
        notScoredReason: null,
      };

    case "this_week":
      return {
        windowSource: "label_7d",
        windowStart: start,
        windowEnd: addDays(start, THIS_WEEK_WINDOW_DAYS),
        notScoredReason: null,
      };

    case "in_season":
      return phenologyWindow(start, input.phenologyEnd);

    // A corridor_watchlist item. Not a band the orchestrator assigns -- it
    // assigns none at all -- so this is a provenance label, not an invented
    // band, and it keeps watch-list rows separable downstream. Watch-list items
    // carry phenology_gate, phenology_mode and predicted_sites, i.e. the same
    // inputs the in_season branch reads, so they take the same window.
    case WATCHLIST_BAND: {
      const gate = input.phenologyGate;
      // The gate the orchestrator would have applied on the entries path. It
      // does not fire on today's data (every live watch-list row gates at 1);
      // a gate that only exists when it passes is not a gate.
      if (typeof gate === "number" && gate < PHENOLOGY_GATE_MIN) {
        return {
          windowSource: "none",
          windowStart: null,
          windowEnd: null,
          notScoredReason: "out_of_phenology",
        };
      }
      return phenologyWindow(start, input.phenologyEnd);
    }

    case "passed":
      return {
        windowSource: "none",
        windowStart: null,
        windowEnd: null,
        notScoredReason: "window_closed",
      };

    case "out_of_window":
      return {
        windowSource: "none",
        windowStart: null,
        windowEnd: null,
        notScoredReason: "out_of_phenology",
      };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Arrival matching
// ---------------------------------------------------------------------------

export interface ArrivalRecord {
  date: string;
  lat: number | null;
  lon: number | null;
  source: ObsSource;
}

function sourceRank(source: ObsSource): number {
  const i = OBS_SOURCE_PRIORITY.indexOf(source);
  return i < 0 ? OBS_SOURCE_PRIORITY.length : i;
}

/** Records whose date falls inside the closed window, in no particular order. */
export function filterArrivalsInWindow(
  records: readonly ArrivalRecord[],
  windowStart: string | null,
  windowEnd: string | null,
): ArrivalRecord[] {
  if (!windowStart || !windowEnd) return [];
  return records.filter((r) => withinInclusive(r.date, windowStart, windowEnd));
}

/**
 * Earliest record, ties broken by OBS_SOURCE_PRIORITY so the same arrival seen
 * in two tables is attributed to the more authoritative one.
 */
export function earliestArrival(
  records: readonly ArrivalRecord[],
): ArrivalRecord | null {
  let best: ArrivalRecord | null = null;
  for (const r of records) {
    if (!r.date) continue;
    if (best === null) {
      best = r;
      continue;
    }
    if (r.date < best.date) {
      best = r;
    } else if (
      r.date === best.date && sourceRank(r.source) < sourceRank(best.source)
    ) {
      best = r;
    }
  }
  return best;
}

export interface NearestMatch {
  record: ArrivalRecord;
  distanceKm: number;
}

/** Nearest coordinate-bearing record to a site, or null when none has coords. */
export function nearestToSite(
  records: readonly ArrivalRecord[],
  siteLat: number,
  siteLon: number,
): NearestMatch | null {
  let best: NearestMatch | null = null;
  for (const r of records) {
    if (r.lat === null || r.lon === null) continue;
    const distanceKm = haversineKm(siteLat, siteLon, r.lat, r.lon);
    if (best === null || distanceKm < best.distanceKm) {
      best = { record: r, distanceKm };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Row construction
// ---------------------------------------------------------------------------

export interface PredictedSite {
  label: string | null;
  lat: number | null;
  lon: number | null;
}

export interface OutcomeRow {
  raport_id: string;
  ebird_code: string;
  site_index: number;
  species_et: string;
  timing_band: string;
  predicted_pct: number | null;
  site_label: string | null;
  predicted_lat: number | null;
  predicted_lon: number | null;
  window_start: string | null;
  window_end: string | null;
  window_source: WindowSource;
  outcome: Outcome;
  not_scored_reason: NotScoredReason | null;
  ee_first_date: string | null;
  ee_lat: number | null;
  ee_lon: number | null;
  distance_km: number | null;
  obs_source: ObsSource | null;
}

export interface BuildRowsInput {
  raportId: string;
  ebirdCode: string;
  speciesEt: string;
  band: string;
  predictedPct: number | null;
  sites: readonly PredictedSite[];
  window: DerivedWindow;
  /** Every known arrival for this species, unfiltered by window. */
  arrivals: readonly ArrivalRecord[];
}

/** Distances are stored to 3 decimals -- metre resolution, no false precision. */
function roundKm(km: number): number {
  return Math.round(km * 1000) / 1000;
}

/**
 * One species-level row (site_index -1) plus one row per predicted site.
 *
 * A window-level not_scored (passed / out_of_window / no_phenology_row /
 * out_of_phenology) emits ONLY the species-level row: the entry was never
 * scored at all, so per-site rows would carry no information the one row does
 * not. `no_coordinates` is different -- there the species WAS scored and only
 * the site question is unanswerable, so those site rows are emitted.
 */
export function buildRowsForEntry(input: BuildRowsInput): OutcomeRow[] {
  const w = input.window;
  const base = {
    raport_id: input.raportId,
    ebird_code: input.ebirdCode,
    species_et: input.speciesEt,
    timing_band: input.band,
    predicted_pct: input.predictedPct,
    window_start: w.windowStart,
    window_end: w.windowEnd,
    window_source: w.windowSource,
  };

  const speciesRowShell = {
    ...base,
    site_index: SITE_INDEX_SPECIES_LEVEL,
    site_label: null,
    predicted_lat: null,
    predicted_lon: null,
  };

  if (w.notScoredReason !== null) {
    return [{
      ...speciesRowShell,
      outcome: "not_scored",
      not_scored_reason: w.notScoredReason,
      ee_first_date: null,
      ee_lat: null,
      ee_lon: null,
      distance_km: null,
      obs_source: null,
    }];
  }

  const inWindow = filterArrivalsInWindow(
    input.arrivals,
    w.windowStart,
    w.windowEnd,
  );
  const first = earliestArrival(inWindow);
  const withCoords = inWindow.filter((r) => r.lat !== null && r.lon !== null);

  const rows: OutcomeRow[] = [{
    ...speciesRowShell,
    outcome: first ? "species_hit" : "miss",
    not_scored_reason: null,
    ee_first_date: first ? first.date : null,
    ee_lat: first ? first.lat : null,
    ee_lon: first ? first.lon : null,
    distance_km: null,
    obs_source: first ? first.source : null,
  }];

  input.sites.forEach((site, siteIndex) => {
    const siteShell = {
      ...base,
      site_index: siteIndex,
      site_label: site.label,
      predicted_lat: site.lat,
      predicted_lon: site.lon,
    };

    // The species never showed inside the window: the site missed because the
    // bird was not there, which is a real miss and not a measurement gap.
    if (!first) {
      rows.push({
        ...siteShell,
        outcome: "miss",
        not_scored_reason: null,
        ee_first_date: null,
        ee_lat: null,
        ee_lon: null,
        distance_km: null,
        obs_source: null,
      });
      return;
    }

    // The species DID show, but nothing we can measure against: either no
    // in-window record carried coordinates (nothing on the write path
    // guarantees they survive -- insert-vaatluste-raport/index.ts:65 checks
    // array-ness only) or the predicted site itself has none. Recording `miss`
    // here would read as "the bird was not there", which is false.
    const siteLat = site.lat;
    const siteLon = site.lon;
    const nearest = (siteLat === null || siteLon === null)
      ? null
      : nearestToSite(withCoords, siteLat, siteLon);

    if (!nearest) {
      rows.push({
        ...siteShell,
        outcome: "not_scored",
        not_scored_reason: "no_coordinates",
        ee_first_date: null,
        ee_lat: null,
        ee_lon: null,
        distance_km: null,
        obs_source: null,
      });
      return;
    }

    const distanceKm = roundKm(nearest.distanceKm);
    rows.push({
      ...siteShell,
      outcome: distanceKm <= SITE_HIT_RADIUS_KM ? "site_hit" : "miss",
      not_scored_reason: null,
      ee_first_date: nearest.record.date,
      ee_lat: nearest.record.lat,
      ee_lon: nearest.record.lon,
      distance_km: distanceKm,
      obs_source: nearest.record.source,
    });
  });

  return rows;
}
