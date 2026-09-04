// Drafts species_phenology rows for review (Ennustus P2a).
//
// READ-ONLY. Anon PostgREST + one public storage object + api.gbif.org.
// Writes only under tmp/. No DB writes — P2b inserts from the APPROVED csv.
//
// Every derived value is deterministic and labelled `auto`. Where a rule does
// not fire the cell is left EMPTY on purpose: empty means "needs Kristian",
// never "no signal found, so here is a guess".
//
// Usage:
//   node scripts/ennustus-phenology-draft.mjs [--no-cache]
//
// Env (falls back to repo-root .env; values are never printed):
//   SUPABASE_URL              | VITE_SUPABASE_URL
//   SUPABASE_PUBLISHABLE_KEY  | VITE_SUPABASE_PUBLISHABLE_KEY | SUPABASE_ANON_KEY

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import process from 'node:process';

/** @typedef {Record<string, string>} DraftRow */

// ─── Constants ──────────────────────────────────────────────────────────────

const TIERS = /** @type {const} */ (['mega', 'super', 'rare']);
const HIST_COUNTRIES = /** @type {const} */ (['EE', 'FI', 'SE', 'LV', 'LT']);
const BATCH_SIZE = 50;

const GBIF = 'https://api.gbif.org/v1';
const UA = 'estbirds-phenology-draft/1.0';
const CONCURRENCY = 4;
const SPACING_MS = 150;
const RETRY_DELAY_MS = 2000;

const META_PATH = '/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json';

// Pooled-window rule: a month qualifies at >= 8 % of the pooled annual total.
const POOLED_WINDOW_SHARE = 0.08;
// EE-window rule: a month qualifies at >= 15 % of the EE histogram total.
const EE_WINDOW_SHARE = 0.15;
// Minimum EE rows in gbif_occurrences before the EE rule is trusted.
const EE_MIN_ROWS = 10;
// Flatness guard: share of the top 3 months of hist_pooled.
const FLAT_SEASONALITY = 0.45;

const SEASON_SHARE = 0.25;
const DISPERSAL_SHARE = 0.30;
const IRRUPTION_SHARE = 0.30;

const SPRING_MONTHS = [3, 4, 5, 6];
const AUTUMN_MONTHS = [8, 9, 10, 11];
const EE_SPRING_MONTHS = [3, 4, 5, 6];
const EE_AUTUMN_MONTHS = [7, 8, 9, 10, 11];
const DISPERSAL_FAMILIES = new Set(['Ardeidae', 'Threskiornithidae', 'Ciconiidae', 'Laridae']);

/** family -> flight_class (species_phenology check-constraint values) */
const FLIGHT_CLASS_BY_FAMILY = new Map([
  ['Accipitridae', 'raptor_soaring'], ['Pandionidae', 'raptor_soaring'], ['Falconidae', 'raptor_soaring'],
  ['Scolopacidae', 'wader'], ['Charadriidae', 'wader'], ['Recurvirostridae', 'wader'],
  ['Haematopodidae', 'wader'], ['Glareolidae', 'wader'], ['Burhinidae', 'wader'],
  ['Anatidae', 'waterbird'], ['Gaviidae', 'waterbird'], ['Podicipedidae', 'waterbird'],
  ['Rallidae', 'waterbird'], ['Gruidae', 'waterbird'],
  ['Laridae', 'seabird'], ['Alcidae', 'seabird'], ['Stercorariidae', 'seabird'],
  ['Procellariidae', 'seabird'], ['Hydrobatidae', 'seabird'], ['Sulidae', 'seabird'],
  ['Phalacrocoracidae', 'seabird'],
  ['Ardeidae', 'heron_stork'], ['Ciconiidae', 'heron_stork'], ['Threskiornithidae', 'heron_stork'],
  ['Pelecanidae', 'heron_stork'],
]);
const DEFAULT_FLIGHT_CLASS = 'passerine_nocturnal';

const CRUISE_KMH = {
  passerine_nocturnal: 45, raptor_soaring: 35, wader: 60,
  waterbird: 65, seabird: 50, heron_stork: 40,
};

// Inlined from supabase/migrations/20260606171314_a193fcc9-…sql:11-27 — the live
// corridor_species_tags table (verified identical, updated 2026-06-06). Inlined
// deliberately: the table is service_role-only, so anon reads return [] silently,
// and species_meta_v1.json carries no expected_corridors fallback.
const CORRIDOR_TAGS = new Map([
  ['Aegypius monachus', 'black_sea_pannonian'],
  ['Aquila heliaca', 'black_sea_pannonian'],
  ['Circaetus gallicus', 'black_sea_pannonian'],
  ['Ardeola ralloides', 'black_sea_pannonian'],
  ['Egretta garzetta', 'black_sea_pannonian'],
  ['Himantopus himantopus', 'black_sea_pannonian'],
  ['Merops apiaster', 'black_sea_pannonian'],
  ['Ichthyaetus melanocephalus', 'black_sea_pannonian'],
  ['Cecropis rufula', 'black_sea_pannonian'],
  ['Plegadis falcinellus', 'black_sea_pannonian'],
  ['Ichthyaetus ichthyaetus', 'caspian_central_asia'],
  ['Circus macrourus', 'caspian_central_asia'],
  ['Aquila nipalensis', 'caspian_central_asia'],
  ['Pastor roseus', 'caspian_central_asia'],
  ['Tetrax tetrax', 'caspian_central_asia'],
  ['Iduna caligata', 'caspian_central_asia'],
]);

