// Retro-scores every Tõenäosus report against real Estonian arrivals (v3).
//
// Read-only. Anon PostgREST + one public storage object. Never calls an Edge
// Function, never writes outside tmp/.
//
// Ground truth is the UNION of two anon-readable report tables:
//   vaatluste_raport.estonia_entries[]  and  elurikkus_raport.estonia_entries[]
// (elurikkus_observations is RLS-blocked for anon — it returns HTTP 200 with an
// empty body, so it would silently score every prediction a miss.)
//
// Usage:
//   node scripts/ennustus-backtest.mjs
//
// Env (falls back to reading repo-root .env; values are never printed):
//   SUPABASE_URL              | VITE_SUPABASE_URL
//   SUPABASE_PUBLISHABLE_KEY  | VITE_SUPABASE_PUBLISHABLE_KEY | SUPABASE_ANON_KEY

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import process from 'node:process';

/** @typedef {{ species: string, date: string, lat: number|null, lng: number|null }} GroundTruthRecord */
/** @typedef {{ raport_id: string, generated_at: string, season: string, kind: 'entry'|'watchlist',
 *              ebird_code: string, species_lat: string, species_et: string, rarity_level: string,
 *              predicted_pct: string, timing_band: string, nearest_country: string,
 *              nearest_distance_km: string, nearest_date: string, active_corridor: string,
 *              outcome: 'species_hit'|'miss', ee_first_date: string, days_to_arrival: string,
 *              ee_lat: string, ee_lon: string }} BacktestRow */

// ─── Constants ──────────────────────────────────────────────────────────────

const SINCE = '2026-05-01';
const WINDOW_DAYS = 14;        // v3: fixed 14 d window (v4 will use eta_window)
const GRACE_DAYS = 3;          // hit still counts up to +3 d past window_end
const PAGE_SIZE = 25;          // PostgREST page size (entries[] payloads are large)
const DAY_MS = 86400000;

const META_PATH = '/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json';

const CSV_COLUMNS = /** @type {const} */ ([
  'raport_id', 'generated_at', 'season', 'kind', 'ebird_code', 'species_lat',
  'species_et', 'rarity_level', 'predicted_pct', 'timing_band', 'nearest_country',
  'nearest_distance_km', 'nearest_date', 'active_corridor', 'outcome',
  'ee_first_date', 'days_to_arrival', 'ee_lat', 'ee_lon',
]);

const BUCKETS = [
  { label: '<20', lo: -Infinity, hi: 20 },
  { label: '20–39', lo: 20, hi: 40 },
  { label: '40–59', lo: 40, hi: 60 },
  { label: '60–79', lo: 60, hi: 80 },
  { label: '≥80', lo: 80, hi: Infinity },
];

// ─── Env ────────────────────────────────────────────────────────────────────

/**
 * Reads KEY=VALUE pairs out of the repo-root .env so the script runs with a
 * bare `node scripts/ennustus-backtest.mjs`. Values are never logged.
 * @returns {Promise<Record<string, string>>}
 */
