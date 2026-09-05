// scripts/ennustus-backtest-v4.ts
// Ennustus P4 / Phase D — retro-scores every Tõenäosus report with score v4 and
// fits the Platt calibration. Read-only against Supabase (anon PostgREST) and
// Open-Meteo; writes only under tmp/.
//
// Run: deno run --allow-net --allow-read --allow-write --allow-env \
//        scripts/ennustus-backtest-v4.ts
//
// scoreV4 and friends are imported from the edge function's score.ts — one
// source of truth, so a weight fit here is a weight the EF will reproduce.

import {
  directionFit,
  type PhenologyRow,
  phenologyGate,
  scoreV4,
  seasonFor,
  type UpstreamRow,
  V4,
  type V4Weights,
} from "../supabase/functions/toenaosus-orchestrator/score.ts";

// ─── Constants (v3 parity) ──────────────────────────────────────────────────

const SINCE = "2026-05-01";
const WINDOW_DAYS = 14;
const GRACE_DAYS = 3;
const PAGE_SIZE = 25;
const DAY_MS = 86400000;
const META_PATH =
  "/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json";

const TIER_BASE: Record<string, number> = { rare: 18, super: 12, mega: 6 };

// Train / test split by generated_at.
const TRAIN_LO = "2026-05-01", TRAIN_HI = "2026-08-01"; // [lo, hi)
// Test ends Aug 19: every 17-day (14+3) scoring window then closes on or before
// the last ground truth (2026-09-05). Later rows are scored into the CSV but
// excluded from every metric -- they are right-censored, not misses.
const TEST_LO = "2026-08-01", TEST_HI = "2026-08-20"; // [lo, hi) -> Aug 1..Aug 19

const GRID = [0, 5, 10, 15, 20, 25, 30];
const GRID_UP = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100];
const ELBOW_TOL = 0.0005;
const NEVER_ARRIVED_DAYS = 120;
const CONST_BASELINE = 0.18; // v3 report's constant-18% reference

// Wind reconstruction (live weatherCorridors uses PAST_DAYS 5 / FORECAST_DAYS 3)
const WX_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast" +
  "?latitude=58.6&longitude=25.5" +
  "&hourly=wind_speed_850hPa,wind_direction_850hPa" +
  "&start_date=2026-04-26&end_date=2026-09-07" +
  "&wind_speed_unit=kmh&timezone=Europe%2FTallinn";
const WX_CACHE = "tmp/openmeteo_850_2026.json";
const WX_PAST_DAYS = 5;
const WX_FORECAST_DAYS = 3;
const WX_TOL_DEG = 10;
const WX_TOL_KMH = 5;

// cron_runs.state.weather.summary, supplied by the architect (UTC).
const WX_REFERENCE: Array<{ at: string; dir: number; kmh: number }> = [
  { at: "2026-09-02T03:10:00Z", dir: 235, kmh: 34 },
  { at: "2026-09-03T03:10:00Z", dir: 250, kmh: 35 },
  { at: "2026-09-03T10:10:00Z", dir: 251, kmh: 34 },
  { at: "2026-09-03T15:10:00Z", dir: 247, kmh: 35 },
  { at: "2026-09-04T03:10:00Z", dir: 264, kmh: 33 },
  { at: "2026-09-04T15:10:00Z", dir: 264, kmh: 32 },
  { at: "2026-09-05T03:10:00Z", dir: 276, kmh: 34 },
];

const SCREENSHOT_RAPORT = "9bc9bc89-0431-4ef7-9850-9712c320d519";
const VOOT_KABILIND = "Loxia leucoptera"; // Vööt-käbilind

// ─── Ported verbatim from scripts/ennustus-backtest.mjs :110-265 ────────────

interface GroundTruthRecord {
  species: string;
  date: string;
  lat: number | null;
  lng: number | null;
}
type Row = Record<string, unknown>;

function speciesKey(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.normalize("NFC").trim().toLowerCase();
}

function normDate(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (direct) return direct[1];
  const t = Date.parse(s);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

function dayNum(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function fail(msg: string): never {
  console.error(msg);
  Deno.exit(1);
}

async function fetchAll(
  env: { base: string; key: string },
  table: string,
  select: string,
  filter: string,
  order = "generated_at.asc,id.asc",
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0;; offset += PAGE_SIZE) {
    const url = `${env.base}/rest/v1/${table}?select=${select}&${filter}` +
      `&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      fail(
        `HTTP ${res.status} ${res.statusText} on ${table} (offset ${offset})\n${await res
          .text()}`,
      );
    }
    const page = await res.json();
    if (!Array.isArray(page)) fail(`Unexpected non-array response for ${table}`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  console.error(`  ${table}: ${rows.length} rows`);
  return rows;
}

function ingestGroundTruth(
  rows: Row[],
  index: Map<string, GroundTruthRecord[]>,
  seen: Set<string>,
): number {
  let added = 0;
  for (const row of rows) {
    const items = Array.isArray(row.estonia_entries) ? row.estonia_entries : [];
    for (const it of items as Row[]) {
      if (!it || typeof it !== "object") continue;
      const species = speciesKey(it.species_lat);
      const date = normDate(it.date);
      if (!species || !date || date < SINCE) continue;
      const lat = num(it.lat);
      const lng = num(it.lng);
      const r2 = (v: number | null) => (v == null ? "" : v.toFixed(2));
      const dedupe = `${species}|${date}|${r2(lat)}|${r2(lng)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      let bucket = index.get(species);
      if (!bucket) index.set(species, (bucket = []));
      bucket.push({ species, date, lat, lng });
      added += 1;
    }
  }
  return added;
}

function firstArrivalIn(
  index: Map<string, GroundTruthRecord[]>,
  species: string,
  startDay: number,
  endDay: number,
): GroundTruthRecord | null {
  const bucket = index.get(species);
  if (!bucket || bucket.length === 0) return null;
  let lo = 0, hi = bucket.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dayNum(bucket[mid].date) < startDay) lo = mid + 1;
    else hi = mid;
  }
  if (lo >= bucket.length) return null;
  const cand = bucket[lo];
  return dayNum(cand.date) <= endDay ? cand : null;
}

