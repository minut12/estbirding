// Shared eBird fetch + Supabase hand-off for the Netlify scheduled functions and the relay.
//
// Lives outside netlify/functions/ on purpose: anything in that directory is
// deployed as its own function, and this module is a library, not an endpoint.
//
// Why Netlify at all: eBird answers 418 to Supabase's egress IPs but 200 to
// Netlify's (verified by netlify/functions/ebird-probe.js, 2026-08-30), so the
// Edge Functions cannot call api.ebird.org themselves. This module is the port
// of the two n8n workflows that used to do the fetching, ahead of n8n Cloud
// shutting down on 2026-09-19.
const EBIRD = 'https://api.ebird.org/v2';

// Ported verbatim from the n8n "Europe eBird Cache Refresh" Code node.
const EUROPE_COUNTRIES = ['FI', 'SE', 'LV', 'LT', 'PL', 'BY', 'RU'];
const SPECIES_META_URL =
  'https://rfjhrosxbaihyrnbmmbl.supabase.co/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json';
const SEVEN_DAYS_MS = 7 * 86400 * 1000;

// Scheduled functions get 30 s of wall clock. The Europe job makes 7 sequential
// eBird calls (~2 s total in n8n today), so this ceiling should never be hit —
// it exists so a slow eBird degrades into a partial insert instead of a timeout
// that writes nothing at all.
const EUROPE_BUDGET_MS = 22000;
const COUNTRY_TIMEOUT_MS = 8000;

function env(name) {
  const v = (Netlify.env.get(name) || '').trim();
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export async function ebirdGet(path, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(EBIRD + path, {
      headers: { 'X-eBirdApiToken': env('EBIRD_API_TOKEN'), Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } finally { clearTimeout(t); }
}

export async function postEf(fn, headers, body, { timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env('SUPABASE_FUNCTIONS_URL')}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text: text.slice(0, 500) };
  } finally { clearTimeout(t); }
}

// Job 1: EE recent → ebird-bulk-refresh  (port of n8n "My workflow 2")
export async function runEeRefresh() {
  const started = Date.now();
  const r = await ebirdGet('/data/obs/EE/recent?maxResults=10000&back=7');
  if (!r.ok) return { job: 'ee', ok: false, stage: 'ebird', status: r.status, sample: r.text.slice(0, 200) };
  let observations;
  try {
    observations = JSON.parse(r.text);
  } catch {
    return { job: 'ee', ok: false, stage: 'parse', status: r.status, sample: r.text.slice(0, 200), took_ms: Date.now() - started };
  }
  const up = await postEf('ebird-bulk-refresh', { 'x-refresh-secret': env('EBIRD_REFRESH_SECRET') }, { observations });
  return { job: 'ee', ok: up.ok, stage: 'upsert', status: up.status, fetched: observations.length, ef: up.text, took_ms: Date.now() - started };
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseObsDateMs(s) {
  const ymd = String(s || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const ms = Date.parse(ymd + 'T12:00:00Z');
  return Number.isFinite(ms) ? ms : null;
}

// Step 1 of the Europe job — species_meta gives the ebirdCode -> species_name map
// that decides which notable observations we actually track.
async function loadCodeToName() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), COUNTRY_TIMEOUT_MS);
  try {
    const res = await fetch(SPECIES_META_URL, { signal: controller.signal });
    if (!res.ok) throw new Error('species_meta HTTP ' + res.status);
    const meta = await res.json();
    const items = (meta && meta.items && typeof meta.items === 'object') ? meta.items : {};
    const codeToName = {};
    for (const [name, item] of Object.entries(items)) {
      const code = (item && typeof item.ebirdCode === 'string') ? item.ebirdCode.trim() : '';
      const cleanName = String(name || '').trim();
      if (code && cleanName) codeToName[code] = cleanName;
    }
    return codeToName;
  } finally { clearTimeout(t); }
}