async function readDotEnv() {
  try {
    const text = await readFile(new URL('../.env', import.meta.url), 'utf8');
    /** @type {Record<string, string>} */
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @returns {Promise<{ base: string, key: string }>}
 */
async function resolveEnv() {
  const file = await readDotEnv();
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

/** @param {string} msg */
function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

// ─── Normalisation ──────────────────────────────────────────────────────────

/**
 * Canonical species key: NFC-normalised, trimmed, lower-cased Latin name.
 * @param {unknown} v
 * @returns {string}
 */
function speciesKey(v) {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').trim().toLowerCase();
}

/**
 * Coerces an observation date to YYYY-MM-DD, or '' when unparseable.
 * Handles 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM' and full ISO timestamps.
 * @param {unknown} v
 * @returns {string}
 */
function normDate(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (direct) return direct[1];
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

/** @param {string} ymd @returns {number} */
function dayNum(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** @param {unknown} v @returns {number|null} */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** @param {unknown} v @returns {string} */
function str(v) {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

// ─── PostgREST ──────────────────────────────────────────────────────────────

/**
 * Fetches every row of a table, paging with limit/offset. Any non-2xx aborts
 * the run with the verbatim status + body — no retry, no key switching.
 * @param {{ base: string, key: string }} env
 * @param {string} table
 * @param {string} select
 * @param {string} filter
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchAll(env, table, select, filter) {
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${env.base}/rest/v1/${table}?select=${select}&${filter}` +
      `&order=generated_at.asc,id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      fail(`HTTP ${res.status} ${res.statusText} on ${table} (offset ${offset})\n${body}`);
    }
    const page = await res.json();
    if (!Array.isArray(page)) fail(`Unexpected non-array response for ${table}`);
    rows.push(...page);
    process.stderr.write(`\r  ${table}: ${rows.length} rows`);
    if (page.length < PAGE_SIZE) break;
  }
  process.stderr.write('\n');
  return rows;
}

/**
 * species_lat -> ebirdCode, from the public species-meta object.
 * @param {{ base: string, key: string }} env
 * @returns {Promise<Map<string, string>>}
 */
async function fetchSpeciesCodeMap(env) {
  const res = await fetch(`${env.base}${META_PATH}`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) {
    const body = await res.text();
    fail(`HTTP ${res.status} ${res.statusText} on species_meta_v1.json\n${body}`);
  }
  const doc = await res.json();
  const items = (doc && doc.items) || {};
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const item of Object.values(items)) {
    const sci = speciesKey(item && item.scientificName);
    const code = str(item && item.ebirdCode).trim();
    if (sci && code && !map.has(sci)) map.set(sci, code);
  }
  return map;
}

// ─── Ground truth ───────────────────────────────────────────────────────────

/**
 * Builds the deduped, per-species arrival index from a report table's rows.
 * Dedupe key: lower(nfc(species_lat)) | date | round(lat,2) | round(lng,2).
 * @param {Array<Record<string, unknown>>} rows
 * @param {Map<string, GroundTruthRecord[]>} index
 * @param {Set<string>} seen
 * @returns {number} number of newly indexed records
 */
function ingestGroundTruth(rows, index, seen) {
  let added = 0;
  for (const row of rows) {
    const items = Array.isArray(row.estonia_entries) ? row.estonia_entries : [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const species = speciesKey(it.species_lat);
      const date = normDate(it.date);
      if (!species || !date || date < SINCE) continue;
      const lat = num(it.lat);
      const lng = num(it.lng);
      const r2 = (v) => (v == null ? '' : v.toFixed(2));
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

/**
 * First arrival of `species` in [startDay, endDay] inclusive, or null.
 * @param {Map<string, GroundTruthRecord[]>} index
 * @param {string} species
 * @param {number} startDay
 * @param {number} endDay
 * @returns {GroundTruthRecord|null}
 */
function firstArrivalIn(index, species, startDay, endDay) {
  const bucket = index.get(species);
  if (!bucket || bucket.length === 0) return null;
  // bucket is sorted ascending by date; binary-search the first date >= startDay
  let lo = 0;
  let hi = bucket.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dayNum(bucket[mid].date) < startDay) lo = mid + 1;
    else hi = mid;
  }
  if (lo >= bucket.length) return null;
  const cand = bucket[lo];
  return dayNum(cand.date) <= endDay ? cand : null;
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/**
 * RFC4180 field: quote when the value holds a comma, quote, CR or LF.
 * @param {string} value
 * @returns {string}
 */
function csvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {readonly string[]} columns
 * @param {ReadonlyArray<Record<string, string>>} rows
 * @returns {string}
 */
function toCsv(columns, rows) {
  const lines = [columns.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c] ?? '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/**
 * @param {Array<Record<string, unknown>>} raports
 * @param {Map<string, GroundTruthRecord[]>} gt
 * @param {Map<string, string>} codeMap
 * @returns {BacktestRow[]}
 */
function scoreAll(raports, gt, codeMap) {
  /** @type {BacktestRow[]} */
  const out = [];

  for (const r of raports) {
    const generatedAt = str(r.generated_at);
    const genDate = normDate(generatedAt);
    if (!genDate) continue;
    const startDay = dayNum(genDate);
    const endDay = startDay + WINDOW_DAYS + GRACE_DAYS;

    const sd = r.source_data && typeof r.source_data === 'object' ? r.source_data : {};
    const corridorIds = Array.isArray(sd.active_corridor_ids) ? sd.active_corridor_ids : [];
    const activeCorridor = corridorIds.map(str).filter(Boolean).join(';');

    /**
     * @param {'entry'|'watchlist'} kind
     * @param {Record<string, unknown>} it
     * @param {Record<string, string>} extra
     */
    const push = (kind, it, extra) => {
      const species = speciesKey(it.species_lat);
      const hit = species ? firstArrivalIn(gt, species, startDay, endDay) : null;
      out.push({
        raport_id: str(r.id),
        generated_at: generatedAt,
        season: str(r.season),
        kind,
        species_lat: str(it.species_lat),
        species_et: str(it.species_et),
        rarity_level: str(it.rarity_level),
        active_corridor: activeCorridor,
        outcome: hit ? 'species_hit' : 'miss',
        ee_first_date: hit ? hit.date : '',
        days_to_arrival: hit ? String(dayNum(hit.date) - startDay) : '',
        ee_lat: hit && hit.lat != null ? String(hit.lat) : '',
        ee_lon: hit && hit.lng != null ? String(hit.lng) : '',
        ...extra,
      });
    };

    const entries = Array.isArray(r.entries) ? r.entries : [];
    for (const it of entries) {
      if (!it || typeof it !== 'object') continue;
      const pct = num(it.ee_probability_pct);
      const dist = num(it.distance_to_ee_km);
      push('entry', it, {
        ebird_code: codeMap.get(speciesKey(it.species_lat)) || '',
        predicted_pct: pct == null ? '' : String(pct),
        timing_band: str(it.timing_band),
        nearest_country: str(it.country_code),
        nearest_distance_km: dist == null ? '' : String(dist),
        nearest_date: normDate(it.date),
        // v3 predicts no site, so site-level scoring is not computed.
      });
    }

    const watch = Array.isArray(r.corridor_watchlist) ? r.corridor_watchlist : [];
    for (const it of watch) {
      if (!it || typeof it !== 'object') continue;
      push('watchlist', it, {
        ebird_code: str(it.ebird_code),
        predicted_pct: '',
        timing_band: '',
        nearest_country: '',
        nearest_distance_km: '',
        nearest_date: '',
      });
    }
  }

  return out;
}

// ─── Summary ────────────────────────────────────────────────────────────────

/** @param {BacktestRow[]} rows @returns {{ n: number, hits: number, rate: string }} */
function tally(rows) {
  const n = rows.length;
  const hits = rows.filter((r) => r.outcome === 'species_hit').length;
  return { n, hits, rate: n === 0 ? '—' : `${((hits / n) * 100).toFixed(1)}%` };
}

/**
 * @param {BacktestRow[]} all
 * @param {{ raports: number, gtRecords: number, gtSpecies: number, gtVaatluste: number,
 *           gtElurikkus: number, unresolvedCodes: number, missingWindow: number }} meta
 * @returns {string}
 */
function buildSummary(all, meta) {
  const entries = all.filter((r) => r.kind === 'entry');
  const watch = all.filter((r) => r.kind === 'watchlist');
  const overall = tally(all);
  const eT = tally(entries);
  const wT = tally(watch);

  const L = [];
  L.push('# Ennustus backtest — v3 (fixed 14 d window, +3 d grace)');
  L.push('');
  L.push(`Generated: ${new Date().toISOString()}`);
  L.push(`Raport rows scored: **${meta.raports}** (generated_at ≥ ${SINCE})`);
  L.push(
    `Ground truth: **${meta.gtRecords}** deduped EE arrival records across ${meta.gtSpecies} species ` +
      `(${meta.gtVaatluste} from vaatluste_raport + ${meta.gtElurikkus} new from elurikkus_raport; ` +
      'dedupe key `species_lat|date|round(lat,2)|round(lng,2)`)',
  );
  L.push('');
  L.push('## Headline');
  L.push('');
  L.push('| scope | n | hits | misses | hit rate |');
  L.push('|---|---:|---:|---:|---:|');
  L.push(`| all rows | ${overall.n} | ${overall.hits} | ${overall.n - overall.hits} | ${overall.rate} |`);
  L.push(`| kind = entry | ${eT.n} | ${eT.hits} | ${eT.n - eT.hits} | ${eT.rate} |`);
  L.push(`| kind = watchlist | ${wT.n} | ${wT.hits} | ${wT.n - wT.hits} | ${wT.rate} |`);
  L.push('');

  L.push('## Calibration — kind = entry');
  L.push('');
  L.push('| predicted_pct | n | hits | hit rate |');
  L.push('|---|---:|---:|---:|');
  for (const b of BUCKETS) {
    const inB = entries.filter((r) => {
      const p = Number(r.predicted_pct);
      return r.predicted_pct !== '' && Number.isFinite(p) && p >= b.lo && p < b.hi;
    });
    const t = tally(inB);
    L.push(`| ${b.label} | ${t.n} | ${t.hits} | ${t.rate} |`);
  }
  const noPct = entries.filter((r) => r.predicted_pct === '' || !Number.isFinite(Number(r.predicted_pct)));
  if (noPct.length > 0) {
    const t = tally(noPct);
    L.push(`| (no pct) | ${t.n} | ${t.hits} | ${t.rate} |`);
  }
  L.push('');

  const brierRows = entries.filter((r) => r.predicted_pct !== '' && Number.isFinite(Number(r.predicted_pct)));
  const brier =
    brierRows.length === 0
      ? null
      : brierRows.reduce((acc, r) => {
          const p = Number(r.predicted_pct) / 100;
          const y = r.outcome === 'species_hit' ? 1 : 0;
          return acc + (p - y) ** 2;
        }, 0) / brierRows.length;
  L.push(`**Brier score (entries, n=${brierRows.length}):** ${brier == null ? '—' : brier.toFixed(4)}`);
  L.push('');

  L.push('## Calibration — kind = watchlist');
  L.push('');
  L.push('Watch-list rows carry no `predicted_pct` — they are a binary "conditions favourable"');
  L.push('flag — so the bucket axis collapses to a single row.');
  L.push('');
  L.push('| predicted_pct | n | hits | hit rate |');
  L.push('|---|---:|---:|---:|');
  L.push(`| (none — flag only) | ${wT.n} | ${wT.hits} | ${wT.rate} |`);
  L.push('');

  L.push('## Arrival-window gate');
  L.push('');
  const withWin = entries.filter((r) => r.timing_band !== '');
  const noWin = entries.filter((r) => r.timing_band === '');
  const wW = tally(withWin);
  const nW = tally(noWin);
  L.push('| entries | n | hits | hit rate |');
  L.push('|---|---:|---:|---:|');
  L.push(`| with \`timing_band\` / \`arrival_window_et\` | ${wW.n} | ${wW.hits} | ${wW.rate} |`);
  L.push(`| **missing** \`arrival_window_et\` (pre-v8.8 rows) | ${nW.n} | ${nW.hits} | ${nW.rate} |`);
  L.push('');

  // The two cohorts are separated by the v8.8 deploy date, not randomised, so
  // the headline gap above is confounded with calendar time (spring-migration
  // peak vs late summer). Split by month so the confound is visible.
  const spanOf = (rs) => {
    if (rs.length === 0) return '—';
    const d = rs.map((r) => r.generated_at.slice(0, 10)).sort();
    return `${d[0]} .. ${d[d.length - 1]}`;
  };
  L.push('> **Do not read the gap above as a gate effect.** The cohorts are split by the v8.8');
  L.push('> deploy, not randomised, so they occupy different calendar windows:');
  L.push(`> missing = \`${spanOf(noWin)}\`, with = \`${spanOf(withWin)}\`.`);
  L.push('> Hit rate tracks migration season, which collapses over the same period.');
  L.push('');
  const months = [...new Set(entries.map((r) => r.generated_at.slice(0, 7)))].sort();
  L.push('| month | missing band: n / hits / rate | with band: n / hits / rate | all entries rate |');
  L.push('|---|---|---|---:|');
  for (const m of months) {
    const a = noWin.filter((r) => r.generated_at.startsWith(m));
    const b = withWin.filter((r) => r.generated_at.startsWith(m));
    const all = entries.filter((r) => r.generated_at.startsWith(m));
    const fmt = (t) => (t.n === 0 ? '—' : `${t.n} / ${t.hits} / ${t.rate}`);
    L.push(`| ${m} | ${fmt(tally(a))} | ${fmt(tally(b))} | ${tally(all).rate} |`);
  }
  L.push('');
  /** @type {Map<string, BacktestRow[]>} */
  const byBand = new Map();
  for (const r of withWin) {
    const b = r.timing_band || '(none)';
    if (!byBand.has(b)) byBand.set(b, []);
    byBand.get(b).push(r);
  }
  if (byBand.size > 0) {
    L.push('| timing_band | n | hits | hit rate |');
    L.push('|---|---:|---:|---:|');
    for (const [band, rs] of [...byBand.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const t = tally(rs);
      L.push(`| ${band} | ${t.n} | ${t.hits} | ${t.rate} |`);
    }
    L.push('');
  }

  L.push('## Top 10 species by prediction count');
  L.push('');
  /** @type {Map<string, BacktestRow[]>} */
  const bySpecies = new Map();
  for (const r of all) {
    const k = r.species_lat || '(blank)';
    if (!bySpecies.has(k)) bySpecies.set(k, []);
    bySpecies.get(k).push(r);
  }
  const top = [...bySpecies.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  L.push('| species_lat | species_et | n | entry | watchlist | hits | hit rate |');
  L.push('|---|---|---:|---:|---:|---:|---:|');
  for (const [lat, rs] of top) {
    const t = tally(rs);
    const et = (rs.find((r) => r.species_et) || {}).species_et || '';
    const ne = rs.filter((r) => r.kind === 'entry').length;
    const nw = rs.length - ne;
    L.push(`| ${lat} | ${et} | ${t.n} | ${ne} | ${nw} | ${t.hits} | ${t.rate} |`);
  }
  L.push('');

  L.push('## Caveats');
  L.push('');
  L.push(
    '- `ebird_code` is absent from `toenaosus_raport.entries[]` and is reverse-mapped from ' +
      `\`species_lat\` via \`species_meta_v1.json\`. **${meta.unresolvedCodes}** entry rows could not be ` +
      'resolved and carry a blank code. Watch-list rows use their own stored `ebird_code`.',
  );
  L.push(
    '- v3 predicts no arrival site, so `site_hit` is not computed and the column is omitted from the CSV.',
  );
  L.push(
    `- \`arrival_window_et\`/\`timing_band\` were only added in v8.8; **${meta.missingWindow}** entry rows predate it.`,
  );
  L.push(
    '- Ground truth is the two curated rarity reports, not raw `elurikkus_observations` ' +
      '(RLS-blocked for anon: it returns HTTP 200 with an empty body). Anything the reports ' +
      'never wrote up is invisible to this backtest.',
  );
  L.push(
    '- **Kõrbe-kivitäks (Oenanthe deserti, `deswhe1`) 2025-09-12 is a manual reference case only.** ' +
      'It is not reconstructable here — there are no raport rows and no FI history before 2026-05 — ' +
      'and it appears in neither the predictions nor the ground truth.',
  );
  L.push('');
  return `${L.join('\n')}\n`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const env = await resolveEnv();
process.stderr.write(`Backtest v3 — window ${WINDOW_DAYS} d + ${GRACE_DAYS} d grace, since ${SINCE}\n`);

process.stderr.write('Fetching species meta…\n');
const codeMap = await fetchSpeciesCodeMap(env);
process.stderr.write(`  species_lat -> ebirdCode entries: ${codeMap.size}\n`);

process.stderr.write('Fetching predictions…\n');
const raports = await fetchAll(
  env,
  'toenaosus_raport',
  'id,generated_at,season,entries,corridor_watchlist,source_data',
  `generated_at=gte.${SINCE}`,
);

process.stderr.write('Fetching ground truth…\n');
const vaatluste = await fetchAll(
  env,
  'vaatluste_raport',
  'id,generated_at,estonia_entries',
  `generated_at=gte.${SINCE}`,
);
const elurikkus = await fetchAll(
  env,
  'elurikkus_raport',
  'id,generated_at,estonia_entries',
  `generated_at=gte.${SINCE}`,
);

/** @type {Map<string, GroundTruthRecord[]>} */
const gt = new Map();
/** @type {Set<string>} */
const seen = new Set();
const gtVaatluste = ingestGroundTruth(vaatluste, gt, seen);
const gtElurikkus = ingestGroundTruth(elurikkus, gt, seen);
for (const bucket of gt.values()) {
  bucket.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
process.stderr.write(
  `  ground truth: ${seen.size} deduped records across ${gt.size} species ` +
    `(${gtVaatluste} vaatluste + ${gtElurikkus} elurikkus)\n`,
);

process.stderr.write('Scoring…\n');
const rows = scoreAll(raports, gt, codeMap);
const unresolvedCodes = rows.filter((r) => r.kind === 'entry' && r.ebird_code === '').length;
const missingWindow = rows.filter((r) => r.kind === 'entry' && r.timing_band === '').length;

await mkdir(new URL('../tmp/', import.meta.url), { recursive: true });
await writeFile(new URL('../tmp/backtest_v3.csv', import.meta.url), toCsv(CSV_COLUMNS, rows), 'utf8');
await writeFile(
  new URL('../tmp/backtest_v3_summary.md', import.meta.url),
  buildSummary(rows, {
    raports: raports.length,
    gtRecords: seen.size,
    gtSpecies: gt.size,
    gtVaatluste,
    gtElurikkus,
    unresolvedCodes,
    missingWindow,
  }),
  'utf8',
);

const hits = rows.filter((r) => r.outcome === 'species_hit').length;
const nEntry = rows.filter((r) => r.kind === 'entry').length;
console.log(`raports scored : ${raports.length}`);
console.log(`rows written   : ${rows.length}  (entry ${nEntry}, watchlist ${rows.length - nEntry})`);
console.log(`ground truth   : ${seen.size} records / ${gt.size} species`);
console.log(`species_hit    : ${hits}   miss: ${rows.length - hits}`);
console.log(`unresolved code: ${unresolvedCodes} entry rows`);
console.log('wrote tmp/backtest_v3.csv');
console.log('wrote tmp/backtest_v3_summary.md');
