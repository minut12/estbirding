// supabase/functions/compute-ennustus/rateLayer.ts
// P189 Toenaosuse kaart: reporting-rate layer (species observation-days / all observation-days)
// per grid cell, smoothed with neighbouring cells. Pure functions, no imports (Deno + vitest).
// Effort comes from public.prob_grid_effort (P189a): gi = floor(lat / size), gj = floor(lon / size),
// period = (dayOfYear - 1) / 14 capped at 25, since 2010, bbox 57.3-59.9 / 21.3-28.5.
// Keep every constant below identical to that view.

export type EffortRow = { gi: number; gj: number; period: number; days_any: number };
export type SpeciesObs = { lat: number; lon: number; date: string };

// [gi, gj, ownAnyDays, ownSpeciesDays, estimate (0..1), neighbourEffortDays]
export type RateCell = [number, number, number, number, number, number];

export type RateLayer = {
  periods: number[];
  p0: number;
  maxEst: number;
  cells: RateCell[];
};

export type RateMeta = {
  v: 1;
  cellSize: number;
  today: string;
  currentPeriod: number;
  seasonMonths: number[];
  seasonLabel: string;
  monthDays: number[];
  w6: RateLayer;
  season: RateLayer;
};

export const RATE_BBOX = { minLat: 57.3, maxLat: 59.9, minLon: 21.3, maxLon: 28.5 };
export const RATE_MIN_DATE = '2010-01-01';
export const RATE_SHRINK_K = 15;
export const RATE_RADIUS = 2;
export const RATE_SEASON_SHARE = 0.97;
export const RATE_FILL_MIN_NEIGHBOURS = 3;
const PERIODS = 26;
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LAST_DAY = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const EN_DASH = '\u2013';

// 'YYYY-MM-DD' of "now" in Europe/Tallinn (the runtime clock is UTC).
export function tallinnToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// Day of year (1..366) for 'YYYY-MM-DD'; null when unparseable.
export function dayOfYear(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const t = Date.UTC(y, Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - Date.UTC(y, 0, 1)) / 86400000) + 1;
}

// 2-week period index, identical to the SQL view: least(25, (doy - 1) / 14).
export function periodOf(date: string): number | null {
  const doy = dayOfYear(date);
  if (doy === null) return null;
  return Math.min(PERIODS - 1, Math.floor((doy - 1) / 14));
}

// Month (0..11) of the first day of period p (reference non-leap year).
export function periodStartMonth(p: number): number {
  return new Date(Date.UTC(2025, 0, 1 + 14 * p)).getUTCMonth();
}

// Shortest circular run of months that holds at least `share` of the species' days.
// Ties go to the run with more days. No days -> all 12 months.
export function seasonMonthsFrom(monthDays: number[], share: number = RATE_SEASON_SHARE): number[] {
  const total = monthDays.reduce((s, v) => s + v, 0);
  const all = Array.from({ length: 12 }, (_, i) => i);
  if (total <= 0) return all;
  for (let len = 1; len <= 12; len++) {
    let bestStart = -1;
    let bestSum = -1;
    for (let start = 0; start < 12; start++) {
      let sum = 0;
      for (let k = 0; k < len; k++) sum += monthDays[(start + k) % 12];
      if (sum >= share * total && sum > bestSum) { bestSum = sum; bestStart = start; }
    }
    if (bestStart >= 0) return Array.from({ length: len }, (_, k) => (bestStart + k) % 12);
  }
  return all;
}

// Same "Mon D - Mon D" format as the old label (the map's _etDateLabel translates it).
export function seasonLabelFrom(months: number[]): string {
  if (months.length >= 12) return 'Jan 1 ' + EN_DASH + ' Dec 31';
  const first = months[0];
  const last = months[months.length - 1];
  return MONTHS_EN[first] + ' 1 ' + EN_DASH + ' ' + MONTHS_EN[last] + ' ' + MONTH_LAST_DAY[last];
}

function inBbox(lat: number, lon: number): boolean {
  return lat >= RATE_BBOX.minLat && lat <= RATE_BBOX.maxLat && lon >= RATE_BBOX.minLon && lon <= RATE_BBOX.maxLon;
}

const key = (gi: number, gj: number): string => gi + '|' + gj;

type PeriodCounts = Map<string, number[]>;

function emptyPeriods(): number[] {
  return new Array(PERIODS).fill(0);
}

// Species observation-days per cell and period (distinct dates), plus distinct days per month.
export function speciesCounts(obs: SpeciesObs[], cellSize: number): { byCell: PeriodCounts; monthDays: number[] } {
  const seenCell = new Set<string>();
  const seenMonth = new Set<string>();
  const byCell: PeriodCounts = new Map();
  const monthDays = new Array(12).fill(0);
  for (const o of obs) {
    const lat = Number(o.lat);
    const lon = Number(o.lon);
    const d = String(o.date || '').slice(0, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBbox(lat, lon)) continue;
    if (d.length !== 10 || d < RATE_MIN_DATE) continue;
    const p = periodOf(d);
    if (p === null) continue;
    const gi = Math.floor(lat / cellSize);
    const gj = Math.floor(lon / cellSize);
    const ck = key(gi, gj) + '|' + d;
    if (!seenCell.has(ck)) {
      seenCell.add(ck);
      const k = key(gi, gj);
      const arr = byCell.get(k) || emptyPeriods();
      arr[p] += 1;
      byCell.set(k, arr);
    }
    if (!seenMonth.has(d)) {
      seenMonth.add(d);
      monthDays[Number(d.slice(5, 7)) - 1] += 1;
    }
  }
  return { byCell, monthDays };
}

