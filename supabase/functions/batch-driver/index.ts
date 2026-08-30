// batch-driver
// M7.2: drives the three paged batch Edge Functions that used to be n8n
// schedulers. pg_cron -> pg_net -> public.m7_call_ef -> here -> target EF.
//
//   job 'ennustus'  -> compute-ennustus       (x-webhook-secret)
//   job 'elurikkus' -> elurikkus-bulk-refresh (x-refresh-secret)
//   job 'gbif'      -> gbif-bulk-refresh      (x-webhook-secret)
//
// Auth on this function: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET.
//
// Wall clock: the edge gateway 504s at 150 s, so after BUDGET_MS the
// driver self-chains -- it POSTs public.m7_call_ef over PostgREST with the
// service-role key, which enqueues a fresh invocation carrying (run_id, hop+1,
// state). The chain POST is awaited: an un-awaited fetch dies with the isolate.
//
// Call caps live in state.calls_total and therefore span hops; cron_runs.calls
// counts only the calls made by THIS hop.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// Supabase edge gateway 504s at 150 s and the isolate dies soon after --
// 90 + 55 < 150; hops chain via pg_net well before that.
const BUDGET_MS = 90_000;
const CALL_TIMEOUT_MS = 55_000;
const RETRY_DELAY_MS = 3_000; // n8n used waitBetweenTries 3000-5000

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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A 4xx from a target, or a non-JSON body, is not worth retrying.
class FatalCallError extends Error {}

// ---------------------------------------------------------------------------
// Job table
// ---------------------------------------------------------------------------

type JobName = "ennustus" | "elurikkus" | "gbif";

interface JobState {
  offset: number;
  calls_total: number;
  total_species: number | null;
  last?: Record<string, unknown>;
}

interface StepResult {
  state: JobState;
  stop: boolean;
  reason: string | null;
}

interface JobConfig {
  target: string;
  secretHeader: string;
  secretEnv: string;
  maxCalls: number;
  body: (s: JobState) => Record<string, unknown>;
  step: (s: JobState, resp: Record<string, unknown>) => StepResult;
}

const JOBS: Record<JobName, JobConfig> = {
  // compute-ennustus returns a real boolean `done` (slice.length < limit) plus
  // `next_offset`. n8n fired 120 fixed offsets x limit 5; we walk next_offset
  // until done, capped at 130 calls.
  ennustus: {
    target: "compute-ennustus",
    secretHeader: "x-webhook-secret",
    secretEnv: "VAATLUSTE_WEBHOOK_SECRET",
    maxCalls: 130,
    body: (s) => ({ offset: s.offset, limit: 5 }),
    step: (s, resp) => {
      const nextOffset = Number(resp.next_offset);
      const state: JobState = {
        ...s,
        offset: Number.isFinite(nextOffset) ? nextOffset : s.offset,
        last: {
          processed: Number(resp.processed ?? 0),
          exits: resp.exits ?? null,
        },
      };
      return resp.done === true
        ? { state, stop: true, reason: "done" }
        : { state, stop: false, reason: null };
    },
  },

  // elurikkus-bulk-refresh's FORWARD path (no `mode` in the body) returns
  // `done` as an INTEGER -- the number of species attempted -- not a boolean.
  // Port of the n8n `Next cursor` node, guard included.
  elurikkus: {
    target: "elurikkus-bulk-refresh",
    secretHeader: "x-refresh-secret",
    secretEnv: "ELURIKKUS_REFRESH_SECRET",
    // limit 25 (was 50) so one chunk lands around 30 s, well inside
    // CALL_TIMEOUT_MS; maxCalls 30 (was 15) because 445 species / 25 = 18
    // chunks, leaving headroom for a growing species list.
    maxCalls: 30,
    body: (s) => ({ offset: s.offset, limit: 25 }),
    step: (s, resp) => {
      const attempted = Number(resp.done ?? 0);
      const updated = Number(resp.updated ?? 0);
      const total = Number(resp.total_species ?? 0);

      // Fail loud: a chunk that attempted species but upserted nothing is a
      // broken chunk, not an empty one. Silently walking past it is how the
      // backfill footgun works.
      if (attempted > 0 && updated === 0) {
        throw new Error(
          "elurikkus_no_progress: chunk at offset " + s.offset +
            " attempted " + attempted +
            " species and upserted 0 cache rows. errors=" +
            JSON.stringify(resp.error_details ?? resp.errors ?? null),
        );
      }

      const offset = s.offset + attempted;
      const state: JobState = {
        ...s,
        offset,
        total_species: Number.isFinite(total) && total > 0
          ? total
          : s.total_species,
        last: {
          attempted,
          updated,
          errors: Number(resp.errors ?? 0),
          observations_inserted: Number(resp.observations_inserted ?? 0),
          observations_updated: Number(resp.observations_updated ?? 0),
        },
      };

      if (attempted === 0) return { state, stop: true, reason: "empty_chunk" };
      if (!(total > 0)) return { state, stop: true, reason: "no_total_species" };
      return offset < total
        ? { state, stop: false, reason: null }
        : { state, stop: true, reason: "complete" };
    },
  },

  // gbif-bulk-refresh returns boolean `done` (next_offset >= species.length)
  // and `total_species`, so the species count never needs hardcoding -- the
  // list comes from a remote species_meta_v1.json and changes over time.
  gbif: {
    target: "gbif-bulk-refresh",
    secretHeader: "x-webhook-secret",
    secretEnv: "VAATLUSTE_WEBHOOK_SECRET",
    maxCalls: 120,
    body: (s) => ({
      mode: "refresh",
      offset: s.offset,
      batch_size: 5,
      page_cap: 10,
    }),
    step: (s, resp) => {
      const nextOffset = Number(resp.next_offset);
      const total = Number(resp.total_species ?? 0);
      const state: JobState = {
        ...s,
        offset: Number.isFinite(nextOffset) ? nextOffset : s.offset,
        total_species: Number.isFinite(total) && total > 0
          ? total
          : s.total_species,
        last: {
          processed_species: Number(resp.processed_species ?? 0),
          rows_upserted: Number(resp.rows_upserted ?? 0),
          error_count: Number(resp.error_count ?? 0),
        },
      };
      return resp.done === true
        ? { state, stop: true, reason: "done" }
        : { state, stop: false, reason: null };
    },
  },
};

