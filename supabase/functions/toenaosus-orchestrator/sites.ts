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

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function scoreCell(
  cell: SiteCell,
  bearingFrom: number | null,
  today: Date,
): number {
  const seasonal = Math.log(1 + Math.max(0, cell.n_season));
  const recent = 0.5 * Math.log(1 + Math.max(0, cell.n_recent5y));

  let fresh = 0;
  if (cell.last_date) {
    const t = Date.parse(cell.last_date);
    if (!Number.isNaN(t) && (today.getTime() - t) <= RECENT_DAYS * DAY_MS) {
      fresh = 0.5;
    }
  }

  return seasonal + recent + fresh + sectorFit(cell.lat, cell.lon, bearingFrom);
}

function cellLabel(cell: SiteCell): string {
  return cell.label ?? cell.county ??
    `Ruut ${cell.cell_lat.toFixed(2)} N, ${cell.cell_lon.toFixed(2)} E`;
}

/** Cells with any seasonal history, best first, capped at `max`. */
export function historySites(
  cells: SiteCell[],
  bearingFrom: number | null,
  today: Date,
  max = 3,
): PredictedSite[] {
  return cells
    .filter((c) => c.n_season >= 1)
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

/** Fallback for species with no seasonal EE history: known watch points. */
export function anchorSites(
  flightClass: string | null,
  bearingFrom: number | null,
  max = 2,
): PredictedSite[] {
  const kinds = (flightClass && flightClass in KINDS_BY_CLASS)
    ? KINDS_BY_CLASS[flightClass as FlightClass]
    : ALL_KINDS;

  return ANCHORS
    .map((a, i) => ({ a, i, fit: sectorFit(a.lat, a.lon, bearingFrom) }))
    .filter(({ a }) => kinds.includes(a.kind))
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

export function predictedSitesFor(
  cells: SiteCell[],
  phen: { bearingFrom: number | null; flightClass: string | null },
  today: Date,
): PredictedSite[] {
  const history = historySites(cells, phen.bearingFrom, today);
  if (history.length >= 1) return history;
  return anchorSites(phen.flightClass, phen.bearingFrom);
}
