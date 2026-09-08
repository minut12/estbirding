// prediction-outcomes
// P7b: scores closed Tõenäosus predictions against real Estonian arrivals and
// writes public.prediction_outcomes, the calibration set.
//
// Shape: modelled on batch-driver -- a scheduled, service-role, DB-only job.
// No Anthropic, no eBird, no EdgeRuntime.waitUntil: the work is a handful of
// batched PostgREST reads and one upsert, so it finishes inside the request and
// the 150 s gateway timeout is never in play. openRun / touchRun / closeRun are
// copied from batch-driver/index.ts:354-424 rather than shared, per the house
// style documented at elurikkus-orchestrator/index.ts:101-103: porting a job
// must never edit code the live schedulers run.
//
// Auth: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET.
// Scheduled via public.m7_call_ef, which needs verify_jwt = false in
// supabase/config.toml -- without that stanza every scheduled call is rejected
// before this file runs.
//
// What gets scored, and when:
//   - Both `toenaosus_raport.entries` AND `toenaosus_raport.corridor_watchlist`.
//     A watch-list item has no timing_band, so it is labelled
//     timing_band='watchlist' and takes the phenology window -- it carries
//     phenology_gate, phenology_mode and predicted_sites, the same inputs the
//     `in_season` branch reads. This is not an edge case: since the ebird_code
//     floor, all 45 watch-list rows are species with no `entries` row in the
//     same raport, so skipping them would leave every watch-list prediction --
//     and every P7a rating left on one -- out of the calibration set entirely.
//   - An item whose derived window_end has just closed (by default, ended
//     within the last day) is scored against arrivals inside its window.
//   - An entry that was never scoreable (`passed`, `out_of_window`, or an
//     `in_season` with no usable phenology row) gets its `not_scored` row as
//     soon as the raport appears, since there is no window to wait for.
// Both are idempotent: the unique constraint is (raport_id, ebird_code,
// site_index) and this upserts on it, so re-running the same day rewrites the
// same rows rather than adding any.
//
// Arrival sources, in the priority order stamped into obs_source:
//   1. elurikkus_observations -- per-observation data from elurikkus.ee. RLS is
//      on with ZERO policies, so ONLY the service-role key can read it; an anon
//      client gets HTTP 200 and an empty body, which would silently score every
//      prediction a miss.
//   2. vaatluste_raport.estonia_entries / elurikkus_raport.estonia_entries.
// The species join is `entry.species_et = species_name`, an EXACT string match.
// That is not a shortcut: compose-elurikkus-eesti-entries/index.ts:199 assigns
// `species_et: agg.species_name` verbatim, so the two vocabularies are the same
// string by construction, and idx_elurikkus_obs_species_name /
// idx_elurikkus_obs_species_observed index exactly this comparison. A lower()
// or normalize() join would use neither index and buy nothing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addDays,
  type ArrivalRecord,
  buildRowsForEntry,
  dateOnly,
  deriveWindow,
  num,
  type ObsSource,
  type OutcomeRow,
  type PredictedSite,
  projectPhenologyEnd,
  seasonWindowKind,
  SITE_INDEX_SPECIES_LEVEL,
  WATCHLIST_BAND,
  WINDOW_MAX_DAYS,
} from "./outcomes.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

/**
 * Hard floor. `ebird_code` first appears on raport 3cd0a782 (2026-09-05 12:38
 * UTC) and `predicted_sites` on 93110f31 (2026-09-05 13:37 UTC); every earlier
 * raport has a null ebird_code on every entry, which the table's NOT NULL would
 * reject. Never score below this timestamp.
 */
const RAPORT_FLOOR_ISO = "2026-09-05T13:37:04.962692Z";

/**
 * How far back to read raports. An entry's window can run at most
 * WINDOW_MAX_DAYS past its raport, so nothing older than this can still have a
 * window closing today. Two days of slack for a missed run.
 */
const SCAN_LOOKBACK_DAYS = WINDOW_MAX_DAYS + 2;

/** PostgREST `in.()` list size -- keeps the request URL well short of limits. */
const IN_CHUNK = 100;

/** Rows per upsert request. */
const UPSERT_CHUNK = 500;

/** Same guard as batch-driver: the edge gateway 504s at 150 s. */
const BUDGET_MS = 90_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// ---------------------------------------------------------------------------
// cron_runs logging -- openRun / touchRun / closeRun copied from batch-driver
// (via m7-probe, elurikkus-orchestrator, vaatluste-orchestrator) rather than
// shared, so adding a job never edits code the live schedulers run.
// ---------------------------------------------------------------------------