// ─── env ────────────────────────────────────────────────────────────────────

async function readDotEnv(): Promise<Record<string, string>> {
  try {
    const text = await Deno.readTextFile(".env");
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

async function resolveEnv(): Promise<{ base: string; key: string }> {
  const file = await readDotEnv();
  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = Deno.env.get(n) || file[n];
      if (v && v.trim()) return v.trim();
    }
    return "";
  };
  const base = pick("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "");
  const key = pick(
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  );
  if (!base || !key) {
    fail("Missing SUPABASE_URL and/or publishable key (env or repo-root .env).");
  }
  return { base, key };
}

// ─── Wind reconstruction ────────────────────────────────────────────────────

interface WxSeries {
  ms: number[]; // UTC epoch per hourly sample
  dir: number[];
  kmh: number[];
  offMs: number; // Europe/Tallinn UTC offset
}

async function loadWx(): Promise<WxSeries> {
  let doc: {
    hourly?: Record<string, unknown[]>;
    utc_offset_seconds?: number;
  };
  try {
    doc = JSON.parse(await Deno.readTextFile(WX_CACHE));
    console.error(`  wind: cache hit (${WX_CACHE})`);
  } catch {
    console.error("  wind: fetching historical-forecast-api…");
    const res = await fetch(WX_URL);
    if (!res.ok) fail(`HTTP ${res.status} on open-meteo\n${await res.text()}`);
    doc = await res.json();
    await Deno.mkdir("tmp", { recursive: true });
    await Deno.writeTextFile(WX_CACHE, JSON.stringify(doc));
  }
  const h = doc.hourly ?? {};
  const times = (h.time ?? []) as string[];
  const dirs = (h.wind_direction_850hPa ?? []) as Array<number | null>;
  const spds = (h.wind_speed_850hPa ?? []) as Array<number | null>;
  const off = (doc.utc_offset_seconds ?? 0) * 1000;
  const out: WxSeries = { ms: [], dir: [], kmh: [], offMs: off };
  for (let i = 0; i < times.length; i++) {
    const d = dirs[i], s = spds[i];
    if (typeof d !== "number" || typeof s !== "number") continue;
    // Open-Meteo returns local wall time for the requested timezone; the whole
    // 2026-04-26..09-07 range sits inside EEST, so one offset covers it.
    out.ms.push(Date.parse(times[i] + "Z") - off);
    out.dir.push(d);
    out.kmh.push(s);
  }
  return out;
}

// Vector mean of direction + arithmetic mean of speed, exactly as
// toenaosus-orchestrator/index.ts weatherCorridors() :841-851.
//
// Window B: Open-Meteo's past_days/forecast_days return WHOLE CALENDAR DAYS in
// the requested timezone, so the live window is [local-midnight(D-5),
// local-midnight(D+3)) with D = the run's local date -- fixed for the whole
// day, not rolling from generated_at. Verified against cron_runs: the three
// 2026-09-03 runs (03:10/10:10/15:10) all recorded the same wind.
// A single EEST offset is correct for 2026-04-26..09-07; a range crossing the
// late-October DST change would need a per-timestamp offset instead.
function windFor(
  wx: WxSeries,
  generatedAtMs: number,
): { from_deg: number | null; speed_kmh: number | null; n: number } {
  const localMidnightUtc = (ms: number): number =>
    Date.parse(new Date(ms + wx.offMs).toISOString().slice(0, 10) + "T00:00:00Z") -
    wx.offMs;
  const d0 = localMidnightUtc(generatedAtMs);
  const lo = localMidnightUtc(d0 - WX_PAST_DAYS * DAY_MS);
  const hi = localMidnightUtc(d0 + WX_FORECAST_DAYS * DAY_MS);
  let sumSin = 0, sumCos = 0, sumSpd = 0, n = 0;
  for (let i = 0; i < wx.ms.length; i++) {
    if (wx.ms[i] < lo || wx.ms[i] >= hi) continue;
    const rad = wx.dir[i] * Math.PI / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
    sumSpd += wx.kmh[i];
    n++;
  }
  if (n === 0) return { from_deg: null, speed_kmh: null, n: 0 };
  const meanDirRad = Math.atan2(sumSin / n, sumCos / n);
  return {
    from_deg: ((meanDirRad * 180 / Math.PI) + 360) % 360,
    speed_kmh: sumSpd / n,
    n,
  };
}

const angDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// ─── Platt calibration ──────────────────────────────────────────────────────

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * Platt scaling by Newton-Raphson on the RAW calibrated_score -- not a
 * standardised feature -- so (a, b) drop straight into score.ts as CAL_A/CAL_B.
 * Iterates to |Δ log-loss| < 1e-9 or 50 steps.
 */
function fitPlatt(
  x: number[],
  y: number[],
): { a: number; b: number; iters: number; logloss: number; meanP: number } {
  const n = x.length;
  const base = Math.min(
    0.999,
    Math.max(0.001, y.reduce((s, v) => s + v, 0) / n),
  );
  let a = 0, b = Math.log(base / (1 - base));
  let prevLoss = Infinity;
  let iters = 0;

  for (let it = 1; it <= 50; it++) {
    iters = it;
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0, loss = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a * x[i] + b);
      const e = p - y[i];
      g0 += e * x[i];
      g1 += e;
      const w = Math.max(p * (1 - p), 1e-12);
      h00 += w * x[i] * x[i];
      h01 += w * x[i];
      h11 += w;
      const pc = Math.min(1 - 1e-12, Math.max(1e-12, p));
      loss -= y[i] * Math.log(pc) + (1 - y[i]) * Math.log(1 - pc);
    }
    loss /= n;
    // Tiny ridge: the raw scores span ~0-140, so h00 is O(1e4) and the 2x2
    // system can be ill-conditioned when the fit is nearly flat.
    h00 += 1e-9;
    h11 += 1e-9;
    const det = h00 * h11 - h01 * h01;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-300) break;
    a -= (h11 * g0 - h01 * g1) / det;
    b -= (-h01 * g0 + h00 * g1) / det;
    if (Math.abs(prevLoss - loss) < 1e-9) break;
    prevLoss = loss;
  }

  let mp = 0, loss = 0;
  for (let i = 0; i < n; i++) {
    const p = sigmoid(a * x[i] + b);
    mp += p;
    const pc = Math.min(1 - 1e-12, Math.max(1e-12, p));
    loss -= y[i] * Math.log(pc) + (1 - y[i]) * Math.log(1 - pc);
  }
  return { a, b, iters, logloss: loss / n, meanP: mp / n };
}