function isJobName(v: unknown): v is JobName {
  return typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(JOBS, v);
}

function emptyState(): JobState {
  return { offset: 0, calls_total: 0, total_species: null };
}

function normalizeState(v: unknown): JobState {
  const s = v && typeof v === "object" ? v as Record<string, unknown> : {};
  const offset = Number(s.offset);
  const callsTotal = Number(s.calls_total);
  const total = Number(s.total_species);
  return {
    offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
    calls_total: Number.isFinite(callsTotal)
      ? Math.max(0, Math.floor(callsTotal))
      : 0,
    total_species: Number.isFinite(total) && total > 0 ? total : null,
  };
}

// ---------------------------------------------------------------------------
// Target call: CALL_TIMEOUT_MS, one retry on network error / 5xx
// ---------------------------------------------------------------------------

async function callTarget(
  cfg: JobConfig,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const secret = Deno.env.get(cfg.secretEnv);
  if (!secret) throw new FatalCallError("missing_env:" + cfg.secretEnv);
  const url = SUPABASE_URL + "/functions/v1/" + cfg.target;

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [cfg.secretHeader]: secret,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.ok) {
        try {
          return JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new FatalCallError(
            cfg.target + " non_json_response: " + text.slice(0, 300),
          );
        }
      }
      const detail = cfg.target + " HTTP " + res.status + ": " +
        text.slice(0, 300);
      if (res.status < 500) throw new FatalCallError(detail);
      lastErr = detail; // 5xx -> retryable
    } catch (e) {
      if (e instanceof FatalCallError) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 0) await delay(RETRY_DELAY_MS);
  }
  throw new Error(lastErr || cfg.target + " call_failed");
}

// ---------------------------------------------------------------------------
// Self-chain via PostgREST -> public.m7_call_ef (awaited)
// ---------------------------------------------------------------------------

async function chain(
  job: JobName,
  runId: string,
  hop: number,
  state: JobState,
): Promise<void> {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRole) throw new Error("missing_env:SUPABASE_SERVICE_ROLE_KEY");

  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/m7_call_ef", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceRole,
      authorization: "Bearer " + serviceRole,
    },
    body: JSON.stringify({
      fn: "batch-driver",
      body: { job, run_id: runId, hop: hop + 1, state },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      "chain_failed HTTP " + res.status + ": " + text.slice(0, 300),
    );
  }
}

