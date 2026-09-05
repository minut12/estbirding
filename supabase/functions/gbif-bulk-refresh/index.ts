// P3 2026-09-05: country/year_from/rarity filter/density gate/country_code (ennustus P3)
// gbif-bulk-refresh
// GBIF occurrence ingest → public.gbif_occurrences (HISTORY backbone).
// EE pulls every species; foreign countries (FI/SE/LV/LT/RU) pull rare+ only.
// Additive: does not read or write any pre-existing table.
// Auth: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET (reused from other feeders).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCountUrl,
  buildOccurrenceUrl,
  type CountryCode,
  DENSITY_YEAR_FROM,
  isCountry,
  MAX_CELL_ROWS_DEFAULT,
  selectSpecies,
  YEAR_FROM_MIN,
} from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");

const SPECIES_META_URL = `${SUPABASE_URL}/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json`;
const GBIF = "https://api.gbif.org/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });

// GBIF eventDate can be year-only ("2016") or year-month ("2016-05"), which Postgres
// rejects as a date. GBIF also parses those into integer year/month/day fields — use
// them (robust), falling back to a strict eventDate check. Partial dates coerce to the
// first of the known period so the YEAR is preserved for the 10-yr HISTORY window.
// deno-lint-ignore no-explicit-any
function gbifDate(o: any): string | null {
  if (o.year) {
    const mm = String(o.month ?? 1).padStart(2, "0");
    const dd = String(o.day ?? 1).padStart(2, "0");
    return `${o.year}-${mm}-${dd}`;
  }
  if (o.eventDate) {
    const s = String(o.eventDate).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!WEBHOOK_SECRET) return json({ error: "server_misconfigured", detail: "VAATLUSTE_WEBHOOK_SECRET not set" }, 500);
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);

  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => ({}));
  const mode = body?.mode === "refresh" ? "refresh" : "backfill";
  const offset = Number.isInteger(body?.offset) ? body.offset : 0;
  const batchSize = Number.isInteger(body?.batch_size) ? body.batch_size : 25;
  const pageCap = Number.isInteger(body?.page_cap) ? body.page_cap : 10;
  const maxCellRows = Number.isInteger(body?.max_cell_rows) && body.max_cell_rows > 0
    ? body.max_cell_rows
    : MAX_CELL_ROWS_DEFAULT;

  const nowY = new Date().getUTCFullYear();
  const country: CountryCode = isCountry(body?.country) ? body.country : "EE";
  const yearFromOverride = Number.isInteger(body?.year_from) &&
      body.year_from >= YEAR_FROM_MIN && body.year_from <= nowY
    ? (body.year_from as number)
    : null;
  const yearFrom = yearFromOverride ?? (mode === "refresh" ? nowY - 1 : nowY - 10);
  const yearTo = nowY;

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const metaResp = await fetch(SPECIES_META_URL + "?t=" + Date.now());
  if (!metaResp.ok) return json({ error: "species_meta_fetch_failed", status: metaResp.status }, 500);
  const meta = await metaResp.json();
  const items = meta?.items ?? {};
  const species = selectSpecies(items, country);

  const slice = species.slice(offset, offset + batchSize);
  let rowsUpserted = 0;
  // deno-lint-ignore no-explicit-any
  const errors: any[] = [];
  const truncatedSpecies: string[] = [];
  const skippedDense: Array<{ species_name: string; count: number }> = [];

  for (const sp of slice) {
    try {
      const key = await resolveTaxonKey(sb, sp);
      if (!key) { errors.push({ sp: sp.species_name, e: "no_taxon_key" }); continue; }

      // Density gate (foreign only). Always measured over DENSITY_YEAR_FROM..nowY,
      // never the request's yearFrom: a species skipped at backfill would otherwise
      // pass a one-year refresh count and accumulate rows anyway.
      if (country !== "EE") {
        const cr = await fetchWithBackoff(buildCountUrl(key, country, DENSITY_YEAR_FROM, nowY));
        const cj = await cr.json().catch(() => null) as { count?: unknown } | null;
        const cellCount = Number(cj?.count);
        if (!cr.ok || !Number.isFinite(cellCount)) {
          errors.push({ sp: sp.species_name, e: "density_count_failed" });
          continue;
        }
        if (cellCount > maxCellRows) {
          skippedDense.push({ species_name: sp.species_name, count: cellCount });
          continue;
        }
      }

      const { rows: occ, truncated } = await pullOccurrences(key, country, yearFrom, yearTo, pageCap);
      if (truncated) truncatedSpecies.push(sp.species_name);
      const rows = occ
        // deno-lint-ignore no-explicit-any
        .map((o: any) => ({
          species_name: sp.species_name,
          species_lat: sp.species_lat,
          gbif_key: o.key,
          observed_at: gbifDate(o),
          lat: o.decimalLatitude,
          lon: o.decimalLongitude,
          country_code: country,
        }))
        // deno-lint-ignore no-explicit-any
        .filter((r: any) => r.gbif_key != null && r.lat != null && r.lon != null);
      if (rows.length) {
        const { error } = await sb.from("gbif_occurrences")
          .upsert(rows, { onConflict: "gbif_key", ignoreDuplicates: true });
        if (error) errors.push({ sp: sp.species_name, e: error.message });
        else rowsUpserted += rows.length;
      }
    } catch (e) {
      errors.push({ sp: sp.species_name, e: String(e).slice(0, 200) });
    }
  }

  const nextOffset = offset + batchSize;
  return json({
    ok: true,
    mode,
    country,
    year_from: yearFrom,
    year_to: yearTo,
    max_cell_rows: maxCellRows,
    processed_species: slice.length,
    from_offset: offset,
    next_offset: nextOffset,
    total_species: species.length,
    done: nextOffset >= species.length,
    rows_upserted: rowsUpserted,
    truncated_species: truncatedSpecies,
    skipped_dense: skippedDense,
    error_count: errors.length,
    errors: errors.slice(0, 20),
  });
});

