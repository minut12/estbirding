// m7-probe
// M7.4a: proves the background-task lifetime before the Sonnet orchestrators
// (M7.4-M7.6) are built on it. Their Sonnet call alone runs 100-160 s, which
// cannot be awaited inside a request: the edge gateway 504s at the 150 s
// request-idle timeout and the isolate dies (M7.2 EarlyDrop). The orchestrator
// shape is therefore: auth -> open cron_runs row -> return 202 -> do the work
// inside EdgeRuntime.waitUntil(), heartbeating cron_runs.state per stage.
//
// This function is that shape with the work replaced by a clock. It ticks every
// `step` seconds for `seconds` seconds, writing ticks/elapsed_ms into
// cron_runs.state, and a beforeunload listener stamps the shutdown reason into
// any row still open when the isolate is torn down. Run 1 (330 s) shows the
// isolate outliving the 150 s gateway cutoff; run 2 (600 s) walks into the
// documented 400 s wall clock and records where it lands. That number, minus a
// safety margin, is the budget every orchestrator gets.
//
// Auth: X-Webhook-Secret must equal VAATLUSTE_WEBHOOK_SECRET.
// Reads and writes nothing but cron_runs (job = 'probe').

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const DEFAULT_SECONDS = 330;
const MAX_SECONDS = 600;
const DEFAULT_STEP = 10;
const MIN_STEP = 1;
const MAX_STEP = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e);

// ---------------------------------------------------------------------------
// EdgeRuntime, feature-detected exactly as species-prediction does it: a bare
// `EdgeRuntime.waitUntil` is an unbound global that fails `deno check` locally
// and throws where the API is absent. Whether it was actually there is the
// first thing this probe is measuring, so it goes into cron_runs.state.
// ---------------------------------------------------------------------------

type EdgeRuntimeLike = { waitUntil?: (p: Promise<unknown>) => void };

function edgeRuntime(): EdgeRuntimeLike | undefined {
  try {
    return (globalThis as Record<string, unknown>).EdgeRuntime as
      | EdgeRuntimeLike
      | undefined;
  } catch {
    return undefined;
  }
}

// true -> the promise is registered and the worker stays alive for it.
// false -> nothing keeps it alive; the caller starts it un-awaited anyway and
// says so in the 202 body, because "it died immediately" is itself a result.
function keepAlive(p: Promise<unknown>): boolean {
  try {
    const rt = edgeRuntime();
    if (rt?.waitUntil) {
      rt.waitUntil(p);
      return true;
    }
  } catch (e) {
    console.error("[m7-probe] waitUntil threw", errMsg(e));
  }
  return false;
}

const WAIT_UNTIL_AVAILABLE = typeof edgeRuntime()?.waitUntil === "function";

// ---------------------------------------------------------------------------
// cron_runs logging -- openRun / touchRun / closeRun copied from batch-driver
// rather than shared. M7.4a must not touch code the live schedulers run, and a
// probe that imports the thing it is validating proves less. The only edits are
// the parameter types (batch-driver's JobName / JobState do not exist here).
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
// Open rows for this isolate, so the beforeunload listener can find them.
// ---------------------------------------------------------------------------

interface ProbeRun {
  rowId: number;
  runId: string;
  startedAt: number;
  base: Record<string, unknown>;
  ticks: number;
}

const OPEN_RUNS = new Map<number, ProbeRun>();