// ---------------------------------------------------------------------------
// cron_runs logging (best effort -- a logging failure must not fail the job)
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
  job: JobName,
  runId: string,
  hop: number,
  state: JobState,
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

// Heartbeat after every target call, so a hop that is later killed by the
// gateway still leaves behind how far it actually got. Never throws: a
// logging failure must not abort a batch that is otherwise making progress.
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
    console.error(
      "[cron_runs touch]",
      e instanceof Error ? e.message : String(e),
    );
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

  // GET ?job=x&dry=1 -> report the job's config, call nothing.
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("dry") !== "1") {
      return json(400, { error: "dry_run_only", detail: "GET requires dry=1" });
    }
    const job = url.searchParams.get("job");
    if (!isJobName(job)) {
      return json(400, { error: "unknown_job", jobs: Object.keys(JOBS) });
    }
    const cfg = JOBS[job];
    return json(200, {
      ok: true,
      dry: true,
      job,
      target: cfg.target,
      secret_header: cfg.secretHeader,
      secret_env: cfg.secretEnv,
      max_calls: cfg.maxCalls,
      budget_ms: BUDGET_MS,
      call_timeout_ms: CALL_TIMEOUT_MS,
      initial_state: emptyState(),
      sample_body: cfg.body(emptyState()),
    });
  }

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const job = body.job;
  if (!isJobName(job)) {
    return json(400, { error: "unknown_job", jobs: Object.keys(JOBS) });
  }
  const cfg = JOBS[job];
  const runId = typeof body.run_id === "string" && body.run_id
    ? body.run_id
    : crypto.randomUUID();
  const hopRaw = Number(body.hop);
  const hop = Number.isFinite(hopRaw) ? Math.max(0, Math.floor(hopRaw)) : 0;

  const started = Date.now();
  const sb = adminClient();
  let state = normalizeState(body.state);
  const rowId = await openRun(sb, job, runId, hop, state);

  let calls = 0; // this hop only; the cap lives in state.calls_total
  let chained = false;
  let stopped: string | null = null;
  let errorMsg: string | null = null;
  let rowClosed = false; // the chained path closes the row inside the loop

  try {
    while (true) {
      if (state.calls_total >= cfg.maxCalls) {
        stopped = "cap_reached";
        break;
      }

      const resp = await callTarget(cfg, cfg.body(state));
      calls++;

      const stepped = cfg.step(
        { ...state, calls_total: state.calls_total + 1 },
        resp,
      );
      state = stepped.state;
      await touchRun(sb, rowId, calls, { ...state });

      if (stepped.stop) {
        stopped = stepped.reason ?? "done";
        break;
      }
      if (state.calls_total >= cfg.maxCalls) {
        stopped = "cap_reached";
        break;
      }
      if (Date.now() - started > BUDGET_MS) {
        // Close the row BEFORE chaining. The chain POST is the most likely
        // thing to be cut short by the gateway, and a hop that dies mid-POST
        // must not leave an open row that reads as a crash.
        stopped = "chained";
        chained = true;
        await closeRun(sb, rowId, {
          calls,
          ok: true,
          state: { ...state, stopped, chained },
          error: null,
        });
        rowClosed = true;
        try {
          await chain(job, runId, hop, state);
        } catch (e) {
          // The successor was never enqueued; correct the row we just closed.
          errorMsg = e instanceof Error ? e.message : String(e);
          chained = false;
          await closeRun(sb, rowId, {
            calls,
            ok: false,
            state: { ...state, stopped, chained },
            error: errorMsg,
          });
        }
        break;
      }
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const ok = errorMsg === null;
  const tookMs = Date.now() - started;
  if (!rowClosed) {
    await closeRun(sb, rowId, {
      calls,
      ok,
      state: { ...state, stopped, chained },
      error: errorMsg,
    });
  }

  return json(ok ? 200 : 500, {
    ok,
    job,
    run_id: runId,
    hop,
    calls,
    state,
    stopped,
    chained,
    took_ms: tookMs,
    error: errorMsg,
  });
});
