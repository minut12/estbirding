// toenaosus-orchestrator / sites.ts
// Deterministic arrival-site prediction — pure functions only. No env, no
// network, no Deno.serve, so a test can import this without starting a server.
//
// Two sources, in order:
//   1. history — 0.25 deg cells of past EE records for the species, from the
//      ennustus_predicted_site_cells RPC, ranked by seasonal weight, recency
//      and how well the cell sits along the species' arrival bearing.
//   2. anchor  — when the species has no seasonal EE history, a short list of
//      well-known watch points filtered by flight class.
//
// Coordinates are always CELL MEANS (>= 0.25 deg aggregation) or fixed anchor
// points, never a raw observation, and observer names never appear here.

export interface SiteCell {
  species_name: string;
  cell_lat: number;
  cell_lon: number;
  lat: number;
  lon: number;
  n_total: number;
  n_season: number;
  n_recent5y: number;
  n_effort: number; // all-species species-days in the cell (observer effort)
  last_date: string | null;
  label: string | null;
  county: string | null;
}

export interface PredictedSite {
  lat: number;
  lon: number;
  label: string;
  county: string | null;
  score: number;
  cluster_n: number;
  source: "history" | "anchor";
}

export type AnchorKind = "headland" | "wetland" | "island" | "inland";

export interface Anchor {
  label: string;
  lat: number;
  lon: number;
  kind: AnchorKind;
}

export type FlightClass =
  | "passerine_nocturnal"
  | "raptor_soaring"
  | "wader"
  | "waterbird"
  | "seabird"
  | "heron_stork";

export const EE_CENTRE = { lat: 58.6, lon: 25.5 };

const RECENT_DAYS = 730;
const DAY_MS = 86_400_000;

// Ranking by raw record count rewards observer effort, not species preference
// -- Põõsaspea gets 73x the watching Ristna does. Rank by the species' SHARE
// of all-species effort in the cell instead, shrunk toward 0 by EFFORT_PRIOR
// so a cell with one visit and one sighting cannot look like a hotspot.
const EFFORT_PRIOR = 200;
const SHARE_W = 400;
const SHARE_CAP = 0.05;
const MIN_SEASON_DAYS = 3;

// ---------------------------------------------------------------------------
// P6d corroborated rescue.
//
// A cell the cap of 3 dropped is restored only when a curated watch arc AND a
// nearby anchor independently corroborate it. Two gates, and they are not
// redundant:
//
//   RESCUE_MAX_KM answers "is this cell the same place as the anchor?". The
//   cell-to-nearest-anchor distribution over the live pool breaks naturally at
//   1 km (16 cells, then 9 / 5 / 3) and runs continuous through 5 km, so a
//   wider radius admits neighbouring cells rather than the same headland.
//
//   RESCUE_SHARE_RATIO answers "does rule 16 survive?". Distance alone does
//   not: anchors are famous watchpoints, famous watchpoints are high-effort
//   cells, so proximity to an anchor is positively correlated with the
//   denominator `share` divides out. Measured, a distance-only rule readmits
//   cells 7-20x weaker on share than the rows they join -- every one of them
//   beside Sõrve säär (n_effort 13 331) -- which is a side door back to
//   raw-count ranking. That 1 km happens to exclude them today is luck: the
//   Sõrve cell mean sits 1.06 km out and a 60 m shift would reopen the hole.
// ---------------------------------------------------------------------------

/** A rescued cell must lie within this of the corroborating anchor. */
export const RESCUE_MAX_KM = 1;

/** ...and carry at least this fraction of the weakest shipped row's share. */
export const RESCUE_SHARE_RATIO = 0.5;

/** At most this many rescues per species. */
export const RESCUE_MAX = 2;

/** Hard ceiling on sites per species: more clutters the map and the route. */
export const SITES_MAX_TOTAL = 5;