function stateOf(run: ProbeRun, extra: Record<string, unknown> = {}) {
  return {
    ...run.base,
    ticks: run.ticks,
    elapsed_ms: Date.now() - run.startedAt,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Shutdown listeners. Registered via addEventListener inside try/catch: a
// runtime that does not deliver these events must not take the whole function
// down at module load, and whether registration succeeded is recorded in
// cron_runs.state alongside the wait_until result.
// ---------------------------------------------------------------------------

function registerBeforeUnload(): boolean {
  try {
    addEventListener("beforeunload", (ev: Event) => {
      const reason =
        (ev as Event & { detail?: { reason?: string } }).detail?.reason ??
          "unknown";
      // Logged first: the console line is the one thing that cannot be lost to
      // a DB round-trip the isolate no longer has time to finish.
      console.error(
        `[m7-probe] beforeunload reason=${reason} open_runs=${OPEN_RUNS.size}`,
      );
      const sb = adminClient();
      for (const run of OPEN_RUNS.values()) {
        const state = stateOf(run, { shutdown_reason: reason });
        console.error(
          `[m7-probe] beforeunload row=${run.rowId} ticks=${run.ticks} elapsed=${state.elapsed_ms}`,
        );
        const p = closeRun(sb, run.rowId, {
          calls: run.ticks,
          ok: false,
          state,
          error: "shutdown:" + reason,
        }).catch((e) =>
          console.error("[m7-probe] beforeunload close", errMsg(e))
        );
        // Best effort: asks the runtime for a moment to land the UPDATE. If the
        // row stays open, that absence is the finding.
        keepAlive(p);
      }
      OPEN_RUNS.clear();
    });
    return true;
  } catch (e) {
    console.error("[m7-probe] beforeunload register failed", errMsg(e));
    return false;
  }
}

function registerUnhandledRejection(): boolean {
  try {
    addEventListener("unhandledrejection", (ev: Event) => {
      const reason = (ev as Event & { reason?: unknown }).reason;
      console.error("[m7-probe] unhandledrejection", errMsg(reason));
      ev.preventDefault();
    });
    return true;
  } catch (e) {
    console.error("[m7-probe] unhandledrejection register failed", errMsg(e));
    return false;
  }
}

const LISTENERS = {
  beforeunload: registerBeforeUnload(),
  unhandledrejection: registerUnhandledRejection(),
};

// ---------------------------------------------------------------------------
// The background work: a clock.
// ---------------------------------------------------------------------------

async function loop(run: ProbeRun, seconds: number, step: number) {
  const sb = adminClient();
  const totalMs = seconds * 1_000;
  const stepMs = step * 1_000;

  try {
    while (true) {
      const remaining = totalMs - (Date.now() - run.startedAt);
      if (remaining <= 0) break;
      await delay(Math.min(stepMs, remaining));

      run.ticks++;
      const state = stateOf(run, { last_tick_at: new Date().toISOString() });
      // Same timeline in the function logs and in cron_runs, so a run that dies
      // before its heartbeat lands can still be placed on the clock.
      console.log(
        `[m7-probe] tick ${run.ticks} elapsed ${state.elapsed_ms} run_id=${run.runId}`,
      );
      // touchRun swallows its own failures: a dropped heartbeat is a data point,
      // not a reason to stop measuring.
      await touchRun(sb, run.rowId, run.ticks, state);
    }

    const state = stateOf(run, { finished: true });
    console.log(
      `[m7-probe] done ticks=${run.ticks} elapsed=${state.elapsed_ms} run_id=${run.runId}`,
    );
    OPEN_RUNS.delete(run.rowId);
    await closeRun(sb, run.rowId, {
      calls: run.ticks,
      ok: true,
      state,
      error: null,
    });
  } catch (e) {
    // Reached only if something outside the per-call try/catch throws; the row
    // must still close, or it is indistinguishable from a kill.
    const message = errMsg(e);
    console.error("[m7-probe] loop failed", message);
    OPEN_RUNS.delete(run.rowId);
    try {
      await closeRun(sb, run.rowId, {
        calls: run.ticks,
        ok: false,
        state: stateOf(run, { failed: true }),
        error: "loop_failed: " + message,
      });
    } catch (closeErr) {
      console.error("[m7-probe] loop close failed", errMsg(closeErr));
    }
  }
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

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  const secondsRaw = Number(body.seconds);
  const seconds = Number.isFinite(secondsRaw) && secondsRaw > 0
    ? Math.min(MAX_SECONDS, Math.floor(secondsRaw))
    : DEFAULT_SECONDS;

  const stepRaw = Number(body.step);
  const step = Number.isFinite(stepRaw) && stepRaw > 0
    ? Math.min(MAX_STEP, Math.max(MIN_STEP, Math.floor(stepRaw)))
    : DEFAULT_STEP;

  const runId = crypto.randomUUID();
  const sb = adminClient();

  const base: Record<string, unknown> = {
    seconds,
    step,
    wait_until: WAIT_UNTIL_AVAILABLE ? "used" : "absent",
    listeners: { ...LISTENERS },
  };

  const rowId = await openRun(sb, "probe", runId, 0, {
    ...base,
    ticks: 0,
    elapsed_ms: 0,
  });
  if (rowId === null) {
    // No row means no evidence, and an unobservable probe is worse than none.
    return json(500, { error: "cron_runs_open_failed", run_id: runId });
  }

  const run: ProbeRun = {
    rowId,
    runId,
    startedAt: Date.now(),
    base,
    ticks: 0,
  };
  OPEN_RUNS.set(rowId, run);

  const work = loop(run, seconds, step);
  const registered = keepAlive(work);
  if (!registered) {
    // Started un-awaited on purpose: how far it gets without waitUntil is the
    // measurement. Swallow the rejection so it cannot surface as unhandled.
    work.catch((e) => console.error("[m7-probe] unawaited loop", errMsg(e)));
  }

  console.log(
    `[m7-probe] start run_id=${runId} row=${rowId} seconds=${seconds} step=${step} wait_until=${base.wait_until}`,
  );

  return json(202, {
    ok: true,
    run_id: runId,
    row_id: rowId,
    seconds,
    step,
    wait_until: base.wait_until,
    listeners: LISTENERS,
    background: registered ? "waitUntil" : "unawaited",
    note: registered
      ? undefined
      : "EdgeRuntime.waitUntil unavailable; loop started un-awaited and will " +
        "likely be killed when the response is delivered",
  });
});
