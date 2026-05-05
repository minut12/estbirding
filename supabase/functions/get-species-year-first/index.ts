// supabase/functions/get-species-year-first/index.ts
//
// Returns the earliest current-year observation date per species,
// using elurikkus.ee paginated search via elurikkus-proxy.
//
// Auth: X-Webhook-Secret header (shared with insert-elurikkus-raport).
// Cache: species_year_first_obs table, 24h TTL.
//
// Input:  POST { species: string[], year: number, force?: boolean }
// Output: {
//   first_obs: { [species_et]: string | null },  // ISO date or null
//   stats: { cache_hits, cache_misses, fetched, cached_returned, errors }
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") ?? "";

const SPRING_CUTOFF_MMDD = "02-15";   // ignore winter-stray records
const CACHE_TTL_HOURS = 24;
const PAGE_LIMIT = 100;
const MAX_PAGES = 30;
const CONCURRENCY = 3;
const PAGE_THROTTLE_MS = 250;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-webhook-secret, content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface CacheRow {
  species_et: string;
  year: number;
  first_obs_date: string;
  fetched_at: string;
}

function buildEluSearchUrl(text: string, offset: number, limit: number): string {
  const u = new URL("https://elurikkus.ee/app/occurrences/search");
  u.searchParams.set("text", text);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("offset", String(offset));
  u.searchParams.set("orderAscending", "false");
  u.searchParams.set("orderBy", "event_date_naive");
  u.searchParams.set("_ts", String(Date.now()));
  return u.toString();
}

function extractIsoDatesFromBody(body: string): string[] {
  const dates: string[] = [];
  const re = /\b(\d{4}-\d{2}-\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    dates.push(m[1]);
  }
  return dates;
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 503) {
        lastErr = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("RateLimit") || msg.includes("429") || msg.includes("ECONN") || msg.includes("network")) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed after retries");
}

async function fetchEarliestForSpecies(
  speciesEt: string,
  year: number,
  proxyBaseUrl: string,
): Promise<string | null> {
  const yearPrefix = `${year}-`;
  const cutoff = `${year}-${SPRING_CUTOFF_MMDD}`;
  let earliest: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const upstreamUrl = buildEluSearchUrl(speciesEt, page * PAGE_LIMIT, PAGE_LIMIT);
    const proxyUrl = `${proxyBaseUrl}?url=${encodeURIComponent(upstreamUrl)}`;

    let body: string;
    try {
      const res = await fetchWithRetry(proxyUrl);
      if (!res.ok) {
        console.warn(`[get-species-year-first] ${speciesEt} page ${page}: HTTP ${res.status}`);
        break;
      }
      body = await res.text();
    } catch (err) {
      console.warn(`[get-species-year-first] ${speciesEt} page ${page} fetch error after retries:`, err);
      break;
    }

    const dates = extractIsoDatesFromBody(body);
    if (dates.length === 0) break;

    let pageHasCurrentYear = false;
    let pageHasOlderThanYear = false;
    for (const d of dates) {
      if (d.startsWith(yearPrefix)) {
        pageHasCurrentYear = true;
        if (d >= cutoff && (!earliest || d < earliest)) {
          earliest = d;
        }
      } else if (d < yearPrefix + "01-01") {
        pageHasOlderThanYear = true;
      }
    }

    if (pageHasOlderThanYear && !pageHasCurrentYear) break;

    if (page + 1 < MAX_PAGES) {
      await new Promise((r) => setTimeout(r, PAGE_THROTTLE_MS));
    }
  }

  return earliest;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WEBHOOK_SECRET) {
    return json({ error: "server_misconfigured" }, 500);
  }
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!provided || provided !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);

  let body: { species?: unknown; year?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const speciesList = Array.isArray(body.species)
    ? body.species.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];
  const year = typeof body.year === "number" && Number.isInteger(body.year) ? body.year : new Date().getUTCFullYear();
  const force = body.force === true;

  if (speciesList.length === 0) {
    return json({ first_obs: {}, stats: { cache_hits: 0, cache_misses: 0, fetched: 0, cached_returned: 0, errors: 0 } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const proxyBaseUrl = `${SUPABASE_URL}/functions/v1/elurikkus-proxy`;
  const cutoffMs = Date.now() - CACHE_TTL_HOURS * 3600 * 1000;

  const cacheMap: Record<string, CacheRow> = {};
  if (!force) {
    const { data: rows } = await supabase
      .from("species_year_first_obs")
      .select("species_et, year, first_obs_date, fetched_at")
      .in("species_et", speciesList)
      .eq("year", year);
    for (const row of (rows ?? []) as CacheRow[]) {
      cacheMap[row.species_et] = row;
    }
  }

  const toFetch: string[] = [];
  const result: Record<string, string | null> = {};
  let cacheHits = 0;

  for (const sp of speciesList) {
    const cached = cacheMap[sp];
    const fresh = cached && new Date(cached.fetched_at).getTime() > cutoffMs;
    if (fresh) {
      result[sp] = cached.first_obs_date;
      cacheHits++;
    } else {
      toFetch.push(sp);
    }
  }

  let fetched = 0;
  let errors = 0;
  if (toFetch.length > 0) {
    const fetchResults = await mapWithConcurrency(toFetch, CONCURRENCY, async (sp) => {
      try {
        const earliest = await fetchEarliestForSpecies(sp, year, proxyBaseUrl);
        return { species_et: sp, first_obs_date: earliest };
      } catch (err) {
        console.warn(`[get-species-year-first] error for ${sp}:`, err);
        errors++;
        return { species_et: sp, first_obs_date: null };
      }
    });

    const upsertRows: Array<{ species_et: string; year: number; first_obs_date: string; fetched_at: string }> = [];
    const fetchedAt = new Date().toISOString();
    for (const r of fetchResults) {
      result[r.species_et] = r.first_obs_date;
      if (r.first_obs_date) {
        upsertRows.push({
          species_et: r.species_et,
          year,
          first_obs_date: r.first_obs_date,
          fetched_at: fetchedAt,
        });
        fetched++;
      }
    }

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("species_year_first_obs")
        .upsert(upsertRows, { onConflict: "species_et,year" });
      if (upsertErr) {
        console.warn("[get-species-year-first] upsert failed:", upsertErr.message);
      }
    }
  }

  return json({
    first_obs: result,
    stats: {
      cache_hits: cacheHits,
      cache_misses: toFetch.length,
      fetched,
      cached_returned: cacheHits,
      errors,
    },
  });
});
