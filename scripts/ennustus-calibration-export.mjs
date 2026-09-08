// scripts/ennustus-calibration-export.mjs
// Ennustus P7b — exports the calibration set: every scored prediction from
// public.prediction_outcomes, left-joined to the P7a user ratings in
// public.prediction_ratings, as one CSV.
//
// SERVICE-ROLE SCRIPT. This holds SUPABASE_SERVICE_ROLE_KEY and therefore
// BYPASSES ROW LEVEL SECURITY. It is READ-ONLY by construction: every request
// below is a GET, and the script must never issue an INSERT, UPDATE, DELETE,
// PATCH or RPC. Keep it that way.
//
// The anon publishable key cannot do this job, which is why the posture
// changed: prediction_ratings has no anon grant at all (ACL postgres |
// authenticated=arwdm | service_role) and its SELECT policy is {authenticated},
// while elurikkus_observations has RLS on with zero policies. An anon client
// gets permission-denied on one and HTTP 200 with an empty body on the other --
// the second failure is silent and would look like "no data yet".
//
// Usage:
//   node scripts/ennustus-calibration-export.mjs
//   node scripts/ennustus-calibration-export.mjs --since 2026-06-01 --out tmp/cal.csv
//
// Env (falls back to reading repo-root .env; values are never printed):
//   SUPABASE_URL              | VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (required -- no fallback to a publishable key)
//
// `rating`, `note` and `rated_at` come from the MOST RECENT rating on that
// (raport_id, ebird_code, site_index); `n_ratings` counts the DISTINCT users who
// rated it. A prediction nobody rated still appears, with those four blank.
//
// `window_closed` says whether the outcome is settled: `yes` once window_end is
// in the past, `no` while the window is still open, and empty on a not_scored
// row, which has no window to close. A `no` row is PROVISIONAL -- a bird that
// has simply not arrived yet reads as `miss` -- and the nightly run rewrites it
// on its true closing date, since the upsert is keyed on
// (raport_id, ebird_code, site_index). Do not tune weights on `no` rows.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_SINCE_DAYS = 90;
const DEFAULT_OUT = 'tmp/ennustus-calibration.csv';
const PAGE_SIZE = 1000;   // PostgREST default max rows per response
const ID_CHUNK = 50;      // raport ids per `in.()` filter

const CSV_COLUMNS = /** @type {const} */ ([
  'raport_id', 'generated_at', 'ebird_code', 'species_et', 'site_index',
  'site_label', 'predicted_pct', 'timing_band', 'window_source', 'window_start',
  'window_end', 'window_closed', 'outcome', 'not_scored_reason', 'ee_first_date',
  'obs_source', 'distance_km', 'rating', 'note', 'rated_at', 'n_ratings',
]);

/**
 * One clock read for the whole run. Both the `--since` default and
 * `window_closed` derive from it, so a run cannot straddle midnight and answer
 * two different questions about "today".
 */
const RUN_AT = new Date();

/** Today at UTC midnight, in ms -- the boundary window_closed compares against. */
const RUN_DATE_MS = Date.UTC(
  RUN_AT.getUTCFullYear(),
  RUN_AT.getUTCMonth(),
  RUN_AT.getUTCDate(),
);

// ─── Env ────────────────────────────────────────────────────────────────────

/** @param {string} msg */
function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

/**
 * Reads KEY=VALUE pairs out of the repo-root .env so the script runs with a
 * bare `node scripts/ennustus-calibration-export.mjs`. Values are never logged.
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
  // Deliberately no publishable-key fallback: a silent downgrade would produce
  // an empty CSV that reads as "no data yet" rather than as a failure.
  const key = pick('SUPABASE_SERVICE_ROLE_KEY');
  if (!base) {
    fail(
      'missing_supabase_url: set SUPABASE_URL (or VITE_SUPABASE_URL) in the ' +
      'environment or repo-root .env.',
    );
  }
  if (!key) {
    fail(
      'missing_service_role_key: this export reads prediction_ratings and needs ' +
      'SUPABASE_SERVICE_ROLE_KEY in the environment or repo-root .env. ' +
      'The publishable/anon key cannot read that table and is never substituted.',
    );
  }
  return { base, key };
}

// ─── Args ───────────────────────────────────────────────────────────────────

/** @param {string} iso @returns {boolean} */
const isIsoDate = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso);

