// trigger-vaatluste-refresh
// ─────────────────────────
// Accepts POST from the EstBirding app (Ülevaade page "Värskenda" button),
// rate-limits to 5-minute minimum interval, then fans out to the two
// orchestrator Edge Functions that produce the raports.
//
// M7.4d: the eBird and elurikkus legs used to POST to n8n webhooks
// (vaatluste-refresh / vaatluste-elurikkus-trigger). n8n dies 2026-09-19, and
// since M7.4b/M7.4c both raports come from vaatluste-orchestrator and
// elurikkus-orchestrator, which answer 202 immediately -- the same
// "started, poll for the row" semantics the button already expects.
// The toenaosus leg still goes to n8n; that port is M7.5.
//
// Returns 202 immediately on success — the orchestrators run their work in a
// background task and insert a new row into vaatluste_raport /
// elurikkus_raport. Frontend polls for the new row.
//
// Spec: docs/vaatluste-koordinaator.md

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Authenticates the two internal orchestrator calls (both read this same var).
const VAATLUSTE_WEBHOOK_SECRET = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") ?? "";
// M7.7: remove — dead since M7.4d repointed both legs at the orchestrator EFs.
const N8N_WEBHOOK_URL = Deno.env.get("N8N_VAATLUSTE_WEBHOOK_URL") ?? "";
// M7.7: remove
const N8N_WEBHOOK_SECRET = Deno.env.get("N8N_VAATLUSTE_WEBHOOK_SECRET") ?? "";

const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// The orchestrators answer 202 after one DB insert, so 10 s is generous; it
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

  // Sanity-check env
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
      `${SUPABASE_URL}/rest/v1/vaatluste_raport?select=generated_at&order=generated_at.desc&limit=1`,
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

  // Optional payload (we don't require any input from the client right now)
  let clientPayload: Record<string, unknown> = {};
  try {
    const body = await req.text();
    if (body) clientPayload = JSON.parse(body);
  } catch {
    // ignore — body is optional
  }

  const startedAt = new Date().toISOString();

  // M7.7: remove
  const ELURIKKUS_WEBHOOK_URL = Deno.env.get("N8N_VAATLUSTE_ELURIKKUS_WEBHOOK_URL") ?? "";
  const TOENAOSUS_WEBHOOK_URL = Deno.env.get("N8N_TOENAOSUS_WEBHOOK_URL") ?? "";
  const TOENAOSUS_WEBHOOK_SECRET = Deno.env.get("N8N_TOENAOSUS_WEBHOOK_SECRET") ?? "";

  const callBody = JSON.stringify({
    source: "app-manual",
    triggered_at: startedAt,
    ...clientPayload,
  });

  type TargetKey = "ebird" | "elurikkus" | "toenaosus";
  type TargetResult = {
    triggered: boolean;
    status: number | null;
    error: string | null;
    run_id?: string | null;
  };

  // `internal` = one of our own orchestrator EFs: gets the AbortController
  // timeout and has its 202 body read for run_id. The toenaosus leg is still an
  // n8n webhook and keeps the previous no-timeout, no-body-parse behaviour.
  const targets: Array<{
    key: TargetKey;
    url: string;
    secret: string;
    internal: boolean;
  }> = [
    {
      key: "ebird",
      url: `${SUPABASE_URL}/functions/v1/vaatluste-orchestrator`,
      secret: VAATLUSTE_WEBHOOK_SECRET,
      internal: true,
    },
    {
      key: "elurikkus",
      url: `${SUPABASE_URL}/functions/v1/elurikkus-orchestrator`,
      secret: VAATLUSTE_WEBHOOK_SECRET,
      internal: true,
    },
  ];
  if (TOENAOSUS_WEBHOOK_URL && TOENAOSUS_WEBHOOK_SECRET) {
    targets.push({
      key: "toenaosus",
      url: TOENAOSUS_WEBHOOK_URL,
      secret: TOENAOSUS_WEBHOOK_SECRET,
      internal: false,
    });
  } else {
    console.warn("N8N_TOENAOSUS_WEBHOOK_URL or N8N_TOENAOSUS_WEBHOOK_SECRET not set — skipping toenaosus trigger");
  }

  async function callTarget(t: typeof targets[number]): Promise<TargetResult> {
    const ctrl = new AbortController();
    const timer = t.internal
      ? setTimeout(() => ctrl.abort(), ORCHESTRATOR_TIMEOUT_MS)
      : null;
    try {
      const res = await fetch(t.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": t.secret,
        },
        body: callBody,
        signal: t.internal ? ctrl.signal : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`${t.key} webhook ${res.status}: ${text}`);
        return { triggered: false, status: res.status, error: `HTTP ${res.status}` };
      }
      if (!t.internal) {
        return { triggered: true, status: res.status, error: null };
      }
      // The orchestrators answer 202 {ok, run_id, ...}. run_id is surfaced
      // additively; failing to read it must not fail an accepted trigger.
      let runId: string | null = null;
      try {
        const body = await res.json() as { run_id?: unknown };
        if (typeof body?.run_id === "string") runId = body.run_id;
      } catch {
        // body is informational only
      }
      return { triggered: true, status: res.status, error: null, run_id: runId };
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? e);
      console.error(`${t.key} webhook fetch threw:`, msg);
      return { triggered: false, status: null, error: msg };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  const results = await Promise.allSettled(targets.map((t) => callTarget(t)));

  const summary: Record<string, TargetResult> = {};
  results.forEach((r, i) => {
    const key = targets[i].key;
    if (r.status === "fulfilled") {
      summary[key] = r.value;
    } else {
      const msg = String((r.reason as { message?: string })?.message ?? r.reason);
      console.error(`${key} webhook fetch threw:`, msg);
      summary[key] = { triggered: false, status: null, error: msg };
    }
  });

  if (!TOENAOSUS_WEBHOOK_URL || !TOENAOSUS_WEBHOOK_SECRET) {
    summary.toenaosus = { triggered: false, status: null, error: "env_missing" };
  }

  const ebirdOk = summary.ebird?.triggered === true;
  const elurikkusOk = summary.elurikkus?.triggered === true;
  const toenaosusOk = summary.toenaosus?.triggered === true;
  const overallOk = ebirdOk && elurikkusOk && toenaosusOk;

  if (!ebirdOk && !elurikkusOk && !toenaosusOk) {
    return json(
      {
        triggered: false,
        error: "n8n_trigger_failed",
        message: "Värskenduse käivitamine ebaõnnestus. Proovi uuesti.",
        results: summary,
      },
      502,
    );
  }

  return json(
    {
      triggered: true,
      ok: overallOk,
      started_at: startedAt,
      n8n_status: summary.ebird?.status ?? null,
      results: summary,
      message: overallOk
        ? "Värskendus käivitatud. Uus aruanne ilmub umbes 2-4 minuti pärast."
        : "Värskendus käivitatud osaliselt. Vaata 'results' välja.",
    },
    overallOk ? 202 : 207,
  );
});
