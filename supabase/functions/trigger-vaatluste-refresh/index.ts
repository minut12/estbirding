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

  // Trigger n8n webhook
  let n8nStatus: number;
  try {
    const n8nResp = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": N8N_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        source: "app-manual",
        triggered_at: startedAt,
        ...clientPayload,
      }),
    });
    n8nStatus = n8nResp.status;

    if (!n8nResp.ok) {
      const text = await n8nResp.text().catch(() => "");
      console.error(`n8n webhook returned ${n8nResp.status}: ${text}`);
      return json(
        {
          error: "n8n_trigger_failed",
          message: "Värskenduse käivitamine ebaõnnestus. Proovi uuesti.",
          n8n_status: n8nResp.status,
        },
        502,
      );
    }
  } catch (err) {
    console.error("n8n webhook fetch threw:", err);
    return json(
      {
        error: "n8n_unreachable",
        message: "Värskenduse server pole kättesaadav. Proovi hiljem uuesti.",
      },
      502,
    );
  }

  return json(
    {
      triggered: true,
      started_at: startedAt,
      n8n_status: n8nStatus,
      message: "Värskendus käivitatud. Uus aruanne ilmub umbes 30 sekundi pärast.",
    },
    202,
  );
});