/** corridor id -> {spring, autumn} bearing in degrees; null = leave the cell empty */
const CORRIDOR_BEARING = {
  black_sea_pannonian: { spring: 190, autumn: null },
  caspian_central_asia: { spring: 120, autumn: 100 },
  north_atlantic: { spring: null, autumn: 270 },
};

const SOURCE_REGIONS_SPRING = ['LV', 'LT', 'PL', 'BY', 'RU-KGD'];
const SOURCE_REGIONS_AUTUMN = ['FI', 'RU-LEN', 'RU-KR', 'RU-PSK', 'SE'];

const ESTONIA = { lat: 58.6, lon: 25.5 };
// Palearctic box for the breeding-centroid hint.
const PALEARCTIC = { latMin: 20, latMax: 80, lonMin: -30, lonMax: 120 };

/** Approximate country centroids (lat, lon) — covers every ISO-2 seen in the data. */
const COUNTRY_CENTROID = new Map(Object.entries({
  SE: [62.0, 15.0], US: [39.8, -98.6], NL: [52.2, 5.5], RU: [61.5, 105.0], FR: [46.6, 2.5],
  CA: [56.1, -106.3], ES: [40.2, -3.6], NO: [64.6, 17.9], MN: [46.9, 103.8], GB: [54.0, -2.0],
  CN: [35.9, 104.2], PT: [39.6, -8.0], DK: [56.0, 9.5], KZ: [48.0, 66.9], TR: [39.0, 35.2],
  TW: [23.7, 121.0], GR: [39.1, 21.8], IN: [20.6, 79.0], FI: [64.9, 26.0], IL: [31.0, 34.9],
  DE: [51.2, 10.4], JP: [36.2, 138.3], KR: [36.5, 127.9], BE: [50.6, 4.5], IS: [65.0, -19.0],
  BG: [42.7, 25.5], SJ: [78.0, 16.0], AU: [-25.3, 133.8], ZA: [-30.6, 22.9], KG: [41.2, 74.8],
  PL: [51.9, 19.1], MX: [23.6, -102.6], HU: [47.2, 19.5], RO: [45.9, 25.0], IT: [42.8, 12.6],
  UA: [48.4, 31.2], PE: [-9.2, -75.0], CO: [4.6, -74.3], GE: [42.3, 43.4], AR: [-38.4, -63.6],
  CR: [9.7, -83.8], AT: [47.5, 14.6], IR: [32.4, 53.7], AE: [23.4, 53.8], IE: [53.4, -8.2],
  CH: [46.8, 8.2], EE: [58.6, 25.5], KE: [0.0, 37.9], CL: [-35.7, -71.5], GL: [71.7, -42.6],
  PR: [18.2, -66.6], RS: [44.0, 21.0], AM: [40.1, 45.0], UZ: [41.4, 64.6], IM: [54.2, -4.5],
  MA: [31.8, -7.1], CZ: [49.8, 15.5], EG: [26.8, 30.8], ER: [15.2, 39.8], ET: [9.1, 40.5],
  VE: [6.4, -66.6], MR: [21.0, -10.9], NP: [28.4, 84.1], HR: [45.1, 15.2], BR: [-14.2, -51.9],
  PM: [46.9, -56.3], LT: [55.2, 23.9], BY: [53.7, 27.95],
}));

const CSV_COLUMNS = /** @type {const} */ ([
  'tier', 'species_et', 'scientific_name', 'ebird_code', 'taxon_key', 'family',
  'flight_class', 'cruise_kmh', 'arrival_modes', 'spring_window', 'autumn_window',
  'window_source', 'arrival_bearing_spring', 'arrival_bearing_autumn', 'bearing_source',
  'bearing_hint_breeding', 'bearing_hint_excluded',
  'source_regions_spring', 'source_regions_autumn', 'breeding_countries_top5',
  'ee_n', 'ee_hist_n', 'ee_months', 'seasonality',
  'hist_pooled', 'hist_ee', 'hist_fi', 'n_total', 'auto_status', 'refs_json', 'notes',
]);

const NO_CACHE = process.argv.includes('--no-cache');

// ─── Env ────────────────────────────────────────────────────────────────────

/** @param {string} msg */
function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