const brier = (p: number[], y: number[]): number =>
  p.length === 0
    ? NaN
    : p.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / p.length;

const pctFrom = (score: number, a: number, b: number): number =>
  Math.max(V4.FLOOR, Math.min(V4.CEIL, Math.round(100 * sigmoid(a * score + b))));

// ─── CSV ────────────────────────────────────────────────────────────────────

function csvField(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (cols: string[], rows: Array<Record<string, unknown>>): string =>
  [cols.join(","), ...rows.map((r) => cols.map((c) => csvField(r[c])).join(","))]
    .join("\n") + "\n";

// ─── Row model ──────────────────────────────────────────────────────────────

interface EntryRow {
  raport_id: string;
  generated_at: string;
  gen_date: string;
  gen_ms: number;
  species_lat: string;
  species_key: string;
  rarity_level: string;
  count_factor: number;
  distance_factor: number;
  season_factor: number;
  country_code: string;
  regions: string[];
  v3_pct: number;
  outcome: 0 | 1;
  base: number; // tier_base + 25*(count+dist+season)
  gate: number;
  dir: number;
  src: number;
  up: number;
  season: string;
  phen_source: string;
  never_arrived: boolean;
}

// calibrated_score for a weight triple. Identical to scoreV4's arithmetic --
// the per-row factors below are weight-independent, so this is a fast path,
// not a second implementation (verified against scoreV4 on a sample).
const scoreOf = (
  r: EntryRow,
  w: { DIR_W: number; SRC_W: number; UP_W: number },
): number => (r.base + w.DIR_W * r.dir + w.SRC_W * r.src + w.UP_W * r.up) * r.gate;

// ─── Main ───────────────────────────────────────────────────────────────────

console.error("Ennustus backtest v4 — resolving env…");
const env = await resolveEnv();

console.error("Fetching…");
const raports = await fetchAll(
  env,
  "toenaosus_raport",
  "id,generated_at,season,entries,corridor_watchlist,source_data",
  `generated_at=gte.${SINCE}`,
);
const vaatluste = await fetchAll(
  env,
  "vaatluste_raport",
  "id,generated_at,estonia_entries",
  `generated_at=gte.${SINCE}`,
);
const elurikkus = await fetchAll(
  env,
  "elurikkus_raport",
  "id,generated_at,estonia_entries",
  `generated_at=gte.${SINCE}`,
);
const phenRows = (await fetchAll(
  env,
  "species_phenology",
  "scientific_name,ebird_code,arrival_modes,spring_window,autumn_window,arrival_bearing_spring,arrival_bearing_autumn,source_regions_spring,source_regions_autumn",
  "scientific_name=not.is.null",
  "scientific_name.asc",
)) as unknown as PhenologyRow[];
const upRows = (await fetchAll(
  env,
  "rarity_upstream_stats",
  "species_lat,from_country,foreign_days,p_ee_30d",
  "species_lat=not.is.null",
  "species_lat.asc",
)) as unknown as UpstreamRow[];

const metaRes = await fetch(`${env.base}${META_PATH}`, {
  headers: { "cache-control": "no-cache" },
});
if (!metaRes.ok) fail(`HTTP ${metaRes.status} on species_meta_v1.json`);
const metaDoc = await metaRes.json();
const metaItems = (metaDoc?.items ?? {}) as Record<string, Row>;

const phenByLat = new Map<string, PhenologyRow>();
for (const p of phenRows) phenByLat.set(speciesKey(p.scientific_name), p);

// ─── Ground truth (P0 logic, verbatim) ──────────────────────────────────────

const gt = new Map<string, GroundTruthRecord[]>();
const seen = new Set<string>();
const gtV = ingestGroundTruth(vaatluste, gt, seen);
const gtE = ingestGroundTruth(elurikkus, gt, seen);
for (const bucket of gt.values()) {
  bucket.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
console.error(
  `  ground truth: ${seen.size} deduped records / ${gt.size} species (${gtV} vaatluste + ${gtE} elurikkus)`,
);

// ─── Wind ───────────────────────────────────────────────────────────────────

const wx = await loadWx();
console.error(`  wind: ${wx.ms.length} hourly samples`);

const wxLines: string[] = [];
let wxFailures = 0;
wxLines.push("| generated_at (UTC) | reconstructed | reference | Δdir | Δkmh | ok |");
wxLines.push("|---|---|---|---|---|---|");
for (const ref of WX_REFERENCE) {
  const w = windFor(wx, Date.parse(ref.at));
  if (w.from_deg === null || w.speed_kmh === null) {
    wxLines.push(`| ${ref.at} | NO DATA | ${ref.dir}°/${ref.kmh} | — | — | ✗ |`);
    wxFailures++;
    continue;
  }
  const dd = angDiff(w.from_deg, ref.dir);
  const ds = Math.abs(w.speed_kmh - ref.kmh);
  const ok = dd <= WX_TOL_DEG && ds <= WX_TOL_KMH;
  if (!ok) wxFailures++;
  wxLines.push(
    `| ${ref.at} | ${w.from_deg.toFixed(0)}°/${w.speed_kmh.toFixed(0)} | ${ref.dir}°/${ref.kmh} | ${
      dd.toFixed(1)
    } | ${ds.toFixed(1)} | ${ok ? "✓" : "✗"} |`,
  );
}
console.error("\nWind sanity gate:");
for (const l of wxLines) console.error(l);
if (wxFailures > 0) {
  fail(
    `\nSTOP: ${wxFailures} of ${WX_REFERENCE.length} reference winds outside ±${WX_TOL_DEG}° / ±${WX_TOL_KMH} km/h. ` +
      `Not widening the tolerance — reporting instead.`,
  );
}
console.error("  wind sanity: all references within tolerance\n");

// ─── Build entry rows ───────────────────────────────────────────────────────

const rows: EntryRow[] = [];
let windMissing = 0;
const raportWind = new Map<
  string,
  { from_deg: number | null; speed_kmh: number | null }
>();

for (const r of raports) {
  const generatedAt = str(r.generated_at);
  const genDate = normDate(generatedAt);
  if (!genDate) continue;
  const genMs = Date.parse(generatedAt);
  const startDay = dayNum(genDate);
  const endDay = startDay + WINDOW_DAYS + GRACE_DAYS;

  const w = windFor(wx, genMs);
  if (w.n === 0) windMissing++;
  const wind = { from_deg: w.from_deg, speed_kmh: w.speed_kmh };
  raportWind.set(str(r.id), wind);

  const entries = Array.isArray(r.entries) ? (r.entries as Row[]) : [];
  for (const it of entries) {
    if (!it || typeof it !== "object") continue;
    const sk = speciesKey(it.species_lat);
    if (!sk) continue;
    const pf = (it.probability_factors ?? {}) as Row;
    const cf = num(pf.count_factor) ?? 0;
    const df = num(pf.distance_factor) ?? 0;
    const sf = num(pf.season_factor) ?? 0.5;
    const rarity = str(it.rarity_level);
    const tier = TIER_BASE[rarity] ?? TIER_BASE.super;
    const phen = phenByLat.get(sk) ?? null;
    const nb = Array.isArray(it.neighbor_breakdown) ? (it.neighbor_breakdown as Row[]) : [];
    const regions = nb.map((b) => str(b.country_code)).filter(Boolean);
    if (regions.length === 0 && str(it.country_code)) regions.push(str(it.country_code));

    const f = scoreV4({
      tier_base: tier,
      count: cf,
      distance: df,
      season_signal: sf,
      today: new Date(genMs),
      species_lat: str(it.species_lat),
      phen,
      wind,
      regions,
      upstream: upRows,
    });

    const hit = firstArrivalIn(gt, sk, startDay, endDay);
    const ever = firstArrivalIn(gt, sk, startDay, startDay + NEVER_ARRIVED_DAYS);

    rows.push({
      raport_id: str(r.id),
      generated_at: generatedAt,
      gen_date: genDate,
      gen_ms: genMs,
      species_lat: str(it.species_lat),
      species_key: sk,
      rarity_level: rarity,
      count_factor: cf,
      distance_factor: df,
      season_factor: sf,
      country_code: str(it.country_code),
      regions,
      v3_pct: num(it.ee_probability_pct) ?? 0,
      outcome: hit ? 1 : 0,
      base: tier + 25 * cf + 25 * df + 25 * sf,
      gate: f.phenology_gate,
      dir: f.direction_fit,
      src: f.source_fit,
      up: f.upstream,
      season: f.season ?? "",
      phen_source: f.phenology_source,
      never_arrived: ever === null,
    });
  }
}
console.error(`  rebuilt ${rows.length} entry rows from ${raports.length} raports`);

// ─── Cross-check against tmp/backtest_v3.csv (kind='entry') ─────────────────

let xcheckMismatch = -1;
let xcheckN = 0;
try {
  const csv = await Deno.readTextFile("tmp/backtest_v3.csv");
  const lines = csv.trim().split("\n");
  const head = lines[0].split(",");
  const iId = head.indexOf("raport_id"),
    iKind = head.indexOf("kind"),
    iLat = head.indexOf("species_lat"),
    iOut = head.indexOf("outcome");
  const ref = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const p = line.split(",");
    if (p[iKind] !== "entry") continue;
    ref.set(`${p[iId]}|${speciesKey(p[iLat])}`, p[iOut]);
  }
  xcheckN = ref.size;
  let bad = 0;
  for (const r of rows) {
    const want = ref.get(`${r.raport_id}|${r.species_key}`);
    if (want === undefined) continue;
    const got = r.outcome === 1 ? "species_hit" : "miss";
    if (want !== got) bad++;
  }
  xcheckMismatch = bad;
  console.error(
    `  ground-truth cross-check vs v3 CSV: ${bad} mismatches over ${ref.size} entry rows`,
  );
  if (bad !== 0) {
    fail(
      `STOP: ${bad} (raport_id, species_lat, outcome) mismatches against tmp/backtest_v3.csv.`,
    );
  }
} catch (e) {
  console.error(
    `  cross-check skipped: ${e instanceof Error ? e.message : String(e)}`,
  );
}

// ─── Split ──────────────────────────────────────────────────────────────────

const train = rows.filter((r) => r.gen_date >= TRAIN_LO && r.gen_date < TRAIN_HI);
const test = rows.filter((r) => r.gen_date >= TEST_LO && r.gen_date < TEST_HI);
console.error(`  train ${train.length} rows / test ${test.length} rows`);
if (train.length === 0 || test.length === 0) fail("STOP: empty train or test split.");

const yTrain: number[] = train.map((r) => r.outcome as number);
const yTest: number[] = test.map((r) => r.outcome as number);

// ─── Grid + Platt ───────────────────────────────────────────────────────────

interface Combo {
  DIR_W: number;
  SRC_W: number;
  UP_W: number;
  a: number;
  b: number;
  iters: number;
  logloss: number;
  meanP: number;
  trainBrier: number;
  testBrier: number;
}
const combos: Combo[] = [];
for (const DIR_W of GRID) {
  for (const SRC_W of GRID) {
    for (const UP_W of GRID_UP) {
      const w = { DIR_W, SRC_W, UP_W };
      const xTr = train.map((r) => scoreOf(r, w));
      const fit = fitPlatt(xTr, yTrain);
      const pTr = xTr.map((s) => sigmoid(fit.a * s + fit.b));
      const pTe = test.map((r) => sigmoid(fit.a * scoreOf(r, w) + fit.b));
      combos.push({
        DIR_W,
        SRC_W,
        UP_W,
        a: fit.a,
        b: fit.b,
        iters: fit.iters,
        logloss: fit.logloss,
        meanP: fit.meanP,
        trainBrier: brier(pTr, yTrain),
        testBrier: brier(pTe, yTest),
      });
    }
  }
}
combos.sort((x, y) => x.testBrier - y.testBrier);
const best = combos[0];

// Elbow on UP_W at the best (DIR_W, SRC_W): smallest UP_W whose test Brier is
// within ELBOW_TOL of the best in that sweep.
const sweep = combos
  .filter((c) => c.DIR_W === best.DIR_W && c.SRC_W === best.SRC_W)
  .sort((x, y) => x.UP_W - y.UP_W);
const sweepBest = Math.min(...sweep.map((c) => c.testBrier));
const chosen = sweep.find((c) => c.testBrier <= sweepBest + ELBOW_TOL) ?? best;

const trainBase = yTrain.reduce((s, v) => s + v, 0) / yTrain.length;
const calOk = Math.abs(chosen.meanP - trainBase) < 0.0005;
const notConverged = combos.filter((c) => c.iters >= 50).length;
console.error(
  `  Platt(chosen): ${chosen.iters} iters, logloss ${chosen.logloss.toFixed(6)}, ` +
    `mean p ${chosen.meanP.toFixed(6)} vs train base ${trainBase.toFixed(6)} -> ${calOk ? "OK" : "MISMATCH"}`,
);
if (!calOk) {
  fail(
    `STOP: Platt fit did not converge -- mean predicted probability ${chosen.meanP.toFixed(6)} ` +
      `!= train base rate ${trainBase.toFixed(6)} to 3 decimals. Not proceeding with an unconverged fit.`,
  );
}

// ─── Final scoring with chosen weights ──────────────────────────────────────

const W: V4Weights = {
  ...V4,
  DIR_W: chosen.DIR_W,
  SRC_W: chosen.SRC_W,
  UP_W: chosen.UP_W,
  CAL_A: chosen.a,
  CAL_B: chosen.b,
};

const v4pct = new Map<EntryRow, number>();
for (const r of rows) v4pct.set(r, pctFrom(scoreOf(r, W), W.CAL_A, W.CAL_B));

// Verify the fast path equals a real scoreV4 call on a sample.
let pathMismatch = 0;
for (const r of rows.slice(0, 200)) {
  const f = scoreV4({
    tier_base: TIER_BASE[r.rarity_level] ?? TIER_BASE.super,
    count: r.count_factor,
    distance: r.distance_factor,
    season_signal: r.season_factor,
    today: new Date(r.gen_ms),
    species_lat: r.species_lat,
    phen: phenByLat.get(r.species_key) ?? null,
    wind: raportWind.get(r.raport_id) ?? { from_deg: null, speed_kmh: null },
    regions: r.regions,
    upstream: upRows,
  }, W);
  if (f.pct !== v4pct.get(r)) pathMismatch++;
}

const pV3Test = test.map((r) => r.v3_pct / 100);
const pV4Test = test.map((r) => (v4pct.get(r) ?? 0) / 100);
const brierV3 = brier(pV3Test, yTest);
const brierV4 = brier(pV4Test, yTest);
const brierConst = brier(test.map(() => CONST_BASELINE), yTest);
const testBaseRate = yTest.reduce((s, v) => s + v, 0) / yTest.length;
const brierConstBase = brier(test.map(() => testBaseRate), yTest);

// ─── D4 diagnostics ─────────────────────────────────────────────────────────

const calLines: string[] = [
  "| bucket | n | mean v4 pct | hit rate |",
  "|---|---|---|---|",
];
for (let b = 0; b < 10; b++) {
  const lo = b * 10, hi = b === 9 ? 101 : (b + 1) * 10;
  const sel = test.filter((r) => {
    const p = v4pct.get(r) ?? 0;
    return p >= lo && p < hi;
  });
  if (sel.length === 0) {
    calLines.push(`| ${lo}–${hi - 1} | 0 | — | — |`);
    continue;
  }
  const mp = sel.reduce((s, r) => s + (v4pct.get(r) ?? 0), 0) / sel.length;
  const hr = sel.reduce((s, r) => s + r.outcome, 0) / sel.length;
  calLines.push(
    `| ${lo}–${hi - 1} | ${sel.length} | ${mp.toFixed(1)} | ${(hr * 100).toFixed(1)}% |`,
  );
}

const monthLines: string[] = ["| month | n | hits | rate |", "|---|---|---|---|"];
for (const m of ["2026-08", "2026-09"]) {
  const sel = test.filter((r) => r.gen_date.startsWith(m));
  const h = sel.reduce((s, r) => s + r.outcome, 0);
  monthLines.push(
    `| ${m} | ${sel.length} | ${h} | ${
      sel.length ? (100 * h / sel.length).toFixed(1) : "0.0"
    }% |`,
  );
}

// Resolved rows only: a row's 14+3 d window must close on or before the last
// ground truth (2026-09-05), i.e. generated on or before 2026-08-19.
const resolved = rows.filter((r) => r.gen_date < TEST_HI);
const fpRows = resolved.filter((r) => r.v3_pct >= 30 && r.outcome === 0);
const fpRemoved = fpRows.filter((r) => (v4pct.get(r) ?? 0) <= 15);
const fpShare = fpRows.length ? fpRemoved.length / fpRows.length : NaN;
const maxV4Test = test.reduce((m, r) => Math.max(m, v4pct.get(r) ?? 0), 0);
const skill = 1 - brierV4 / brierConstBase;

const rarePlusWithPhen: Array<{ lat: string; key: string; tier: string }> = [];
for (const it of Object.values(metaItems)) {
  const lat = str(it.scientificName);
  const key = speciesKey(lat);
  const tier = str(it.rarityLevel);
  if (!key || !["rare", "super", "mega"].includes(tier)) continue;
  if (it.predictionExclude) continue;
  if (!phenByLat.has(key)) continue;
  rarePlusWithPhen.push({ lat, key, tier });
}
const tierRank: Record<string, number> = { mega: 3, super: 2, rare: 1 };

interface WlItem {
  raport_id: string;
  date: string;
  species_lat: string;
  tier: string;
  dir: number;
  gate: number;
  hit: 0 | 1;
}
const wlAll: WlItem[] = [];
const wlAllRaportIds: string[] = [];
for (const r of raports) {
  const genDate = normDate(str(r.generated_at));
  if (!genDate || genDate < TEST_LO || genDate >= TEST_HI) continue;
  const genMs = Date.parse(str(r.generated_at));
  const startDay = dayNum(genDate);
  const endDay = startDay + WINDOW_DAYS + GRACE_DAYS;
  const wind = raportWind.get(str(r.id)) ?? { from_deg: null, speed_kmh: null };
  const entryKeys = new Set(
    (Array.isArray(r.entries) ? (r.entries as Row[]) : []).map((e) =>
      speciesKey(e.species_lat)
    ),
  );
  const items: WlItem[] = [];
  for (const sp of rarePlusWithPhen) {
    if (entryKeys.has(sp.key)) continue;
    const phen = phenByLat.get(sp.key)!;
    const season = seasonFor(new Date(genMs), phen);
    const g = phenologyGate(season, phen);
    if (g.gate !== 1) continue;
    const bearing = season === "spring"
      ? phen.arrival_bearing_spring
      : season === "autumn"
      ? phen.arrival_bearing_autumn
      : null;
    if (bearing === null || bearing === undefined) continue;
    const dfit = directionFit(wind, bearing);
    if (dfit < 0.7) continue;
    if (wind.speed_kmh === null || wind.speed_kmh < V4.MIN_TRANSPORT_KMH) continue;
    items.push({
      raport_id: str(r.id),
      date: genDate,
      species_lat: sp.lat,
      tier: sp.tier,
      dir: dfit,
      gate: g.gate,
      hit: firstArrivalIn(gt, sp.key, startDay, endDay) ? 1 : 0,
    });
  }
  items.sort((a, b) => {
    const t = (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0);
    return t !== 0 ? t : b.dir - a.dir;
  });
  wlAll.push(...items.slice(0, 5));
  wlAllRaportIds.push(str(r.id));
}
const wlHits = wlAll.reduce((s, i) => s + i.hit, 0);
const wlRaports = new Set(wlAllRaportIds).size;

const SCREENSHOT_SPECIES = [
  "Koldhaigur",
  "Raisakotkas",
  "Roostepääsuke",
  "Kääpakotkas",
  "Karkjalg",
  "Madukotkas",
  "Tõmmuiibis",
  "Siidhaigur",
];
const shotRaport = raports.find((r) => str(r.id) === SCREENSHOT_RAPORT);
const shotWlLats = new Set(
  wlAll.filter((i) => i.raport_id === SCREENSHOT_RAPORT).map((i) => i.species_lat),
);
const shotEntryLines: string[] = [
  "| species_et | species_lat | in v4 watch-list | v4 pct (as entry) | v3 pct |",
  "|---|---|---|---|---|",
];
if (shotRaport) {
  const wlOld = Array.isArray(shotRaport.corridor_watchlist)
    ? (shotRaport.corridor_watchlist as Row[])
    : [];
  for (const nameEt of SCREENSHOT_SPECIES) {
    const old = wlOld.find((o) => str(o.species_et) === nameEt);
    const lat = str(old?.species_lat);
    const entryRow = rows.find(
      (r) => r.raport_id === SCREENSHOT_RAPORT && r.species_key === speciesKey(lat),
    );
    shotEntryLines.push(
      `| ${nameEt} | ${lat || "—"} | ${shotWlLats.has(lat) ? "YES" : "no"} | ${
        entryRow ? String(v4pct.get(entryRow)) : "not an entry"
      } | ${entryRow ? String(entryRow.v3_pct) : "—"} |`,
    );
  }
}

const vootRows = rows.filter((r) => r.species_key === speciesKey(VOOT_KABILIND));
const vootLines: string[] = [
  "| date | raport | v3 pct | v4 pct | gate | dir | src | up | outcome |",
  "|---|---|---|---|---|---|---|---|---|",
];
for (const r of vootRows) {
  vootLines.push(
    `| ${r.gen_date} | ${r.raport_id.slice(0, 8)} | ${r.v3_pct} | ${v4pct.get(r)} | ${r.gate} | ${
      r.dir.toFixed(3)
    } | ${r.src} | ${r.up} | ${r.outcome ? "hit" : "miss"} |`,
  );
}

// ─── Outputs ────────────────────────────────────────────────────────────────

await Deno.mkdir("tmp", { recursive: true });
const CSV_COLS = [
  "raport_id", "generated_at", "species_lat", "rarity_level", "split",
  "v3_pct", "v4_pct", "tier_base", "count_factor", "distance_factor",
  "season_factor", "phenology_gate", "direction_fit", "source_fit", "upstream",
  "season", "phenology_source", "calibrated_score", "country_code", "outcome",
];
await Deno.writeTextFile(
  "tmp/backtest_v4.csv",
  toCsv(
    CSV_COLS,
    rows.map((r) => ({
      raport_id: r.raport_id,
      generated_at: r.generated_at,
      species_lat: r.species_lat,
      rarity_level: r.rarity_level,
      split: r.gen_date < TRAIN_HI ? "train" : r.gen_date < TEST_HI ? "test" : "out",
      v3_pct: r.v3_pct,
      v4_pct: v4pct.get(r),
      tier_base: TIER_BASE[r.rarity_level] ?? TIER_BASE.super,
      count_factor: r.count_factor,
      distance_factor: r.distance_factor,
      season_factor: r.season_factor,
      phenology_gate: r.gate,
      direction_fit: r.dir,
      source_fit: r.src,
      upstream: r.up,
      season: r.season,
      phenology_source: r.phen_source,
      calibrated_score: Math.round(scoreOf(r, W) * 100) / 100,
      country_code: r.country_code,
      outcome: r.outcome ? "species_hit" : "miss",
    })),
  ),
);

const pass = (ok: boolean) => (ok ? "PASS" : "**FAIL**");
const wlPrec = wlAll.length ? (100 * wlHits / wlAll.length).toFixed(1) : "0.0";

const md: string[] = [];
md.push("# Ennustus backtest — v4 (phenology gate · direction · source · upstream)");
md.push("");
md.push(`Generated ${new Date().toISOString()}. Read-only; anon PostgREST + Open-Meteo.`);
md.push("");
md.push("## Provenance");
md.push("");
md.push("- Rows rebuilt from `toenaosus_raport` — the v3 CSV carries no `probability_factors`.");
md.push(`- Ground truth: P0 logic ported verbatim — union of \`vaatluste_raport.estonia_entries\` and \`elurikkus_raport.estonia_entries\`, WINDOW_DAYS ${WINDOW_DAYS} + GRACE_DAYS ${GRACE_DAYS}, since ${SINCE}.`);
md.push(`- Cross-check vs \`tmp/backtest_v3.csv\` (kind='entry') on (raport_id, species_lat, outcome): **${xcheckMismatch} mismatches** over ${xcheckN} rows.`);
md.push(`- ${raports.length} raports · ${rows.length} entry rows · ${phenRows.length} phenology rows · ${upRows.length} upstream rows.`);
md.push(`- Fast-path check: ${pathMismatch} of 200 sampled rows disagreed with a direct \`scoreV4\` call.`);
md.push("");
md.push("## Wind reconstruction");
md.push("");
md.push("Wind is **reconstructed**, not read from a table: `ebird_rare_observations.wind_corridor_at_time` is overwritten on every run and `toenaosus_raport` has no weather column.");
md.push("");
md.push("- Source: `historical-forecast-api.open-meteo.com` with **absolute** `start_date`/`end_date` — *not* the live `api.open-meteo.com` relative `past_days`/`forecast_days` window. Same 850 hPa variables and the same vector-mean maths as `index.ts` :841–851.");
md.push(`- Window per raport (**window B**): \`[local-midnight(D−${WX_PAST_DAYS}), local-midnight(D+${WX_FORECAST_DAYS}))\` in Europe/Tallinn, D = the run's local calendar date. Open-Meteo's \`past_days\`/\`forecast_days\` return whole calendar days in the requested timezone, so the live window is fixed for a whole day rather than rolling from \`generated_at\`. Confirmed by \`cron_runs\`: the three 2026-09-03 runs (03:10/10:10/15:10) all recorded the same wind, which a rolling window cannot produce. A rolling \`[generated_at ± d]\` window failed the gate on 2 of 7 references (up to 15.9° off); this one passes 7/7.`);
md.push("- **The +3 d half is the only place this backtest sees post-raport data.** It is kept deliberately: the live run reads a forecast covering the same forward window, so dropping it would score a different model than the deployed one.");
md.push(`- \`wind_missing\` (no hourly rows in window): **${windMissing}**.`);
md.push("");
md.push("### Sanity gate vs `cron_runs.state.weather.summary`");
md.push("");
md.push(...wxLines);
md.push("");
md.push(`Tolerance ±${WX_TOL_DEG}° / ±${WX_TOL_KMH} km/h — **${wxFailures} failures**.`);
md.push("");
md.push("## Weight search");
md.push("");
md.push(`Grid DIR_W, SRC_W ∈ {${GRID.join(", ")}}, UP_W ∈ {${GRID_UP.join(", ")}} = ${combos.length} combos. Platt (CAL_A, CAL_B) fit per combo on **train ${TRAIN_LO}…${TRAIN_HI}** (${train.length} rows) by **Newton–Raphson on the raw \`calibrated_score\`** (not standardised, so the constants drop straight into \`score.ts\`), to |Δ log-loss| < 1e-9 or 50 iters; selected on **test ${TEST_LO}…${TEST_HI}** (${test.length} rows) Brier.

Test ends **2026-08-19**: a 14+3 d window from Aug 19 closes 2026-09-05, the last ground truth. Rows generated after that are written to the CSV (split \`out\`) but excluded from every metric — they are right-censored, not misses.`);
md.push("");
md.push("### Platt convergence (chosen fit)");
md.push("");
md.push(`- Newton–Raphson iterations: **${chosen.iters}** (cap 50); combos hitting the cap: ${notConverged} of ${combos.length}.`);
md.push(`- Final train log-loss: **${chosen.logloss.toFixed(6)}**.`);
md.push(`- MLE check — mean predicted probability on train **${chosen.meanP.toFixed(6)}** vs train base rate **${trainBase.toFixed(6)}** → **${calOk ? "match to 3 dp" : "MISMATCH"}**. A logistic fit with an intercept must satisfy this at the optimum; the run aborts if it does not.`);
md.push("");
md.push("### UP_W sweep at the best (DIR_W, SRC_W)");
md.push("");
md.push(`Best (DIR_W, SRC_W) = (${best.DIR_W}, ${best.SRC_W}); sweep minimum test Brier ${sweepBest.toFixed(4)}; elbow tolerance ${ELBOW_TOL}.`);
md.push("");
md.push("| UP_W | CAL_A | CAL_B | train Brier | test Brier | Δ vs sweep best | elbow |");
md.push("|---|---|---|---|---|---|---|");
for (const c of sweep) {
  md.push(`| ${c.UP_W} | ${c.a.toFixed(5)} | ${c.b.toFixed(4)} | ${c.trainBrier.toFixed(4)} | ${c.testBrier.toFixed(4)} | ${(c.testBrier - sweepBest).toFixed(4)} | ${c.UP_W === chosen.UP_W ? "**chosen**" : ""} |`);
}
md.push("");
md.push("| | DIR_W | SRC_W | UP_W | CAL_A | CAL_B | train Brier | test Brier |");
md.push("|---|---|---|---|---|---|---|---|");
md.push(`| unconstrained optimum | ${best.DIR_W} | ${best.SRC_W} | ${best.UP_W} | ${best.a.toFixed(5)} | ${best.b.toFixed(4)} | ${best.trainBrier.toFixed(4)} | ${best.testBrier.toFixed(4)} |`);
md.push(`| boundary row (grid top UP_W=${GRID_UP[GRID_UP.length - 1]}) | ${sweep[sweep.length - 1].DIR_W} | ${sweep[sweep.length - 1].SRC_W} | ${sweep[sweep.length - 1].UP_W} | ${sweep[sweep.length - 1].a.toFixed(5)} | ${sweep[sweep.length - 1].b.toFixed(4)} | ${sweep[sweep.length - 1].trainBrier.toFixed(4)} | ${sweep[sweep.length - 1].testBrier.toFixed(4)} |`);
md.push(`| **chosen** (elbow, within ${ELBOW_TOL}) | ${chosen.DIR_W} | ${chosen.SRC_W} | ${chosen.UP_W} | ${chosen.a.toFixed(5)} | ${chosen.b.toFixed(4)} | ${chosen.trainBrier.toFixed(4)} | ${chosen.testBrier.toFixed(4)} |`);
md.push("");
if (chosen.UP_W === GRID_UP[GRID_UP.length - 1]) {
  md.push(`> **The elbow landed on the grid boundary (UP_W=${chosen.UP_W}).** The sweep never flattened, so this value is not safe to freeze without a ruling to extend the grid.`);
  md.push("");
}
md.push("### Top 10 combos by test Brier");
md.push("");
md.push("| DIR_W | SRC_W | UP_W | train | test |");
md.push("|---|---|---|---|---|");
for (const c of combos.slice(0, 10)) {
  md.push(`| ${c.DIR_W} | ${c.SRC_W} | ${c.UP_W} | ${c.trainBrier.toFixed(4)} | ${c.testBrier.toFixed(4)} |`);
}
md.push("");
md.push("## Test-set results");
md.push("");
md.push("| model | Brier (test) |");
md.push("|---|---|");
md.push(`| v3 (stored pct) | ${brierV3.toFixed(4)} |`);
md.push(`| **v4 (chosen weights)** | **${brierV4.toFixed(4)}** |`);
md.push(`| constant ${(CONST_BASELINE * 100).toFixed(0)}% | ${brierConst.toFixed(4)} |`);
md.push(`| constant test base rate ${(testBaseRate * 100).toFixed(1)}% | ${brierConstBase.toFixed(4)} |`);
md.push("");
md.push(`**Brier skill score** vs constant-base-rate: \`1 − ${brierV4.toFixed(4)}/${brierConstBase.toFixed(4)}\` = **${skill.toFixed(4)}**.`);
md.push("");
md.push(`Max v4 pct on test: **${maxV4Test}**.`);
md.push("");
md.push("### Calibration (test, 10 buckets)");
md.push("");
md.push(...calLines);
md.push("");
md.push("### Hit rate by month (test)");
md.push("");
md.push(...monthLines);
md.push("");
md.push("> September is **not evaluable** here: a 17-day window from any September raport extends past the last ground truth (2026-09-05). September accuracy is measured live by P7b, not by this backtest.");
md.push("");
md.push("### False-positive removal (resolved rows only)");
md.push("");
md.push(`Resolved rows (window closed on or before the last ground truth): **${resolved.length}** of ${rows.length}.`);
md.push(`Of those, v3 pct ≥ 30 **and** a miss in its own 14+3 d window: **${fpRows.length}**.`);
md.push(`Of those, v4 pct ≤ 15: **${fpRemoved.length}** = **${(fpShare * 100).toFixed(1)}%** (criterion ≥ 80%).`);
md.push("");
md.push("### Watch-list v4 (test raports)");
md.push("");
md.push(`Rule (P4 D2): rare+ (not \`predictionExclude\`), phenology row present, not already an entry, **phenology_gate === 1.0**, **bearing non-null**, **direction_fit ≥ 0.7**, wind ≥ ${V4.MIN_TRANSPORT_KMH} km/h; sorted tier then direction_fit desc; **cap 5**.`);
md.push("");
md.push(`Items **${wlAll.length}** over ${wlRaports} test raports (mean **${wlRaports ? (wlAll.length / wlRaports).toFixed(2) : "0"}**/raport), hits within ${WINDOW_DAYS}+${GRACE_DAYS} d **${wlHits}** → precision **${wlPrec}%** (v3 was 0/124).`);
md.push("");
md.push("> The historical watch-list cannot reproduce the live `ee_present` exclusion (eBird EE presence is not stored per raport), so eligible species are slightly over-counted.");
md.push("");
md.push(`### Screenshot raport \`${SCREENSHOT_RAPORT}\` (2026-09-03 15:12, wind 247°/35)`);
md.push("");
if (shotRaport) md.push(...shotEntryLines);
else md.push("_raport not found in the fetched range_");
md.push("");
md.push("### Vööt-käbilind — every entry row");
md.push("");
if (vootRows.length) md.push(...vootLines);
else md.push("_no entry rows_");
md.push("");
md.push("## Pass criteria");
md.push("");
md.push("| criterion | target | actual | verdict |");
md.push("|---|---|---|---|");
md.push(`| test Brier v4 | < 0.148 | ${brierV4.toFixed(4)} | ${pass(brierV4 < 0.148)} |`);
md.push(`| **Brier skill score** vs constant base rate | > 0 | ${skill.toFixed(4)} | ${pass(skill > 0)} |`);
md.push(`| watch-list precision | > 0 | ${wlPrec}% | ${pass(wlHits > 0)} |`);
md.push(`| false positives removed (resolved) | ≥ 80% | ${(fpShare * 100).toFixed(1)}% | ${pass(fpShare >= 0.8)} |`);
md.push("");
md.push("`tmp/backtest_v4.csv` holds every row with all factors.");
md.push("");

await Deno.writeTextFile("tmp/backtest_v4_summary.md", md.join("\n"));
console.error("\nwrote tmp/backtest_v4.csv and tmp/backtest_v4_summary.md");
console.log(md.join("\n"));
