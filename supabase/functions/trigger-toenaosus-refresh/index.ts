// trigger-toenaosus-refresh
// ─────────────────────────
// Accepts POST from the EstBirding app (Ülevaade → Tõenäosus subtab
// "Värskenda nüüd" button), rate-limits to 5-minute minimum interval,
// then calls the toenaosus-orchestrator Edge Function with the shared
// secret.
//
// M7.5b: this leg used to POST the n8n webhook toenaosus-koordinaator. n8n
// dies 2026-09-19, and since M7.5 the raport comes from
// toenaosus-orchestrator, which answers 202 immediately -- the same
// "started, poll for the row" semantics the button already expects.
//
// Returns 202 immediately on success — the orchestrator runs its work in a
// background task and inserts a new row into toenaosus_raport. Frontend polls
// for the new row.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Authenticates the internal orchestrator call (toenaosus-orchestrator reads
// this same var).
const VAATLUSTE_WEBHOOK_SECRET = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") ?? "";

const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// The orchestrator answers 202 after one DB insert, so 10 s is generous; it
// exists so a hung EF cannot hold the button's request open.
const ORCHESTRATOR_TIMEOUT_MS = 10_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env vars");
    return json({ error: "server_misconfigured" }, 500);
  }
  if (!VAATLUSTE_WEBHOOK_SECRET) {
    console.error("Missing VAATLUSTE_WEBHOOK_SECRET");
    return json({ error: "server_misconfigured" }, 500);
  }

  // Rate-limit check: reject if last report is < 5 minutes old
  try {
    const lastResp = await fetch(
      `${SUPABASE_URL}/rest/v1/toenaosus_raport?select=generated_at&order=generated_at.desc&limit=1`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (lastResp.ok) {
      const rows = await lastResp.json() as Array<{ generated_at: string }>;
      const latest = rows[0];
      if (latest?.generated_at) {
        const ageMs = Date.now() - new Date(latest.generated_at).getTime();
        if (ageMs < MIN_REFRESH_INTERVAL_MS) {
          const retryAfterSec = Math.ceil(
            (MIN_REFRESH_INTERVAL_MS - ageMs) / 1000,
          );
          return json(
            {
              error: "rate_limited",
              message:
                `Eelmine värskendus toimus ${
                  Math.ceil(ageMs / 1000)
                } sekundit tagasi. Palun oota ${retryAfterSec} sekundit.`,
              retry_after_seconds: retryAfterSec,
              last_generated_at: latest.generated_at,
            },
            429,
            { "Retry-After": String(retryAfterSec) },
          );
        }
      }
    } else {
      console.warn(
        `Rate-limit check failed (${lastResp.status}); proceeding anyway`,
      );
    }
  } catch (err) {
    console.warn("Rate-limit check threw; proceeding anyway:", err);
  }

  let clientPayload: Record<string, unknown> = {};
  try {
    const body = await req.text();
    if (body) clientPayload = JSON.parse(body);
  } catch {
    // ignore — body is optional
  }

  const startedAt = new Date().toISOString();

  const callBody = JSON.stringify({
    source: "app-manual",
    triggered_at: startedAt,
    ...clientPayload,
  });

  let triggered = false;
  let status: number | null = null;
  let errorMsg: string | null = null;
  let runId: string | null = null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ORCHESTRATOR_TIMEOUT_MS);
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/toenaosus-orchestrator`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": VAATLUSTE_WEBHOOK_SECRET,
        },
        body: callBody,
        signal: ctrl.signal,
      },
    );
    status = resp.status;
    triggered = resp.ok;
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      errorMsg = `HTTP ${resp.status}`;
      console.error(`toenaosus orchestrator ${resp.status}: ${txt}`);
    } else {
      // The orchestrator answers 202 {ok, run_id, ...}. run_id is surfaced
      // additively; failing to read it must not fail an accepted trigger.
      try {
        const body = await resp.json() as { run_id?: unknown };
        if (typeof body?.run_id === "string") runId = body.run_id;
      } catch {
        // body is informational only
      }
    }
  } catch (err) {
    errorMsg = String((err as { message?: string })?.message ?? err);
    console.error("toenaosus orchestrator fetch threw:", errorMsg);
  } finally {
    clearTimeout(timer);
  }

  if (!triggered) {
    return json(
      {
        triggered: false,
        error: "orchestrator_trigger_failed",
        message: "Värskenduse käivitamine ebaõnnestus. Proovi uuesti.",
        results: {
          toenaosus: { triggered: false, status, error: errorMsg, run_id: null },
        },
      },
      502,
    );
  }

  return json(
    {
      triggered: true,
      ok: true,
      started_at: startedAt,
      orchestrator_status: status,
      results: {
        toenaosus: { triggered: true, status, error: null, run_id: runId },
      },
      message: "Värskendus käivitatud. Uus aruanne ilmub umbes 1-2 minuti pärast.",
    },
    202,
  );
});