async function resolveEnv() {
  /** @type {Record<string,string>} */
  let file = {};
  try {
    const text = await readFile(new URL('../.env', import.meta.url), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (m) file[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch { file = {}; }
  const pick = (...names) => {
    for (const n of names) {
      const v = process.env[n] || file[n];
      if (v && v.trim()) return v.trim();
    }
    return '';
  };
  const base = pick('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
  const key = pick('SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  if (!base || !key) {
    fail('Missing SUPABASE_URL and/or publishable key — set them in the environment or repo-root .env.');
  }
  return { base, key };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const nfc = (v) => (typeof v === 'string' ? v.normalize('NFC').trim().toLowerCase() : '');
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pgArray = (arr) => `{${(arr || []).join(',')}}`;
const lastDay = (m) => new Date(Date.UTC(2000, m, 0)).getUTCDate();
const pad2 = (n) => String(n).padStart(2, '0');
const sum = (a) => a.reduce((x, y) => x + y, 0);

/** RFC4180 field: quote when the value holds a comma, quote, CR or LF. */
function csvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {readonly string[]} columns
 * @param {ReadonlyArray<DraftRow>} rows
 */
function toCsv(columns, rows) {
  const lines = [columns.map(csvField).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c] ?? '')).join(','));
  return `${lines.join('\n')}\n`;
}

/** Markdown table cell: escape pipes so a stray value cannot break the table. */
const mdCell = (v) => String(v ?? '').replace(/\|/g, '\\|') || '—';

/**
 * Runs tasks with bounded concurrency, preserving input order.
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<T[]>}
 */
async function pool(tasks, limit) {
  const out = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      out[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Initial great-circle bearing FROM a to b, degrees 0-359.
 * @param {{lat:number,lon:number}} a @param {{lat:number,lon:number}} b
 */
function bearingDeg(a, b) {
  const rad = Math.PI / 180;
  const dLon = (b.lon - a.lon) * rad;
  const y = Math.sin(dLon) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad)
          - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(dLon);
  return (Math.round(Math.atan2(y, x) / rad) + 360) % 360;
}

// ─── GBIF fetching (spaced, retried, cached) ────────────────────────────────

const cacheDir = new URL('../tmp/gbif-cache/', import.meta.url);
let lastRequestAt = 0;
const stats = { gbifCalls: 0, gbifCacheHits: 0, gbifFailures: 0, supabaseCalls: 0 };

async function spaced() {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + SPACING_MS - now);
  lastRequestAt = now + wait;
  if (wait > 0) await sleep(wait);
}

/**
 * Fetches one GBIF URL through the on-disk cache. Returns null on failure so a
 * single bad species degrades to auto_status=partial_fetch instead of aborting.
 * @param {string} url @param {string} cacheName
 * @returns {Promise<any|null>}
 */
async function gbifJson(url, cacheName) {
  const cacheFile = new URL(`${cacheName}.json`, cacheDir);
  if (!NO_CACHE) {
    try {
      const hit = JSON.parse(await readFile(cacheFile, 'utf8'));
      stats.gbifCacheHits += 1;
      return hit;
    } catch { /* cache miss */ }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await spaced();
    stats.gbifCalls += 1;
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    } catch {
      if (attempt === 0) { await sleep(RETRY_DELAY_MS); continue; }
      stats.gbifFailures += 1;
      return null;
    }
    if (res.ok) {
      const json = await res.json();
      await writeFile(cacheFile, JSON.stringify(json), 'utf8').catch(() => {});
      return json;
    }
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    stats.gbifFailures += 1;
    return null;
  }
  return null;
}

/**
 * 12-slot month histogram. GBIF omits zero months and sorts by count desc, so
 * seed zeros and fill by facet `name` — never index positionally.
 * @param {any|null} json @returns {number[]|null}
 */
function monthHistogram(json) {
  if (!json) return null;
  const hist = new Array(12).fill(0);
  for (const c of json.facets?.[0]?.counts || []) {
    const m = Number(c?.name);
    if (Number.isInteger(m) && m >= 1 && m <= 12) hist[m - 1] = Number(c.count) || 0;
  }
  return hist;
}

// ─── Derivations ────────────────────────────────────────────────────────────

/**
 * Longest contiguous run of qualifying months inside `months`.
 * @param {number[]} hist @param {number[]} months @param {number} threshold
 * @returns {string} '[2000-MM-DD,2000-MM-DD]' or ''
 */
function windowFor(hist, months, threshold) {
  if (!(threshold > 0)) return '';
  /** @type {number[][]} */ const runs = [];
  /** @type {number[]} */ let cur = [];
  for (const m of months) {
    if (hist[m - 1] >= threshold) cur.push(m);
    else { if (cur.length) runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  if (!runs.length) return '';
  const best = runs.reduce((a, b) => (b.length > a.length ? b : a));
  const s = best[0];
  const e = best[best.length - 1];
  return `[2000-${pad2(s)}-01,2000-${pad2(e)}-${pad2(lastDay(e))}]`;
}

const sumMonths = (hist, months) => months.reduce((a, m) => a + hist[m - 1], 0);

/**
 * Mode rules over one histogram.
 * @param {number[]} hist @param {string} family @returns {string[]}
 */
function modesFrom(hist, family) {
  const total = sum(hist);
  if (total === 0) return [];
  const julIsAutumn = hist[6] >= hist[5];
  const autumnMonths = julIsAutumn ? [7, ...AUTUMN_MONTHS] : [...AUTUMN_MONTHS];
  const modes = [];
  if (sumMonths(hist, SPRING_MONTHS) / total >= SEASON_SHARE) modes.push('spring_overshoot');
  if (sumMonths(hist, autumnMonths) / total >= SEASON_SHARE) modes.push('autumn_drift');
  if ((hist[6] + hist[7]) / total >= DISPERSAL_SHARE && DISPERSAL_FAMILIES.has(family)) {
    modes.push('post_breeding_dispersal');
  }
  if ((hist[11] + hist[0] + hist[1]) / total >= IRRUPTION_SHARE) modes.push('winter_irruption');
  return modes;
}

/** Share of the top 3 months — low means a flat, resident-looking curve. */
function seasonalityOf(hist) {
  const total = sum(hist);
  if (total === 0) return 0;
  return sum([...hist].sort((a, b) => b - a).slice(0, 3)) / total;
}

/**
 * Weighted breeding centroid restricted to the Palearctic box, then the initial
 * bearing FROM Estonia TO it — i.e. the direction the bird arrives from.
 * @param {string[]} top5 entries shaped 'CC:count'
 * @returns {{ bearing: string, excluded: string[] }}
 */
function breedingBearingHint(top5) {
  let wLat = 0, wLon = 0, wSum = 0, kept = 0;
  const excluded = [];
  for (const entry of top5) {
    const [cc, nRaw] = entry.split(':');
    const n = Number(nRaw) || 0;
    const c = COUNTRY_CENTROID.get(cc);
    if (!c) { excluded.push(`${cc}:no_centroid`); continue; }
    const [lat, lon] = c;
    const inBox = lat >= PALEARCTIC.latMin && lat <= PALEARCTIC.latMax
               && lon >= PALEARCTIC.lonMin && lon <= PALEARCTIC.lonMax;
    if (!inBox) { excluded.push(cc); continue; }
    wLat += lat * n; wLon += lon * n; wSum += n; kept += 1;
  }
  if (kept < 2 || wSum === 0) return { bearing: '', excluded };
  const centroid = { lat: wLat / wSum, lon: wLon / wSum };
  return { bearing: String(bearingDeg(ESTONIA, centroid)), excluded };
}

// ─── Supabase reads ─────────────────────────────────────────────────────────

/** @param {{base:string,key:string}} env @param {string} path */
async function pgRest(env, path) {
  stats.supabaseCalls += 1;
  const res = await fetch(`${env.base}/rest/v1/${path}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, Accept: 'application/json' },
  });
  if (!res.ok) fail(`HTTP ${res.status} ${res.statusText} on ${path}\n${await res.text()}`);
  return await res.json();
}

/**
 * Exact row count via the Content-Range header — one request, no payload.
 * @param {{base:string,key:string}} env @param {string} path @returns {Promise<number>}
 */
async function pgCount(env, path) {
  stats.supabaseCalls += 1;
  const res = await fetch(`${env.base}/rest/v1/${path}`, {
    headers: {
      apikey: env.key, Authorization: `Bearer ${env.key}`,
      Accept: 'application/json', Prefer: 'count=exact', Range: '0-0',
    },
  });
  if (!res.ok) fail(`HTTP ${res.status} ${res.statusText} on ${path}\n${await res.text()}`);
  const total = Number((res.headers.get('content-range') || '').split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const env = await resolveEnv();
await mkdir(cacheDir, { recursive: true });

process.stderr.write('Loading species meta…\n');
const metaRes = await fetch(`${env.base}${META_PATH}`, { headers: { 'cache-control': 'no-cache' } });
if (!metaRes.ok) fail(`HTTP ${metaRes.status} on species_meta_v1.json`);
const metaDoc = await metaRes.json();

const allItems = Object.entries(metaDoc.items || {}).map(([et, v]) => ({ et, ...(v || {}) }));
const tiered = allItems.filter((i) => TIERS.includes(i.rarityLevel));
// Defensive: predictionExclude is absent from species_meta_v1.json today (0 rows
// removed), but the orchestrator honours it, so keep the guard aligned.
const excluded = tiered.filter((i) => i.predictionExclude === true);
let species = tiered.filter((i) => i.predictionExclude !== true && i.scientificName);

process.stderr.write('Loading gbif_taxon_keys…\n');
const taxonRows = await pgRest(env, 'gbif_taxon_keys?select=species_name,species_lat,taxon_key&limit=5000');
/** @type {Map<string, {key:number, speciesName:string}>} */
const taxonBySci = new Map();
for (const r of taxonRows || []) {
  const k = nfc(r.species_lat);
  if (k && r.taxon_key != null && !taxonBySci.has(k)) {
    taxonBySci.set(k, { key: r.taxon_key, speciesName: r.species_name });
  }
}

// species_phenology.scientific_name is the PRIMARY KEY, so two Estonian names
// sharing one scientific name would collide on insert in P2b. Keep the entry
// whose Estonian name matches gbif_taxon_keys.species_name for that taxon.
/** @type {Map<string, typeof species>} */
const bySci = new Map();
for (const s of species) {
  const k = nfc(s.scientificName);
  if (!bySci.has(k)) bySci.set(k, []);
  bySci.get(k).push(s);
}
/** @type {string[]} */
const duplicatesDropped = [];
species = [];
for (const [k, group] of bySci) {
  if (group.length === 1) { species.push(group[0]); continue; }
  const canonical = taxonBySci.get(k)?.speciesName;
  const keep = group.find((g) => g.et === canonical) || group[0];
  for (const g of group) {
    if (g !== keep) duplicatesDropped.push(`${g.et} (${g.scientificName}, kept ${keep.et})`);
  }
  species.push(keep);
}

const tierRank = { mega: 0, super: 1, rare: 2 };
species.sort((a, b) =>
  (tierRank[a.rarityLevel] - tierRank[b.rarityLevel]) || a.et.localeCompare(b.et, 'et'));
process.stderr.write(`  ${species.length} species (${TIERS.map((t) =>
  `${t} ${species.filter((s) => s.rarityLevel === t).length}`).join(', ')}); ` +
  `excluded ${excluded.length}; duplicates dropped ${duplicatesDropped.length}\n`);

process.stderr.write(`Fetching GBIF (${species.length} species x 7 calls, cache ${NO_CACHE ? 'OFF' : 'ON'})…\n`);

let done = 0;
const rows = await pool(species.map((sp) => async () => {
  const hit = taxonBySci.get(nfc(sp.scientificName));
  const notes = [];
  /** @type {DraftRow} */
  const row = {
    tier: sp.rarityLevel,
    species_et: sp.et,
    scientific_name: sp.scientificName,
    ebird_code: str(sp.ebirdCode),
    source_regions_spring: pgArray(SOURCE_REGIONS_SPRING),
    source_regions_autumn: pgArray(SOURCE_REGIONS_AUTUMN),
  };
  if (!sp.ebirdCode) notes.push('no_ebird_code');

  const corridor = CORRIDOR_TAGS.get(sp.scientificName);
  const bearing = corridor ? CORRIDOR_BEARING[corridor] : null;
  row.arrival_bearing_spring = bearing?.spring != null ? String(bearing.spring) : '';
  row.arrival_bearing_autumn = bearing?.autumn != null ? String(bearing.autumn) : '';
  row.bearing_source = corridor ? 'corridor_tag' : 'manual_needed';
  if (corridor) notes.push(`corridor:${corridor}`);

  if (!hit) {
    row.auto_status = 'no_taxon_key';
    row.window_source = 'none';
    row.refs_json = JSON.stringify({
      birdlife: `https://datazone.birdlife.org/species/results?kw=${encodeURIComponent(sp.scientificName)}`,
      migrationatlas: `https://migrationatlas.org/species?search=${encodeURIComponent(sp.scientificName)}`,
    });
    row.notes = notes.join(';');
    done += 1;
    return row;
  }

  const key = hit.key;
  row.taxon_key = String(key);

  const [speciesJson, breedingJson, ...countryJson] = await Promise.all([
    gbifJson(`${GBIF}/species/${key}`, `${key}-species`),
    gbifJson(`${GBIF}/occurrence/search?taxonKey=${key}&month=5,7&facet=country&facetLimit=15&limit=0`,
      `${key}-breeding`),
    ...HIST_COUNTRIES.map((cc) => gbifJson(
      `${GBIF}/occurrence/search?taxonKey=${key}&country=${cc}&facet=month&facetLimit=12&limit=0`,
      `${key}-month-${cc}`)),
  ]);

  const hists = countryJson.map(monthHistogram);
  const anyFailed = speciesJson == null || breedingJson == null || hists.some((h) => h == null);
  const pooled = new Array(12).fill(0);
  for (const h of hists) if (h) for (let i = 0; i < 12; i++) pooled[i] += h[i];
  const histEe = hists[0] || new Array(12).fill(0);

  const family = str(speciesJson?.family);
  const flightClass = FLIGHT_CLASS_BY_FAMILY.get(family) || DEFAULT_FLIGHT_CLASS;
  if (family === 'Falconidae') notes.push('falconidae_flight_class_review');
  if (!family) notes.push('no_family_from_gbif');

  // ee_n counts our own ingest; hist_ee comes from the GBIF facet. They are
  // DIFFERENT SOURCES at different scales (gbif_occurrences is 2016+ only), so
  // ee_n gates the EE rule while sum(hist_ee) is the percentage denominator.
  const eeN = await pgCount(env,
    `gbif_occurrences?select=id&country_code=eq.EE&species_name=eq.${encodeURIComponent(hit.speciesName)}`);
  const eeHistN = sum(histEe);
  const eeThreshold = eeHistN * EE_WINDOW_SHARE;
  const eeMonths = histEe.map((v) => (eeHistN > 0 && v >= eeThreshold ? 'X' : '.')).join('');

  const nTotal = sum(pooled);
  const seasonality = seasonalityOf(pooled);
  const isFlat = nTotal > 0 && seasonality < FLAT_SEASONALITY;
  if (isFlat) notes.push('flat_resident_suspect');

  // Windows: prefer Estonia's own curve; fall back to the pooled rule.
  let springWindow = '', autumnWindow = '', windowSource = 'none';
  if (eeN >= EE_MIN_ROWS && eeHistN > 0) {
    springWindow = windowFor(histEe, EE_SPRING_MONTHS, eeThreshold);
    autumnWindow = windowFor(histEe, EE_AUTUMN_MONTHS, eeThreshold);
    if (springWindow || autumnWindow) windowSource = 'ee';
  }
  if (windowSource === 'none' && nTotal > 0) {
    const t = nTotal * POOLED_WINDOW_SHARE;
    const julIsAutumn = pooled[6] >= pooled[5];
    springWindow = windowFor(pooled, SPRING_MONTHS, t);
    autumnWindow = windowFor(pooled, julIsAutumn ? [7, ...AUTUMN_MONTHS] : AUTUMN_MONTHS, t);
    if (springWindow || autumnWindow) windowSource = 'pooled';
  }

  // A flat pooled curve cannot support pooled mode rules — use Estonia only.
  const modes = isFlat ? modesFrom(histEe, family) : modesFrom(pooled, family);

  const top5 = (breedingJson?.facets?.[0]?.counts || [])
    .slice(0, 5).map((c) => `${c.name}:${c.count}`);
  const { bearing: hintBearing, excluded: hintExcluded } = breedingBearingHint(top5);

  row.family = family;
  row.flight_class = flightClass;
  row.cruise_kmh = String(CRUISE_KMH[flightClass]);
  row.arrival_modes = pgArray(modes);
  row.spring_window = springWindow;
  row.autumn_window = autumnWindow;
  row.window_source = windowSource;
  row.bearing_hint_breeding = hintBearing;
  row.bearing_hint_excluded = pgArray(hintExcluded);
  row.breeding_countries_top5 = pgArray(top5);
  row.ee_n = String(eeN);
  row.ee_hist_n = String(eeHistN);
  row.ee_months = eeMonths;
  row.seasonality = nTotal > 0 ? seasonality.toFixed(2) : '';
  row.hist_pooled = pooled.join('|');
  row.hist_ee = histEe.join('|');
  row.hist_fi = (hists[1] || []).join('|');
  row.n_total = String(nTotal);
  row.auto_status = anyFailed ? 'partial_fetch' : nTotal === 0 ? 'no_data' : 'ok';
  row.refs_json = JSON.stringify({
    gbif: `https://www.gbif.org/species/${key}`,
    birdlife: `https://datazone.birdlife.org/species/results?kw=${encodeURIComponent(sp.scientificName)}`,
    migrationatlas: `https://migrationatlas.org/species?search=${encodeURIComponent(sp.scientificName)}`,
  });
  if (modes.length === 0) notes.push('modes_empty_needs_review');
  row.notes = notes.join(';');

  done += 1;
  if (done % 40 === 0) process.stderr.write(`  ${done}/${species.length}\n`);
  return row;
}), CONCURRENCY);

