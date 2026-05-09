// trigger-vaatluste-refresh
// ─────────────────────────
// Accepts POST from the EstBirding app (Ülevaade page "Värskenda" button),
// rate-limits to 5-minute minimum interval, then forwards to the n8n
// vaatluste-koordinaator webhook with the shared secret.
//
// Returns 202 immediately on success — the n8n workflow runs async and
// inserts a new row into vaatluste_raport. Frontend polls for the new row.
//
// Spec: docs/vaatluste-koordinaator.md

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const N8N_WEBHOOK_URL = Deno.env.get("N8N_VAATLUSTE_WEBHOOK_URL") ?? "";
const N8N_WEBHOOK_SECRET = Deno.env.get("N8N_VAATLUSTE_WEBHOOK_SECRET") ?? "";

const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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
  if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
    console.error("Missing N8N webhook env vars");
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

  const ELURIKKUS_WEBHOOK_URL = Deno.env.get("N8N_VAATLUSTE_ELURIKKUS_WEBHOOK_URL") ?? "";
  const TOENAOSUS_WEBHOOK_URL = Deno.env.get("N8N_TOENAOSUS_WEBHOOK_URL") ?? "";
  const TOENAOSUS_WEBHOOK_SECRET = Deno.env.get("N8N_TOENAOSUS_WEBHOOK_SECRET") ?? "";

  const callBody = JSON.stringify({
    source: "app-manual",
    triggered_at: startedAt,
    ...clientPayload,
  });

  const targets: Array<{
    key: "ebird" | "elurikkus" | "toenaosus";
    url: string;
    secret: string;
  }> = [
    { key: "ebird", url: N8N_WEBHOOK_URL, secret: N8N_WEBHOOK_SECRET },
  ];
  if (ELURIKKUS_WEBHOOK_URL) {
    targets.push({ key: "elurikkus", url: ELURIKKUS_WEBHOOK_URL, secret: N8N_WEBHOOK_SECRET });
  } else {
    console.warn("N8N_VAATLUSTE_ELURIKKUS_WEBHOOK_URL not set — skipping elurikkus trigger");
  }
  if (TOENAOSUS_WEBHOOK_URL && TOENAOSUS_WEBHOOK_SECRET) {
    targets.push({ key: "toenaosus", url: TOENAOSUS_WEBHOOK_URL, secret: TOENAOSUS_WEBHOOK_SECRET });
  } else {
    console.warn("N8N_TOENAOSUS_WEBHOOK_URL or N8N_TOENAOSUS_WEBHOOK_SECRET not set — skipping toenaosus trigger");
  }

  const results = await Promise.allSettled(
    targets.map((t) =>
      fetch(t.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": t.secret,
        },
        body: callBody,
      }),
    ),
  );

  const summary: Record<string, { triggered: boolean; status: number | null; error: string | null }> = {};
  results.forEach((r, i) => {
    const key = targets[i].key;
    if (r.status === "fulfilled") {
      summary[key] = {
        triggered: r.value.ok,
        status: r.value.status,
        error: r.value.ok ? null : `HTTP ${r.value.status}`,
      };
      if (!r.value.ok) {
        r.value.text().then((t) => console.error(`${key} webhook ${r.value.status}: ${t}`)).catch(() => {});
      }
    } else {
      const msg = String((r.reason as { message?: string })?.message ?? r.reason);
      console.error(`${key} webhook fetch threw:`, msg);
      summary[key] = { triggered: false, status: null, error: msg };
    }
  });

  if (!ELURIKKUS_WEBHOOK_URL) {
    summary.elurikkus = { triggered: false, status: null, error: "env_missing" };
  }
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