export const ANCHORS: readonly Anchor[] = [
  { label: "Sõrve säär", lat: 57.91, lon: 22.06, kind: "headland" },
  { label: "Põõsaspea neem", lat: 59.23, lon: 23.51, kind: "headland" },
  { label: "Ristna", lat: 58.93, lon: 22.05, kind: "headland" },
  { label: "Pakri", lat: 59.39, lon: 24.03, kind: "headland" },
  { label: "Kihnu", lat: 58.13, lon: 23.98, kind: "island" },
  { label: "Vilsandi", lat: 58.38, lon: 21.86, kind: "island" },
  { label: "Tahkuna nina", lat: 59.09, lon: 22.59, kind: "headland" },
  { label: "Kabli", lat: 57.99, lon: 24.45, kind: "wetland" },
  { label: "Haeska", lat: 58.78, lon: 23.62, kind: "wetland" },
  { label: "Matsalu", lat: 58.75, lon: 23.70, kind: "wetland" },
  { label: "Pärispea poolsaar", lat: 59.67, lon: 25.70, kind: "headland" },
  { label: "Käsmu", lat: 59.60, lon: 25.70, kind: "headland" },
  { label: "Aardla", lat: 58.30, lon: 26.72, kind: "inland" },
  { label: "Kallaste (Peipsi)", lat: 58.66, lon: 27.16, kind: "inland" },
  { label: "Värska (Setomaa)", lat: 57.96, lon: 27.64, kind: "inland" },
  { label: "Karula", lat: 57.72, lon: 26.52, kind: "inland" },
];

// Which anchor kinds each flight class can plausibly make landfall at. An
// unknown class (or no phenology row) accepts every kind.
const KINDS_BY_CLASS: Record<FlightClass, AnchorKind[]> = {
  raptor_soaring: ["inland"],
  seabird: ["headland", "island"],
  wader: ["wetland", "headland"],
  waterbird: ["wetland", "headland"],
  heron_stork: ["wetland", "headland"],
  passerine_nocturnal: ["island", "headland", "wetland"],
};

const ALL_KINDS: AnchorKind[] = ["headland", "wetland", "island", "inland"];

/** [m-1, m, m+1] around the current UTC month, wrapped into 1..12. */
export function seasonMonths(today: Date): number[] {
  const m = today.getUTCMonth() + 1;
  return [m === 1 ? 12 : m - 1, m, m === 12 ? 1 : m + 1];
}