/**
 * @returns {{ since: string, out: string }}
 */
function parseArgs() {
  const argv = process.argv.slice(2);
  const defaultSince = new Date(RUN_DATE_MS - DEFAULT_SINCE_DAYS * 86400000)
    .toISOString().slice(0, 10);
  let since = defaultSince;
  let out = DEFAULT_OUT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--since') {
      since = String(argv[i + 1] ?? '');
      i += 1;
      if (!isIsoDate(since)) {
        fail(`bad_since: --since expects YYYY-MM-DD, got "${since}".`);
      }
    } else if (arg === '--out') {
      out = String(argv[i + 1] ?? '');
      i += 1;
      if (!out) fail('bad_out: --out expects a path.');
    } else {
      fail(`unknown_arg: ${arg}. Usage: --since YYYY-MM-DD --out path.csv`);
    }
  }
  return { since, out };
}

// ─── PostgREST (GET only) ───────────────────────────────────────────────────

/**
 * Fetches every row of a query, paging with limit/offset. Any non-2xx aborts.
 * @param {{ base: string, key: string }} env
 * @param {string} table
 * @param {string} query  already-encoded query string, without limit/offset
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchAll(env, table, query) {
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${env.base}/rest/v1/${table}?${query}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      fail(
        `HTTP ${res.status} ${res.statusText} on ${table} (offset ${offset})\n${body}`,
      );
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
 * @template T
 * @param {readonly T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(items, size) {
  /** @type {T[][]} */
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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

// ─── Window state ───────────────────────────────────────────────────────────

/**
 * Whether a row's scoring window has closed, as a date comparison rather than a
 * string one.
 *
 *   'yes'  window_end is in the past -- the outcome is settled
 *   'no'   window_end is today or later -- still open, so the outcome is
 *          provisional and a `miss` may only mean "has not arrived yet"
 *   ''     window_end is null, i.e. a not_scored row. Deliberately NOT 'no':
 *          an unscored row has no window to close, and calling it open would
 *          smuggle a third meaning into a two-value column.
 *
 * @param {unknown} windowEnd  a 'YYYY-MM-DD' date, or null
 * @returns {'yes'|'no'|''}
 */
function windowClosed(windowEnd) {
  if (typeof windowEnd !== 'string' || !windowEnd) return '';
  const ms = Date.parse(`${windowEnd.slice(0, 10)}T00:00:00Z`);
  // Indeterminate rather than guessed: a date we cannot parse is not evidence
  // that the window is open.
  if (Number.isNaN(ms)) return '';
  return ms < RUN_DATE_MS ? 'yes' : 'no';
}

// ─── Ratings index ──────────────────────────────────────────────────────────

const ratingKey = (raportId, ebirdCode, siteIndex) =>
  `${raportId}|${ebirdCode}|${siteIndex}`;

/**
 * Most-recent rating plus distinct-rater count, per prediction.
 * @param {Array<Record<string, unknown>>} ratings
 * @returns {Map<string, { rating: string, note: string, rated_at: string, n: number }>}
 */