export function effortCounts(rows: EffortRow[]): PeriodCounts {
  const byCell: PeriodCounts = new Map();
  for (const r of rows) {
    const k = key(r.gi, r.gj);
    const arr = byCell.get(k) || emptyPeriods();
    arr[r.period] += Number(r.days_any) || 0;
    byCell.set(k, arr);
  }
  return byCell;
}

function sumPeriods(arr: number[] | undefined, periods: number[]): number {
  if (!arr) return 0;
  let s = 0;
  for (const p of periods) s += arr[p] || 0;
  return s;
}

const round = (v: number, dp: number): number => {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
};

// One layer (a set of periods): own days per cell, then a Gaussian neighbour sum over
// +-RATE_RADIUS cells, shrunk toward the species' Estonia-wide rate p0.
export function buildLayer(effort: PeriodCounts, species: PeriodCounts, periods: number[]): RateLayer {
  const own = new Map<string, { gi: number; gj: number; any: number; sp: number }>();
  let totAny = 0;
  let totSp = 0;
  const keys = new Set<string>([...effort.keys(), ...species.keys()]);
  for (const k of keys) {
    const sp = sumPeriods(species.get(k), periods);
    // Live species rows can postdate the nightly effort refresh: never let sp exceed any.
    const any = Math.max(sumPeriods(effort.get(k), periods), sp);
    if (any <= 0) continue;
    const [gi, gj] = k.split('|').map(Number);
    own.set(k, { gi, gj, any, sp });
    totAny += any;
    totSp += sp;
  }
  const p0 = totAny > 0 ? totSp / totAny : 0;

  // Candidates: every observed cell, plus unobserved cells with >= RATE_FILL_MIN_NEIGHBOURS
  // observed cells among their 8 neighbours (fills inland gaps, leaves open sea empty).
  const candidates = new Map<string, [number, number]>();
  const neighbourHits = new Map<string, number>();
  for (const c of own.values()) {
    candidates.set(key(c.gi, c.gj), [c.gi, c.gj]);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const nk = key(c.gi + di, c.gj + dj);
        if (own.has(nk)) continue;
        neighbourHits.set(nk, (neighbourHits.get(nk) || 0) + 1);
      }
    }
  }
  for (const [nk, hits] of neighbourHits) {
    if (hits >= RATE_FILL_MIN_NEIGHBOURS) {
      const [gi, gj] = nk.split('|').map(Number);
      candidates.set(nk, [gi, gj]);
    }
  }

  const cells: RateCell[] = [];
  let maxEst = 0;
  for (const [gi, gj] of candidates.values()) {
    let sa = 0;
    let ss = 0;
    for (let di = -RATE_RADIUS; di <= RATE_RADIUS; di++) {
      for (let dj = -RATE_RADIUS; dj <= RATE_RADIUS; dj++) {
        const c = own.get(key(gi + di, gj + dj));
        if (!c) continue;
        const w = Math.exp(-(di * di + dj * dj) / 2);
        sa += w * c.any;
        ss += w * c.sp;
      }
    }
    const est = (ss + RATE_SHRINK_K * p0) / (sa + RATE_SHRINK_K);
    const o = own.get(key(gi, gj));
    cells.push([gi, gj, o ? o.any : 0, o ? o.sp : 0, round(est, 5), round(sa, 1)]);
    if (est > maxEst) maxEst = est;
  }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { periods, p0: round(p0, 6), maxEst: round(maxEst, 5), cells };
}

// Full meta payload for ennustus_cells_cache.meta. Returns null when the species has no
// coordinate-bearing elurikkus days in the bbox since 2010 (the map then shows its placeholder).
export function buildRateMeta(args: {
  cellSize: number;
  effortRows: EffortRow[];
  obs: SpeciesObs[];
  today: string;
}): RateMeta | null {
  const { cellSize, effortRows, obs, today } = args;
  const { byCell, monthDays } = speciesCounts(obs, cellSize);
  if (monthDays.reduce((s, v) => s + v, 0) === 0) return null;
  const effort = effortCounts(effortRows);
  const k0 = periodOf(today) ?? 0;
  const w6Periods = [(k0 + PERIODS - 1) % PERIODS, k0, (k0 + 1) % PERIODS];
  const seasonMonths = seasonMonthsFrom(monthDays);
  const seasonSet = new Set(seasonMonths);
  const seasonPeriods = Array.from({ length: PERIODS }, (_, p) => p).filter((p) => seasonSet.has(periodStartMonth(p)));
  return {
    v: 1,
    cellSize,
    today,
    currentPeriod: k0,
    seasonMonths,
    seasonLabel: seasonLabelFrom(seasonMonths),
    monthDays,
    w6: buildLayer(effort, byCell, w6Periods),
    season: buildLayer(effort, byCell, seasonPeriods),
  };
}