/** Initial great-circle bearing, degrees clockwise from north. Copy of index.ts's. */
export function initialBearingDeg(
  la1: number,
  lo1: number,
  la2: number,
  lo2: number,
): number {
  const p1 = la1 * Math.PI / 180;
  const p2 = la2 * Math.PI / 180;
  const dl = (lo2 - lo1) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * How well a site sits along the direction the bird arrives from: 1 when the
 * site lies exactly on that bearing from the centre of Estonia, 0 when it lies
 * opposite. A neutral 0.5 when the species has no known arrival bearing.
 */
function sectorFit(
  lat: number,
  lon: number,
  bearingFrom: number | null,
): number {
  if (bearingFrom === null) return 0.5;
  const b = initialBearingDeg(EE_CENTRE.lat, EE_CENTRE.lon, lat, lon);
  return Math.max(0, Math.cos((b - bearingFrom) * Math.PI / 180));
}

/**
 * Is `bearing` inside the watch arc, traversed CLOCKWISE from `from` to `to`,
 * wrapping through 0?
 *
 * The arc answers a different question from `arrival_bearing`: it is WHERE THE
 * BIRD IS SEEN, not where it comes from. For a drift species those coincide;
 * for one that enters from the NE and then tracks a coast west they do not, and
 * no cos() lobe around a single bearing can express a coastline.
 *
 * A null/absent bound means NO ARC IS CURATED, and an uncurated species must
 * behave exactly as it does today -- so this returns true and filters nothing.
 */
export function inWatchArc(
  bearing: number,
  from: number | null | undefined,
  to: number | null | undefined,
): boolean {
  if (from === null || from === undefined) return true;
  if (to === null || to === undefined) return true;
  const norm = (d: number) => ((d % 360) + 360) % 360;
  const b = norm(bearing);
  const f = norm(from);
  const t = norm(to);
  // f <= t is the ordinary case; f > t wraps through 0 (e.g. 282 -> 20).
  return f <= t ? (b >= f && b <= t) : (b >= f || b <= t);
}

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance. Copied rather than imported for the same reason as
 * everywhere else in this repo: nothing an Edge Function may import from
 * carries one, and _shared/ has no geo helper. Same 2*atan2 form as
 * prediction-outcomes/outcomes.ts, deliberately NOT the species-prediction
 * variant that rounds to 1 dp -- this feeds a 1 km threshold.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** `scoreCell`'s own share term, shrunk by EFFORT_PRIOR. Rule 16's metric. */
function shareOf(cell: SiteCell): number {
  return cell.n_season / (Math.max(0, cell.n_effort || 0) + EFFORT_PRIOR);
}

/** Anchor kinds this flight class can plausibly make landfall at. */
function kindsFor(flightClass: string | null): AnchorKind[] {
  return (flightClass && flightClass in KINDS_BY_CLASS)
    ? KINDS_BY_CLASS[flightClass as FlightClass]
    : ALL_KINDS;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function scoreCell(
  cell: SiteCell,
  bearingFrom: number | null,
  today: Date,
): number {
  const share = cell.n_season / (Math.max(0, cell.n_effort || 0) + EFFORT_PRIOR);
  const shareTerm = SHARE_W * Math.min(SHARE_CAP, Math.max(0, share));
  const seasonal = 0.5 * Math.log(1 + Math.max(0, cell.n_season));
  const recent = 0.5 * Math.log(1 + Math.max(0, cell.n_recent5y));

  let fresh = 0;
  if (cell.last_date) {
    const t = Date.parse(cell.last_date);
    if (!Number.isNaN(t) && (today.getTime() - t) <= RECENT_DAYS * DAY_MS) {
      fresh = 0.5;
    }
  }

  return shareTerm + seasonal + recent + fresh +
    sectorFit(cell.lat, cell.lon, bearingFrom);
}

function cellLabel(cell: SiteCell): string {
  return cell.label ?? cell.county ??
    `Ruut ${cell.cell_lat.toFixed(2)} N, ${cell.cell_lon.toFixed(2)} E`;
}

/**
 * Cells with seasonal history, best first, capped at `max`. Prefers cells
 * with at least MIN_SEASON_DAYS species-days -- a single stray record is
 * noise -- and falls back to the old n_season >= 1 rule only when nothing
 * meets that bar.
 */
export function historySites(
  cells: SiteCell[],
  bearingFrom: number | null,
  today: Date,
  max = 3,
): PredictedSite[] {
  const qualified = cells.filter((c) => c.n_season >= MIN_SEASON_DAYS);
  const pool = qualified.length
    ? qualified
    : cells.filter((c) => c.n_season >= 1);
  return pool
    .map((c) => ({ cell: c, score: scoreCell(c, bearingFrom, today) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ cell, score }) => ({
      lat: cell.lat,
      lon: cell.lon,
      label: cellLabel(cell),
      county: cell.county,
      score: round2(score),
      cluster_n: cell.n_season,
      source: "history" as const,
    }));
}

/**
 * Fallback for species with no seasonal EE history: known watch points.
 *
 * `arc` narrows ELIGIBILITY only. Ordering stays `sectorFit` descending with
 * the ANCHORS-order tiebreak, and the cap stays 2, so a species with no
 * curated arc returns byte-identical output to before P6d.
 */
export function anchorSites(
  flightClass: string | null,
  bearingFrom: number | null,
  max = 2,
  arc?: { from: number | null; to: number | null },
): PredictedSite[] {
  const kinds = kindsFor(flightClass);

  return ANCHORS
    .map((a, i) => ({ a, i, fit: sectorFit(a.lat, a.lon, bearingFrom) }))
    .filter(({ a }) => kinds.includes(a.kind))
    .filter(({ a }) =>
      inWatchArc(initialBearingDeg(EE_CENTRE.lat, EE_CENTRE.lon, a.lat, a.lon), arc?.from, arc?.to)
    )
    // Sector fit first; ANCHORS order breaks ties, so the result is stable.
    .sort((x, y) => (y.fit - x.fit) || (x.i - y.i))
    .slice(0, max)
    .map(({ a, fit }) => ({
      lat: a.lat,
      lon: a.lon,
      label: a.label,
      county: null,
      score: round2(fit),
      cluster_n: 0,
      source: "anchor" as const,
    }));
}

/**
 * Cells the cap of 3 dropped, restored only where a curated arc AND a nearby
 * anchor corroborate them. See RESCUE_MAX_KM / RESCUE_SHARE_RATIO above for why
 * both gates are required and neither is sufficient.
 *
 * A rescued row is a HISTORY row -- its own coordinates, its real `cluster_n`,
 * `source: "history"` -- so the popup's "Vaatlusi ruudus: N" basis line still
 * reads correctly. Nothing is invented.
 *
 * With no curated arc this returns [] and the caller's output is unchanged.
 */
function rescueSites(
  cells: SiteCell[],
  shipped: PredictedSite[],
  phen: {
    bearingFrom: number | null;
    flightClass: string | null;
    arcFrom?: number | null;
    arcTo?: number | null;
  },
  today: Date,
  max: number,
): PredictedSite[] {
  if (phen.arcFrom === null || phen.arcFrom === undefined) return [];
  if (phen.arcTo === null || phen.arcTo === undefined) return [];
  if (max <= 0 || shipped.length === 0) return [];

  // Anchors that both pass the flight-class filter and sit inside the arc.
  const kinds = kindsFor(phen.flightClass);
  const corroborators = ANCHORS.filter((a) =>
    kinds.includes(a.kind) &&
    inWatchArc(
      initialBearingDeg(EE_CENTRE.lat, EE_CENTRE.lon, a.lat, a.lon),
      phen.arcFrom,
      phen.arcTo,
    )
  );
  if (corroborators.length === 0) return [];

  // `historySites` writes cell.lat/cell.lon through unchanged, so a shipped row
  // is identified by its exact coordinates.
  const shippedAt = new Set(shipped.map((s) => s.lat + "," + s.lon));
  const shippedCells = cells.filter((c) => shippedAt.has(c.lat + "," + c.lon));
  if (shippedCells.length === 0) return [];
  const weakestShare = Math.min(...shippedCells.map(shareOf));
  const shareFloor = weakestShare * RESCUE_SHARE_RATIO;

  return cells
    .filter((c) =>
      // 1. qualifies today, 2. did not make the cap
      c.n_season >= MIN_SEASON_DAYS && !shippedAt.has(c.lat + "," + c.lon) &&
      // 4. rule 16 still holds against the weakest row it would join
      shareOf(c) >= shareFloor &&
      // 3. an in-arc, right-kind anchor says this is the same place
      corroborators.some((a) =>
        haversineKm(c.lat, c.lon, a.lat, a.lon) <= RESCUE_MAX_KM
      )
    )
    .map((c) => ({ cell: c, score: scoreCell(c, phen.bearingFrom, today) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ cell, score }) => ({
      lat: cell.lat,
      lon: cell.lon,
      label: cellLabel(cell),
      county: cell.county,
      score: round2(score),
      cluster_n: cell.n_season,
      source: "history" as const,
    }));
}

export function predictedSitesFor(
  cells: SiteCell[],
  phen: {
    bearingFrom: number | null;
    flightClass: string | null;
    arcFrom?: number | null;
    arcTo?: number | null;
  },
  today: Date,
): PredictedSite[] {
  const history = historySites(cells, phen.bearingFrom, today);
  if (history.length >= 1) {
    // Rescues are appended after the three, in score order: they lost the cap,
    // so they rank below every row they join by construction.
    const room = Math.min(RESCUE_MAX, SITES_MAX_TOTAL - history.length);
    return history.concat(rescueSites(cells, history, phen, today, room));
  }
  return anchorSites(phen.flightClass, phen.bearingFrom, undefined, {
    from: phen.arcFrom ?? null,
    to: phen.arcTo ?? null,
  });
}
