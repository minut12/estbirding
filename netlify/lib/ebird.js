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

// P104: NW Russia regions near Estonia. Fetched only to spot brand-new species for
// europe-new-species; the RU-wide notable rows below stay exactly as before.
const NW_RUSSIA_REGIONS = ['RU-LEN', 'RU-SPE', 'RU-PSK', 'RU-NGR', 'RU-KR'];
const NEW_SPECIES_TIMEOUT_MS = 12000;
// P104: everything after the normal insert must finish by here (Netlify scheduled cap is 30 s).
const NEW_SPECIES_DEADLINE_MS = 26000;

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

export async function postEf(fn, headers, body, { timeoutMs = 25000, maxText = 500 } = {}) {
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
    return { status: res.status, ok: res.ok, text: text.slice(0, maxText) };
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

// P104: notable obs -> { code: { count, latestMs, latest, exotic, nonExotic } } (last 7 days).
function aggregateNotable(obs, sevenDaysAgo) {
  const bySpecies = {};
  for (const o of obs) {
    const code = String((o && o.speciesCode) || '').trim();
    if (!code) continue;
    const dateMs = parseObsDateMs(o && o.obsDt);
    if (dateMs == null) continue;
    if (dateMs < sevenDaysAgo) continue;

    if (!bySpecies[code]) bySpecies[code] = { count: 0, latestMs: 0, latest: null, exotic: '', nonExotic: false };
    bySpecies[code].count++;
    const ex = String((o && o.exoticCategory) || '').trim();
    if (ex) bySpecies[code].exotic = ex;
    else bySpecies[code].nonExotic = true;
    if (dateMs > bySpecies[code].latestMs) {
      bySpecies[code].latestMs = dateMs;
      bySpecies[code].latest = o;
    }
  }
  return bySpecies;
}

function toCacheRow(speciesName, cc, agg) {
  const latest = agg.latest || {};
  return {
    species_name: speciesName,
    country_code: cc,
    occ7: agg.count,
    latest_obs_date: String(latest.obsDt || '').slice(0, 10) || null,
    latest_lat: safeNum(latest.lat),
    latest_lon: safeNum(latest.lng),
    latest_loc: typeof latest.locName === 'string' ? latest.locName.slice(0, 500) : null,
  };
}

// P104: candidate payload for europe-new-species (exoticCategory only if every obs was exotic).
function toCandidate(code, agg, region) {
  const o = agg.latest || {};
  return {
    code,
    comName: typeof o.comName === 'string' ? o.comName : '',
    sciName: typeof o.sciName === 'string' ? o.sciName : '',
    region,
    count: agg.count,
    exoticCategory: agg.nonExotic ? null : (agg.exotic || null),
    latest: {
      obsDt: o.obsDt || null,
      locName: typeof o.locName === 'string' ? o.locName.slice(0, 200) : null,
      lat: safeNum(o.lat),
      lng: safeNum(o.lng),
      subId: o.subId || null,
      obsReviewed: o.obsReviewed === true,
      obsValid: o.obsValid === true,
    },
  };
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
export async function runEuropeRefresh({ dry = false } = {}) {
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
  const candidates = [];
  const aggByCountry = {};

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

    const bySpecies = aggregateNotable(obs, sevenDaysAgo);
    aggByCountry[cc] = bySpecies;
    let trackedCount = 0;

    for (const [code, agg] of Object.entries(bySpecies)) {
      const speciesName = codeToName[code];
      if (!speciesName) {
        // P104: unknown code -> candidate for europe-new-species (Russia comes from the NW regions below).
        if (cc !== 'RU') candidates.push(toCandidate(code, agg, cc));
        continue;
      }
      trackedCount++;
      rows.push(toCacheRow(speciesName, cc, agg));
    }

    countries[cc] = { fetched: obs.length, tracked: trackedCount, rows: trackedCount };
  }

  // P104: the normal cache insert runs first, exactly as before, so nothing below can delay it.
  let insert = null;
  if (!dry && rows.length) {
    insert = await postEf(
      'insert-europe-ebird-cache',
      { 'x-webhook-secret': env('VAATLUSTE_WEBHOOK_SECRET') },
      { rows },
    );
  }

  // P104: NW Russia notable, used only for brand-new species detection (skipped when time is short).
  const nwRegions = {};
  for (const region of NW_RUSSIA_REGIONS) {
    if (Date.now() - started > NEW_SPECIES_DEADLINE_MS - COUNTRY_TIMEOUT_MS) {
      nwRegions[region] = { error: 'skipped_budget' };
      continue;
    }
    try {
      const res = await ebirdGet(
        `/data/obs/${region}/recent/notable?back=7&maxResults=10000&detail=simple`,
        { timeoutMs: COUNTRY_TIMEOUT_MS },
      );
      if (!res.ok) {
        nwRegions[region] = { error: 'HTTP ' + res.status };
        continue;
      }
      let obs = JSON.parse(res.text);
      if (!Array.isArray(obs)) obs = [];
      const agg = aggregateNotable(obs, sevenDaysAgo);
      let n = 0;
      for (const [code, a] of Object.entries(agg)) {
        if (codeToName[code]) continue;
        candidates.push(toCandidate(code, a, region));
        n++;
      }
      nwRegions[region] = { fetched: obs.length, candidates: n };
    } catch (e) {
      nwRegions[region] = { error: String((e && e.message) || e) };
    }
  }

  // P104: hand unknown codes to europe-new-species within the time left; skipped codes come back next run.
  let newSpecies = { candidates: candidates.length };
  const nsBudget = NEW_SPECIES_DEADLINE_MS - (Date.now() - started);
  if (candidates.length && nsBudget >= 3000) {
    try {
      const ns = await postEf(
        'europe-new-species',
        { 'x-webhook-secret': env('VAATLUSTE_WEBHOOK_SECRET') },
        { candidates, dry_run: dry },
        { timeoutMs: Math.min(NEW_SPECIES_TIMEOUT_MS, nsBudget), maxText: 200000 },
      );
      let parsed = null;
      try { parsed = JSON.parse(ns.text); } catch { parsed = null; }
      newSpecies = { candidates: candidates.length, status: ns.status, ok: ns.ok, result: parsed || ns.text.slice(0, 500) };
      const handled = parsed && !dry ? [...(parsed.added || []), ...(parsed.linked || [])] : [];
      const newRows = [];
      for (const s of handled) {
        if (!s || !s.code || !s.name) continue;
        for (const [cc, agg] of Object.entries(aggByCountry)) {
          if (agg[s.code]) newRows.push(toCacheRow(s.name, cc, agg[s.code]));
        }
      }
      // Rows for just-added species: a second small insert if time allows, otherwise the next run adds them.
      const rowBudget = NEW_SPECIES_DEADLINE_MS - (Date.now() - started);
      if (newRows.length && rowBudget >= 2000) {
        const ins2 = await postEf(
          'insert-europe-ebird-cache',
          { 'x-webhook-secret': env('VAATLUSTE_WEBHOOK_SECRET') },
          { rows: newRows },
          { timeoutMs: rowBudget },
        );
        newSpecies.rows = { count: newRows.length, status: ins2.status, ok: ins2.ok };
      } else if (newRows.length) {
        newSpecies.rows = { count: newRows.length, skipped: 'budget' };
      }
    } catch (e) {
      newSpecies = { candidates: candidates.length, ok: false, error: String((e && e.message) || e) };
    }
  } else if (candidates.length) {
    newSpecies = { candidates: candidates.length, skipped: 'budget' };
  }

  if (dry) {
    return {
      job: 'europe', ok: true, dry: true, rows: rows.length, countries, nwRegions, newSpecies,
      errors, trackedCodeCount, partial, took_ms: Date.now() - started,
    };
  }

  // n8n's "Have rows to insert?" IF node — the false leg skipped the POST.
  if (!insert) {
    return {
      job: 'europe', ok: true, rows: 0, skipped: true, reason: 'no_rows',
      countries, nwRegions, newSpecies, errors, trackedCodeCount, partial, took_ms: Date.now() - started,
    };
  }

  return {
    job: 'europe', ok: insert.ok, stage: 'insert', status: insert.status, rows: rows.length,
    countries, nwRegions, newSpecies, errors, trackedCodeCount, partial, ef: insert.text, took_ms: Date.now() - started,
  };
}