// deno-lint-ignore no-explicit-any
async function resolveTaxonKey(sb: any, sp: { species_name: string; species_lat: string }): Promise<number | null> {
  const { data } = await sb.from("gbif_taxon_keys").select("taxon_key")
    .eq("species_name", sp.species_name).maybeSingle();
  if (data?.taxon_key) return data.taxon_key; // cached (incl. manual overrides) — never re-match
  const r = await fetchWithBackoff(
    `${GBIF}/species/match?name=${encodeURIComponent(sp.species_lat)}&kingdom=Animalia`);
  const m = await r.json().catch(() => ({}));
  const key = m?.usageKey ?? null;
  if (key) {
    await sb.from("gbif_taxon_keys").upsert(
      {
        species_name: sp.species_name,
        species_lat: sp.species_lat,
        taxon_key: key,
        match_confidence: m?.matchType ?? null,
        matched_at: new Date().toISOString(),
      },
      { onConflict: "species_name" });
  }
  return key;
}

async function pullOccurrences(
  taxonKey: number,
  country: CountryCode,
  yFrom: number,
  yTo: number,
  pageCap: number,
) {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  let truncated = false;
  for (let page = 0; page < pageCap; page++) {
    const url = buildOccurrenceUrl(taxonKey, country, yFrom, yTo, page);
    const r = await fetchWithBackoff(url);
    if (!r.ok) break;
    const j = await r.json();
    for (const o of (j.results || [])) out.push(o);
    if (j.endOfRecords) break;
    // Exited by pageCap, not by endOfRecords -> more rows exist than we pulled.
    if (page === pageCap - 1) truncated = true;
  }
  return { rows: out, truncated };
}

// Retry GBIF on 429 / 5xx with exponential backoff.
async function fetchWithBackoff(url: string, tries = 4): Promise<Response> {
  let delay = 500;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.status !== 429 && r.status < 500) return r;
    if (i === tries - 1) return r;
    await new Promise((res) => setTimeout(res, delay));
    delay *= 2;
  }
  return fetch(url);
}