// ─── Output ─────────────────────────────────────────────────────────────────

const tmp = new URL('../tmp/', import.meta.url);
await mkdir(tmp, { recursive: true });
await writeFile(new URL('phenology_draft.csv', tmp), toCsv(CSV_COLUMNS, rows), 'utf8');

const batches = [];
for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

/** @param {DraftRow} r */
function flagsOf(r) {
  const n = r.notes || '';
  const f = [];
  if (n.includes('flat_resident_suspect')) f.push('flat_resident_suspect');
  if (n.includes('modes_empty_needs_review')) f.push('modes_empty');
  if (n.includes('no_ebird_code')) f.push('no_ebird_code');
  if (n.includes('falconidae_flight_class_review')) f.push('falconidae_review');
  return f.join(', ');
}

for (const [bi, b] of batches.entries()) {
  await writeFile(new URL(`phenology_draft_batch${bi + 1}.csv`, tmp), toCsv(CSV_COLUMNS, b), 'utf8');
  const M = [];
  M.push(`# species_phenology review — batch ${bi + 1} of ${batches.length} (${b.length} rows)`);
  M.push('');
  M.push('`arrival_modes` / windows are auto-derived. An empty cell means no rule fired —');
  M.push('that is a question, not a zero. `bearing_hint_breeding` is a HINT only; the real');
  M.push('`arrival_bearing_*` columns live in the CSV and stay corridor-tag or empty.');
  M.push('');
  M.push('| # | species_et | scientific_name | tier | flight_class | arrival_modes | spring_window | autumn_window | win_src | hint° | ee_n | ee_months | flags |');
  M.push('|---:|---|---|---|---|---|---|---|---|---:|---:|---|---|');
  b.forEach((r, i) => {
    const shortWin = (w) => (w ? w.replace(/2000-/g, '').replace(/[[\]]/g, '') : '—');
    M.push(`| ${bi * BATCH_SIZE + i + 1} | ${mdCell(r.species_et)} | ${mdCell(r.scientific_name)} | ${mdCell(r.tier)} | ${mdCell(r.flight_class)} | ${mdCell((r.arrival_modes || '{}').replace(/[{}]/g, '') || '—')} | ${shortWin(r.spring_window)} | ${shortWin(r.autumn_window)} | ${mdCell(r.window_source)} | ${mdCell(r.bearing_hint_breeding)} | ${mdCell(r.ee_n)} | \`${r.ee_months || '............'}\` | ${mdCell(flagsOf(r))} |`);
  });
  M.push('');
  M.push('`ee_months`: Jan→Dec, `X` = month holds >= 15 % of this species\' EE GBIF records.');
  M.push('');
  await writeFile(new URL(`phenology_review_batch${bi + 1}.md`, tmp), `${M.join('\n')}\n`, 'utf8');
}