function adminClient() {
  return createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

// Inferred from the call, NOT ReturnType<typeof createClient>: instantiating
// that generic by its constraints resolves every table name to `never`.
type Admin = ReturnType<typeof adminClient>;

async function openRun(
  sb: Admin,
  job: string,
  runId: string,
  hop: number,
  state: Record<string, unknown>,
): Promise<number | null> {
  const { data, error } = await sb
    .from("cron_runs")
    .insert({ job, run_id: runId, hop, state })
    .select("id")
    .single();
  if (error) {
    console.error("[cron_runs open]", error.message);
    return null;
  }
  return (data as { id: number }).id;
}

// Heartbeat after every stage, so a run that is later killed still leaves
// behind how far it actually got. Never throws: a logging failure must not
// abort a job that is otherwise making progress.
async function touchRun(
  sb: Admin,
  id: number | null,
  calls: number,
  state: Record<string, unknown>,
): Promise<void> {
  if (id === null) return;
  try {
    const { error } = await sb
      .from("cron_runs")
      .update({ calls, state })
      .eq("id", id);
    if (error) console.error("[cron_runs touch]", error.message);
  } catch (e) {
    console.error("[cron_runs touch]", errMsg(e));
  }
}

async function closeRun(
  sb: Admin,
  id: number | null,
  patch: {
    calls: number;
    ok: boolean;
    state: Record<string, unknown>;
    error: string | null;
  },
): Promise<void> {
  if (id === null) return;
  const { error } = await sb
    .from("cron_runs")
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq("id", id);
  if (error) console.error("[cron_runs close]", error.message);
}

// ---------------------------------------------------------------------------
// Raport reading
// ---------------------------------------------------------------------------

interface RaportRow {
  id: string;
  generated_at: string;
  season: string | null;
  entries: unknown;
  corridor_watchlist: unknown;
}

interface PhenologyRow {
  ebird_code: string | null;
  spring_window: string | null;
  autumn_window: string | null;
}

/** One prediction awaiting a row: an entry plus the window we derived for it. */
interface Candidate {
  raportId: string;
  ebirdCode: string;
  speciesEt: string;
  band: string;
  predictedPct: number | null;
  sites: PredictedSite[];
  window: NonNullable<ReturnType<typeof deriveWindow>>;
  /** From corridor_watchlist rather than entries; entries win a key collision. */
  isWatchlist: boolean;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

/**
 * Predicted sites carry `lon` (see toenaosus-orchestrator's sites payload);
 * `lng` is accepted as a fallback so a future rename cannot silently zero out
 * every site distance.
 */
function readSites(entry: Record<string, unknown>): PredictedSite[] {
  return asArray(entry.predicted_sites).map((s) => ({
    label: typeof s.label === "string" ? s.label : null,
    lat: num(s.lat),
    lon: num(s.lon ?? s.lng),
  }));
}

// ---------------------------------------------------------------------------
// Arrival reading
// ---------------------------------------------------------------------------

function pushArrival(
  index: Map<string, ArrivalRecord[]>,
  speciesEt: unknown,
  date: string,
  lat: number | null,
  lon: number | null,
  source: ObsSource,
): void {
  if (typeof speciesEt !== "string" || !speciesEt || !date) return;
  let bucket = index.get(speciesEt);
  if (!bucket) index.set(speciesEt, bucket = []);
  bucket.push({ date, lat, lon, source });
}

/**
 * Arrivals for the given Estonian species names, dated inside [from, to].
 * elurikkus_observations is read in chunks; the two raport tables are read
 * whole over the period and filtered in memory, because the species name lives
 * inside a jsonb array that PostgREST cannot index-filter on.
 */
async function loadArrivals(
  sb: Admin,
  speciesNames: readonly string[],
  from: string,
  to: string,
): Promise<{ index: Map<string, ArrivalRecord[]>; calls: number }> {
  const index = new Map<string, ArrivalRecord[]>();
  const wanted = new Set(speciesNames);
  let calls = 0;

  // 1. elurikkus_observations -- service-role only (RLS on, zero policies).
  for (const names of chunk(speciesNames, IN_CHUNK)) {
    const { data, error } = await sb
      .from("elurikkus_observations")
      .select("species_name, observed_at, lat, lon")
      .in("species_name", names)
      .gte("observed_at", from)
      .lte("observed_at", to);
    calls += 1;
    if (error) throw new Error("elurikkus_observations: " + error.message);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      pushArrival(
        index,
        row.species_name,
        dateOnly(row.observed_at),
        num(row.lat),
        num(row.lon),
        "elurikkus_observations",
      );
    }
  }

  // 2. The two Ülevaade report tables. A raport cannot report a date before it
  // was generated, so `generated_at >= from` cannot miss an in-window arrival.
  const reportTables: ReadonlyArray<[string, ObsSource]> = [
    ["vaatluste_raport", "vaatluste_raport"],
    ["elurikkus_raport", "elurikkus_raport"],
  ];
  for (const [table, source] of reportTables) {
    const { data, error } = await sb
      .from(table)
      .select("generated_at, estonia_entries")
      .gte("generated_at", from);
    calls += 1;
    if (error) throw new Error(table + ": " + error.message);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      for (const entry of asArray(row.estonia_entries)) {
        const speciesEt = entry.species_et;
        if (typeof speciesEt !== "string" || !wanted.has(speciesEt)) continue;
        const date = dateOnly(entry.date);
        if (!date || date < from || date > to) continue;
        // Coordinates are not guaranteed here: nothing on the write path
        // validates them (insert-vaatluste-raport/index.ts:65 checks array-ness
        // only) and the documented type is `number | null`.
        pushArrival(
          index,
          speciesEt,
          date,
          num(entry.lat),
          num(entry.lng),
          source,
        );
      }
    }
  }

  return { index, calls };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json(500, {
      error: "server_misconfigured",
      detail: "VAATLUSTE_WEBHOOK_SECRET not set",
    });
  }
  if (req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json(401, { error: "unauthorized" });
  }

  const today = new Date().toISOString().slice(0, 10);

  // GET ?dry=1 -> report the configuration, read and write nothing.
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("dry") !== "1") {
      return json(400, { error: "dry_run_only", detail: "GET requires dry=1" });
    }
    return json(200, {
      ok: true,
      dry: true,
      job: "prediction-outcomes",
      today,
      raport_floor: RAPORT_FLOOR_ISO,
      scan_lookback_days: SCAN_LOOKBACK_DAYS,
      window_max_days: WINDOW_MAX_DAYS,
      default_due_from: addDays(today, -1),
      default_due_to: today,
      budget_ms: BUDGET_MS,
    });
  }

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // The due window: which closed predictions this run picks up. Default is the
  // last day, which is what the nightly schedule wants. `due_from` / `due_to`
  // widen it for a deliberate manual backfill and are never set by the cron.
  const dueFrom = dateOnly(body.due_from) || addDays(today, -1);
  const dueTo = dateOnly(body.due_to) || today;

  const runId = typeof body.run_id === "string" && body.run_id
    ? body.run_id
    : crypto.randomUUID();
  const source = typeof body.source === "string" ? body.source : "manual";

  const started = Date.now();
  const sb = adminClient();

  const state: Record<string, unknown> = {
    stage: "start",
    source,
    today,
    due_from: dueFrom,
    due_to: dueTo,
  };

  const rowId = await openRun(sb, "prediction-outcomes", runId, 0, state);
  let calls = 0;

  try {
    // --- 1. Raports in scan range, never below the floor -------------------
    const scanFromDate = addDays(today, -SCAN_LOOKBACK_DAYS);
    const floorDate = dateOnly(RAPORT_FLOOR_ISO);
    const scanFrom = scanFromDate > floorDate
      ? scanFromDate + "T00:00:00Z"
      : RAPORT_FLOOR_ISO;

    const { data: raportData, error: raportErr } = await sb
      .from("toenaosus_raport")
      .select("id, generated_at, season, entries, corridor_watchlist")
      .gte("generated_at", scanFrom)
      .order("generated_at", { ascending: true });
    calls += 1;
    if (raportErr) throw new Error("toenaosus_raport: " + raportErr.message);
    const raports = (raportData ?? []) as unknown as RaportRow[];

    state.stage = "raports_read";
    state.scan_from = scanFrom;
    state.raports_scanned = raports.length;
    await touchRun(sb, rowId, calls, state);

    // --- 2. Phenology, for the in_season windows --------------------------
    // Watch-list items need the same phenology lookup as `in_season` entries.
    const codes = new Set<string>();
    for (const r of raports) {
      for (const e of [...asArray(r.entries), ...asArray(r.corridor_watchlist)]) {
        if (typeof e.ebird_code === "string" && e.ebird_code) {
          codes.add(e.ebird_code);
        }
      }
    }

    const phenology = new Map<string, PhenologyRow>();
    for (const codeChunk of chunk([...codes], IN_CHUNK)) {
      const { data, error } = await sb
        .from("species_phenology")
        .select("ebird_code, spring_window, autumn_window")
        .in("ebird_code", codeChunk);
      calls += 1;
      if (error) throw new Error("species_phenology: " + error.message);
      for (const row of (data ?? []) as unknown as PhenologyRow[]) {
        if (row.ebird_code) phenology.set(row.ebird_code, row);
      }
    }

    state.stage = "phenology_read";
    state.species_codes = codes.size;
    state.phenology_rows = phenology.size;
    await touchRun(sb, rowId, calls, state);

    // --- 3. Derive windows, select what is due ----------------------------
    const candidates: Candidate[] = [];
    let entriesSeen = 0;
    let skippedNoCode = 0;
    let skippedUnknownBand = 0;
    let notDue = 0;

    let watchlistConsidered = 0;

    for (const raport of raports) {
      const generatedDate = dateOnly(raport.generated_at);
      const raportYear = Number(generatedDate.slice(0, 4));

      /**
       * One item from either array. `entries` and `corridor_watchlist` differ
       * only in where the band comes from and whether a probability exists, so
       * everything after that -- season pick, phenology projection, window
       * derivation, due filter -- is shared rather than forked.
       */
      const consider = (
        item: Record<string, unknown>,
        band: string,
        predictedPct: number | null,
        isWatchlist: boolean,
      ): void => {
        const ebirdCode = typeof item.ebird_code === "string"
          ? item.ebird_code
          : "";
        const speciesEt = typeof item.species_et === "string"
          ? item.species_et
          : "";
        // Both columns are NOT NULL; an item missing either cannot be a row.
        if (!ebirdCode || !speciesEt) {
          skippedNoCode += 1;
          return;
        }

        // The phenology end for this item's own season, when we need one. A
        // watch-list item has no probability_factors, so it always falls back
        // to the raport's season.
        const factors = (item.probability_factors ?? {}) as Record<
          string,
          unknown
        >;
        const seasonKind = seasonWindowKind(factors.season, raport.season);
        const phenRow = phenology.get(ebirdCode);
        const rangeText = !phenRow || !seasonKind
          ? null
          : seasonKind === "autumn"
          ? phenRow.autumn_window
          : phenRow.spring_window;
        const phenologyEnd = projectPhenologyEnd(rangeText, raportYear);

        const window = deriveWindow({
          band,
          generatedAt: raport.generated_at,
          phenologyEnd,
          phenologyGate: isWatchlist ? num(item.phenology_gate) : null,
        });
        if (!window) {
          skippedUnknownBand += 1;
          return;
        }

        // Never-scoreable items are written as soon as the raport lands;
        // scoreable ones wait until their window has closed inside the due
        // range. Both filters are on the due window, so a re-run is a no-op
        // rather than a re-scan of the whole period.
        const due = window.notScoredReason !== null
          ? generatedDate >= dueFrom && generatedDate <= dueTo
          : !!window.windowEnd && window.windowEnd >= dueFrom &&
            window.windowEnd <= dueTo;
        if (!due) {
          notDue += 1;
          return;
        }

        candidates.push({
          raportId: raport.id,
          ebirdCode,
          speciesEt,
          band,
          predictedPct,
          sites: readSites(item),
          window,
          isWatchlist,
        });
      };

      for (const entry of asArray(raport.entries)) {
        entriesSeen += 1;
        const band = typeof entry.timing_band === "string"
          ? entry.timing_band
          : "";
        consider(entry, band, num(entry.ee_probability_pct), false);
      }

      // Watch-list items are pushed AFTER this raport's entries, which is what
      // lets the collapse below resolve a key collision in the entries' favour.
      for (const item of asArray(raport.corridor_watchlist)) {
        watchlistConsidered += 1;
        // predicted_pct is null on purpose: a watch-list item carries no
        // ee_probability_pct key at all, and a substituted 0 would read as a
        // real prediction of zero.
        consider(item, WATCHLIST_BAND, null, true);
      }
    }

    state.stage = "windows_derived";
    state.entries_seen = entriesSeen;
    state.skipped_no_code = skippedNoCode;
    state.skipped_unknown_band = skippedUnknownBand;
    state.not_due = notDue;
    state.candidates = candidates.length;
    await touchRun(sb, rowId, calls, state);

    // --- 4. Arrivals, batched over the union of every open window ---------
    const scored = candidates.filter((c) => c.window.notScoredReason === null);
    let arrivals = new Map<string, ArrivalRecord[]>();

    if (scored.length > 0) {
      let from = "";
      let to = "";
      for (const c of scored) {
        const s = c.window.windowStart ?? "";
        const e = c.window.windowEnd ?? "";
        if (s && (!from || s < from)) from = s;
        if (e && (!to || e > to)) to = e;
      }
      const names = [...new Set(scored.map((c) => c.speciesEt))];
      const loaded = await loadArrivals(sb, names, from, to);
      arrivals = loaded.index;
      calls += loaded.calls;

      state.arrivals_from = from;
      state.arrivals_to = to;
      state.arrival_species = names.length;
      state.arrival_records = [...arrivals.values()]
        .reduce((n, list) => n + list.length, 0);
    }

    state.stage = "arrivals_read";
    await touchRun(sb, rowId, calls, state);

    if (Date.now() - started > BUDGET_MS) {
      throw new Error("budget_exceeded before write");
    }

    // --- 5. Build and upsert ---------------------------------------------
    // Keyed by the unique constraint. Nothing constrains `entries` jsonb to one
    // element per ebird_code, and a repeated key inside a single upsert makes
    // Postgres abort the whole statement ("ON CONFLICT DO UPDATE command cannot
    // affect row a second time"), so collapse duplicates here, last one wins.
    const checkedAt = new Date().toISOString();
    const byKey = new Map<string, OutcomeRow & { checked_at: string }>();
    let duplicateKeys = 0;
    let watchlistShadowed = 0;
    let watchlistRows = 0;
    for (const c of candidates) {
      // Collision guard: a watch-list ebird_code that also appears in the same
      // raport's entries would collide on (raport_id, ebird_code, site_index)
      // and abort the whole upsert. Entries win -- they carry a real
      // timing_band and a probability. Zero collisions measured across all 45
      // live watch-list rows, but nothing prevents one. Entries were pushed
      // first, so their species-level key is already present here.
      if (c.isWatchlist) {
        const speciesKey = c.raportId + "|" + c.ebirdCode + "|" +
          SITE_INDEX_SPECIES_LEVEL;
        if (byKey.has(speciesKey)) {
          watchlistShadowed += 1;
          continue;
        }
      }

      for (
        const row of buildRowsForEntry({
          raportId: c.raportId,
          ebirdCode: c.ebirdCode,
          speciesEt: c.speciesEt,
          band: c.band,
          predictedPct: c.predictedPct,
          sites: c.sites,
          window: c.window,
          arrivals: arrivals.get(c.speciesEt) ?? [],
        })
      ) {
        const key = row.raport_id + "|" + row.ebird_code + "|" + row.site_index;
        if (byKey.has(key)) duplicateKeys += 1;
        if (c.isWatchlist) watchlistRows += 1;
        // checked_at is stamped explicitly so a re-run records that it
        // re-checked; an upsert omitting the column would leave the first
        // run's timestamp in place.
        byKey.set(key, { ...row, checked_at: checkedAt });
      }
    }
    const rows = [...byKey.values()];

    const byOutcome: Record<string, number> = {};
    for (const r of rows) {
      const key = r.not_scored_reason
        ? r.outcome + ":" + r.not_scored_reason
        : r.outcome;
      byOutcome[key] = (byOutcome[key] ?? 0) + 1;
    }

    let upserted = 0;
    for (const part of chunk(rows, UPSERT_CHUNK)) {
      const { error } = await sb
        .from("prediction_outcomes")
        .upsert(part, { onConflict: "raport_id,ebird_code,site_index" });
      calls += 1;
      if (error) throw new Error("prediction_outcomes: " + error.message);
      upserted += part.length;
    }

    state.stage = "done";
    state.rows_built = rows.length;
    state.duplicate_keys = duplicateKeys;
    state.watchlist_considered = watchlistConsidered;
    state.watchlist_rows = watchlistRows;
    state.watchlist_shadowed = watchlistShadowed;
    state.rows_upserted = upserted;
    state.by_outcome = byOutcome;
    state.elapsed_ms = Date.now() - started;

    await closeRun(sb, rowId, { calls, ok: true, state, error: null });

    return json(200, {
      ok: true,
      run_id: runId,
      cron_run_id: rowId,
      due_from: dueFrom,
      due_to: dueTo,
      raports_scanned: raports.length,
      entries_seen: entriesSeen,
      watchlist_considered: watchlistConsidered,
      watchlist_rows: watchlistRows,
      watchlist_shadowed: watchlistShadowed,
      candidates: candidates.length,
      rows_upserted: upserted,
      by_outcome: byOutcome,
      elapsed_ms: state.elapsed_ms,
    });
  } catch (e) {
    const errorMsg = errMsg(e);
    state.stage = "error";
    state.elapsed_ms = Date.now() - started;
    console.error("[prediction-outcomes]", errorMsg);
    await closeRun(sb, rowId, {
      calls,
      ok: false,
      state,
      error: errorMsg,
    });
    return json(500, { ok: false, run_id: runId, error: errorMsg });
  }
});