function indexRatings(ratings) {
  /** @type {Map<string, { rating: string, note: string, rated_at: string, users: Set<string> }>} */
  const acc = new Map();
  for (const r of ratings) {
    const key = ratingKey(r.raport_id, r.ebird_code, r.site_index);
    const ratedAt = String(r.rated_at ?? '');
    let entry = acc.get(key);
    if (!entry) {
      entry = { rating: '', note: '', rated_at: '', users: new Set() };
      acc.set(key, entry);
    }
    if (r.user_id) entry.users.add(String(r.user_id));
    // Latest wins; ISO timestamps compare lexicographically.
    if (!entry.rated_at || ratedAt > entry.rated_at) {
      entry.rated_at = ratedAt;
      entry.rating = String(r.rating ?? '');
      entry.note = r.note == null ? '' : String(r.note);
    }
  }

  /** @type {Map<string, { rating: string, note: string, rated_at: string, n: number }>} */
  const out = new Map();
  for (const [key, e] of acc) {
    out.set(key, {
      rating: e.rating,
      note: e.note,
      rated_at: e.rated_at,
      n: e.users.size,
    });
  }
  return out;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const { since, out: outPath } = parseArgs();
const env = await resolveEnv();

process.stderr.write(`Reading prediction_outcomes since ${since}…\n`);

// !inner turns the embedded raport into a join filter, so the whole window is
// one query instead of a raport-id round trip.
const outcomeSelect = [
  'raport_id', 'ebird_code', 'species_et', 'site_index', 'site_label',
  'predicted_pct', 'timing_band', 'window_source', 'window_start', 'window_end',
  'outcome', 'not_scored_reason', 'ee_first_date', 'obs_source', 'distance_km',
  'toenaosus_raport!inner(generated_at)',
].join(',');

const outcomes = await fetchAll(
  env,
  'prediction_outcomes',
  `select=${encodeURIComponent(outcomeSelect)}` +
    `&toenaosus_raport.generated_at=gte.${since}` +
    '&order=raport_id.asc,ebird_code.asc,site_index.asc',
);

const raportIds = [...new Set(outcomes.map((o) => String(o.raport_id)))];

process.stderr.write(
  `Reading prediction_ratings for ${raportIds.length} raports…\n`,
);

/** @type {Array<Record<string, unknown>>} */
const ratingRows = [];
for (const ids of chunk(raportIds, ID_CHUNK)) {
  const filter = `raport_id=in.(${ids.join(',')})`;
  ratingRows.push(...await fetchAll(
    env,
    'prediction_ratings',
    'select=raport_id,ebird_code,site_index,rating,note,user_id,rated_at' +
      `&${filter}&order=rated_at.asc`,
  ));
}
const ratings = indexRatings(ratingRows);

// ─── Rows ───────────────────────────────────────────────────────────────────

const str = (v) => (v == null ? '' : String(v));

const rows = outcomes.map((o) => {
  const raport = /** @type {Record<string, unknown> | null} */ (o.toenaosus_raport);
  const rated = ratings.get(ratingKey(o.raport_id, o.ebird_code, o.site_index));
  return {
    raport_id: str(o.raport_id),
    generated_at: str(raport && raport.generated_at),
    ebird_code: str(o.ebird_code),
    species_et: str(o.species_et),
    site_index: str(o.site_index),
    site_label: str(o.site_label),
    predicted_pct: str(o.predicted_pct),
    timing_band: str(o.timing_band),
    window_source: str(o.window_source),
    window_start: str(o.window_start),
    window_end: str(o.window_end),
    window_closed: windowClosed(o.window_end),
    outcome: str(o.outcome),
    not_scored_reason: str(o.not_scored_reason),
    ee_first_date: str(o.ee_first_date),
    obs_source: str(o.obs_source),
    distance_km: str(o.distance_km),
    rating: rated ? rated.rating : '',
    note: rated ? rated.note : '',
    rated_at: rated ? rated.rated_at : '',
    n_ratings: rated ? String(rated.n) : '',
  };
});

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, toCsv(CSV_COLUMNS, rows), 'utf8');

const ratedCount = rows.filter((r) => r.rating !== '').length;
const openCount = rows.filter((r) => r.window_closed === 'no').length;

console.log(`rows: ${rows.length}`);
console.log(`rows with a rating: ${ratedCount}`);
// Surfaced before the file goes anywhere: these outcomes are not settled yet.
console.log(`rows with an open window (window_closed=no, provisional): ${openCount}`);
console.log(`wrote ${outPath}`);
