// trigger-toenaosus-refresh
// ─────────────────────────
// Accepts POST from the EstBirding app (Ülevaade → Tõenäosus subtab
// "Värskenda nüüd" button), rate-limits to 5-minute minimum interval,
// then forwards to the n8n toenaosus-koordinaator webhook with the
// shared secret.
//
// Returns 202 immediately on success — the n8n workflow runs async and
// inserts a new row into toenaosus_raport. Frontend polls for the new row.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const N8N_WEBHOOK_URL = Deno.env.get("N8N_TOENAOSUS_WEBHOOK_URL") ?? "";
const N8N_WEBHOOK_SECRET = Deno.env.get("N8N_TOENAOSUS_WEBHOOK_SECRET") ?? "";

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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env vars");
    return json({ error: "server_misconfigured" }, 500);
  }
  if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_URL.startsWith("https://")) {
    console.error("Invalid or missing N8N_TOENAOSUS_WEBHOOK_URL:", JSON.stringify(N8N_WEBHOOK_URL));
    return json({ error: "invalid_or_missing_webhook_url" }, 500);
  }
  if (!N8N_WEBHOOK_SECRET) {
    console.error("Missing N8N_TOENAOSUS_WEBHOOK_SECRET");
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

  try {
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": N8N_WEBHOOK_SECRET,
      },
      body: callBody,
    });
    status = resp.status;
    triggered = resp.ok;
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      errorMsg = `HTTP ${resp.status}`;
      console.error(`toenaosus webhook ${resp.status}: ${txt}`);
    }
  } catch (err) {
    errorMsg = String((err as { message?: string })?.message ?? err);
    console.error("toenaosus webhook fetch threw:", errorMsg);
  }

  if (!triggered) {
    return json(
      {
        triggered: false,
        error: "n8n_trigger_failed",
        message: "Värskenduse käivitamine ebaõnnestus. Proovi uuesti.",
        results: { toenaosus: { triggered: false, status, error: errorMsg } },
      },
      502,
    );
  }

  return json(
    {
      triggered: true,
      ok: true,
      started_at: startedAt,
      n8n_status: status,
      results: { toenaosus: { triggered: true, status, error: null } },
      message: "Värskendus käivitatud. Uus aruanne ilmub umbes 1-2 minuti pärast.",
    },
    202,
  );
});