// ─── Summary ────────────────────────────────────────────────────────────────

const HIGHLIGHT = [
  'Oenanthe deserti', 'Ardeola ralloides', 'Aegypius monachus', 'Himantopus himantopus',
  'Phalaropus lobatus', 'Calidris temminckii', 'Tarsiger cyanurus', 'Galerida cristata',
];

const emptyModes = rows.filter((r) => !r.arrival_modes || r.arrival_modes === '{}');
const flatRows = rows.filter((r) => (r.notes || '').includes('flat_resident_suspect'));

const L = [];
L.push('# species_phenology draft — P2a (auto, for review)');
L.push('');
L.push(`Generated: ${new Date().toISOString()}`);
L.push('');
L.push('## Species per tier');
L.push('');
L.push('| tier | n |');
L.push('|---|---:|');
for (const t of TIERS) L.push(`| ${t} | ${rows.filter((r) => r.tier === t).length} |`);
L.push(`| **total** | **${rows.length}** |`);
L.push('');
L.push(`\`predictionExclude\` removed: **${excluded.length}** (the field is absent from species_meta_v1.json; guard kept defensively).`);
L.push(`Missing a \`taxon_key\`: **${rows.filter((r) => r.auto_status === 'no_taxon_key').length}**.`);
L.push(`Missing an \`ebird_code\`: **${rows.filter((r) => (r.notes || '').includes('no_ebird_code')).length}**.`);
L.push(`Batches written: **${batches.length}** (${batches.map((b) => b.length).join(', ')} rows).`);
L.push('');
L.push('### duplicates_dropped');
L.push('');
if (duplicatesDropped.length === 0) L.push('_none_');
else for (const d of duplicatesDropped) L.push(`- ${d}`);
L.push('');
L.push('`species_phenology.scientific_name` is the primary key, so these would have collided on insert in P2b.');
L.push('');
L.push('### needs tier in species_meta (Kristian, Settings → Avatarid)');
L.push('');
L.push('- **Aquila nipalensis** — tagged in `corridor_species_tags` (caspian_central_asia) but not rare/super/mega in `species_meta_v1.json`, so it never enters this draft.');
L.push('');
L.push('## GBIF calls');
L.push('');
L.push('| metric | n |');
L.push('|---|---:|');
L.push(`| requests made | ${stats.gbifCalls} |`);
L.push(`| served from cache | ${stats.gbifCacheHits} |`);
L.push(`| failed (after 1 retry) | ${stats.gbifFailures} |`);
L.push(`| PostgREST reads | ${stats.supabaseCalls} |`);
L.push('');
L.push('| auto_status | n |');
L.push('|---|---:|');
for (const s of ['ok', 'no_data', 'partial_fetch', 'no_taxon_key']) {
  const n = rows.filter((r) => r.auto_status === s).length;
  if (n > 0) L.push(`| ${s} | ${n} |`);
}
L.push('');
L.push('## window_source');
L.push('');
L.push('| source | n | meaning |');
L.push('|---|---:|---|');
for (const s of ['ee', 'pooled', 'none']) {
  const n = rows.filter((r) => r.window_source === s).length;
  const meaning = s === 'ee' ? 'from hist_ee (ee_n >= 10, month >= 15 % of EE records)'
    : s === 'pooled' ? 'fallback: pooled EE+FI+SE+LV+LT, month >= 8 % of annual'
      : 'no rule fired — needs Kristian';
  L.push(`| ${s} | ${n} | ${meaning} |`);
}
L.push('');
L.push('## Flatness guard');
L.push('');
L.push(`\`seasonality\` = share of the top 3 months of \`hist_pooled\`. Below ${FLAT_SEASONALITY} the pooled curve is too flat to read as migration.`);
L.push('');
L.push(`**\`flat_resident_suspect\`: ${flatRows.length} rows** — their \`arrival_modes\` come from \`hist_ee\` only; the pooled rules were skipped.`);
L.push('');
if (flatRows.length > 0) {
  L.push('| species_et | scientific_name | seasonality | modes | ee_n |');
  L.push('|---|---|---:|---|---:|');
  for (const r of [...flatRows].sort((a, b) => Number(a.seasonality) - Number(b.seasonality)).slice(0, 15)) {
    L.push(`| ${r.species_et} | ${r.scientific_name} | ${r.seasonality} | ${r.arrival_modes} | ${r.ee_n} |`);
  }
  if (flatRows.length > 15) L.push(`| _… ${flatRows.length - 15} more_ | | | | |`);
  L.push('');
}
L.push('## Proposed arrival_modes');
L.push('');
const modeCount = new Map();
for (const r of rows) {
  for (const m of (r.arrival_modes || '{}').replace(/[{}]/g, '').split(',').filter(Boolean)) {
    modeCount.set(m, (modeCount.get(m) || 0) + 1);
  }
}
L.push('| mode | n |');
L.push('|---|---:|');
for (const [m, n] of [...modeCount.entries()].sort((a, b) => b[1] - a[1])) L.push(`| ${m} | ${n} |`);
L.push('');
L.push(`**Rows with NO proposed mode: ${emptyModes.length}.**`);
for (const r of emptyModes) L.push(`- ${r.tier} — ${r.species_et} (${r.scientific_name}), n_total=${r.n_total || 0}, status=${r.auto_status}`);
L.push('');
L.push('## Bearings');
L.push('');
L.push('| column | n |');
L.push('|---|---:|');
L.push(`| bearing_source = corridor_tag | ${rows.filter((r) => r.bearing_source === 'corridor_tag').length} |`);
L.push(`| bearing_source = manual_needed | ${rows.filter((r) => r.bearing_source === 'manual_needed').length} |`);
L.push(`| bearing_hint_breeding present | ${rows.filter((r) => r.bearing_hint_breeding).length} |`);
L.push(`| bearing_hint_breeding empty (< 2 Palearctic countries) | ${rows.filter((r) => !r.bearing_hint_breeding).length} |`);
L.push('');
L.push('## Review set');
L.push('');
L.push('| scientific_name | species_et | tier | modes | spring | autumn | win_src | hint° | ee_n | ee_months | seas. | status |');
L.push('|---|---|---|---|---|---|---|---:|---:|---|---:|---|');
for (const name of HIGHLIGHT) {
  const r = rows.find((x) => x.scientific_name === name);
  if (!r) { L.push(`| ${name} | — | — | — | — | — | — | — | — | — | — | NOT IN SET |`); continue; }
  const w = (x) => (x ? x.replace(/2000-/g, '').replace(/[[\]]/g, '') : '—');
  L.push(`| ${r.scientific_name} | ${r.species_et} | ${r.tier} | ${(r.arrival_modes || '{}').replace(/[{}]/g, '') || '—'} | ${w(r.spring_window)} | ${w(r.autumn_window)} | ${r.window_source} | ${r.bearing_hint_breeding || '—'} | ${r.ee_n || 0} | \`${r.ee_months || '............'}\` | ${r.seasonality || '—'} | ${r.auto_status} |`);
}
L.push('');
L.push('## Caveats');
L.push('');
L.push('- Every value here is `auto`. An EMPTY cell means the rule did not fire — a question for Kristian, not a derived zero.');
L.push('- **`ee_n` and `hist_ee` are different sources.** `ee_n` counts `gbif_occurrences` (our 2016+ ingest); `hist_ee` is the all-time GBIF facet, typically 1.2–8x larger. So `ee_n >= 10` only GATES the EE rule — the `ee_months` / EE-window percentages use `sum(hist_ee)` (column `ee_hist_n`) as the denominator.');
L.push('- `bearing_hint_breeding` is the initial bearing FROM Estonia (58.6, 25.5) TO the weighted breeding centroid — the direction the bird arrives FROM. Countries outside the Palearctic box (lat 20–80, lon −30–120) are dropped and listed in `bearing_hint_excluded`; the hint is empty when fewer than 2 countries survive. Country centroids are coarse, so treat this as a nudge, never a value to paste in.');
L.push('- `arrival_bearing_*` still come only from the 16 inlined corridor tags; everything else is `manual_needed`.');
L.push('- GBIF omits zero months and sorts facets by count, so histograms are seeded with 12 zeros and filled by month name.');
L.push('');

await writeFile(new URL('phenology_draft_summary.md', tmp), `${L.join('\n')}\n`, 'utf8');

console.log(`species        : ${rows.length} (duplicates dropped: ${duplicatesDropped.length})`);
console.log(`batches        : ${batches.length} (${batches.map((b) => b.length).join(', ')})`);
console.log(`gbif calls     : ${stats.gbifCalls} made, ${stats.gbifCacheHits} cached, ${stats.gbifFailures} failed`);
console.log(`postgrest reads: ${stats.supabaseCalls}`);
console.log(`window_source  : ${['ee', 'pooled', 'none'].map((s) => `${s} ${rows.filter((r) => r.window_source === s).length}`).join(', ')}`);
console.log(`flat suspects  : ${flatRows.length}`);
console.log(`empty modes    : ${emptyModes.length}`);
console.log(`hint bearings  : ${rows.filter((r) => r.bearing_hint_breeding).length} of ${rows.length}`);
console.log('wrote tmp/phenology_draft.csv');
for (let i = 0; i < batches.length; i++) {
  console.log(`wrote tmp/phenology_draft_batch${i + 1}.csv + phenology_review_batch${i + 1}.md`);
}
console.log('wrote tmp/phenology_draft_summary.md');