// Job 2: Europe notable → insert-europe-ebird-cache  (port of the n8n Code node)
export async function runEuropeRefresh() {
  const started = Date.now();
  const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;

  let codeToName;
  try {
    codeToName = await loadCodeToName();
  } catch (e) {
    return {
      job: 'europe', ok: false, stage: 'species_meta', error: 'species_meta_fetch_failed',
      detail: String((e && e.message) || e), took_ms: Date.now() - started,
    };
  }

  const trackedCodeCount = Object.keys(codeToName).length;
  if (trackedCodeCount === 0) {
    return {
      job: 'europe', ok: false, stage: 'species_meta', error: 'no_tracked_species',
      detail: 'codeToName is empty', took_ms: Date.now() - started,
    };
  }

  const rows = [];
  const countries = {};
  const errors = [];
  let partial = false;

  for (const cc of EUROPE_COUNTRIES) {
    // Post what we have rather than losing the whole run to the 30 s cap.
    if (Date.now() - started > EUROPE_BUDGET_MS) {
      partial = true;
      countries[cc] = { fetched: 0, tracked: 0, rows: 0, error: 'skipped_budget' };
      continue;
    }

    let obs = [];
    try {
      const res = await ebirdGet(
        `/data/obs/${cc}/recent/notable?back=7&maxResults=10000&detail=simple`,
        { timeoutMs: COUNTRY_TIMEOUT_MS },
      );
      if (!res.ok) {
        errors.push({ cc, status: res.status, snippet: res.text.slice(0, 200) });
        countries[cc] = { fetched: 0, tracked: 0, rows: 0, error: 'HTTP ' + res.status };
        continue;
      }
      obs = JSON.parse(res.text);
      if (!Array.isArray(obs)) obs = [];
    } catch (e) {
      errors.push({ cc, error: String((e && e.message) || e) });
      countries[cc] = { fetched: 0, tracked: 0, rows: 0, error: 'fetch_failed' };
      continue;
    }

    const bySpecies = {};
    let trackedCount = 0;
    for (const o of obs) {
      const code = String((o && o.speciesCode) || '').trim();
      if (!code) continue;
      const dateMs = parseObsDateMs(o && o.obsDt);
      if (dateMs == null) continue;
      if (dateMs < sevenDaysAgo) continue;

      if (!bySpecies[code]) bySpecies[code] = { count: 0, latestMs: 0, latest: null };
      bySpecies[code].count++;
      if (dateMs > bySpecies[code].latestMs) {
        bySpecies[code].latestMs = dateMs;
        bySpecies[code].latest = o;
      }
    }

    for (const [code, agg] of Object.entries(bySpecies)) {
      const speciesName = codeToName[code];
      if (!speciesName) continue;
      trackedCount++;
      const latest = agg.latest || {};
      rows.push({
        species_name: speciesName,
        country_code: cc,
        occ7: agg.count,
        latest_obs_date: String(latest.obsDt || '').slice(0, 10) || null,
        latest_lat: safeNum(latest.lat),
        latest_lon: safeNum(latest.lng),
        latest_loc: typeof latest.locName === 'string' ? latest.locName.slice(0, 500) : null,
      });
    }

    countries[cc] = { fetched: obs.length, tracked: trackedCount, rows: trackedCount };
  }

  // n8n's "Have rows to insert?" IF node — the false leg skipped the POST.
  if (!rows.length) {
    return {
      job: 'europe', ok: true, rows: 0, skipped: true, reason: 'no_rows',
      countries, errors, trackedCodeCount, partial, took_ms: Date.now() - started,
    };
  }

  const ef = await postEf(
    'insert-europe-ebird-cache',
    { 'x-webhook-secret': env('VAATLUSTE_WEBHOOK_SECRET') },
    { rows },
  );
  return {
    job: 'europe', ok: ef.ok, stage: 'insert', status: ef.status, rows: rows.length,
    countries, errors, trackedCodeCount, partial, ef: ef.text, took_ms: Date.now() - started,
  };
}
