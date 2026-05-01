// insert-vaatluste-raport
// ────────────────────────
// Accepts POST from n8n with a generated observation report and inserts a row
// into public.vaatluste_raport using the service-role key held server-side.
// n8n authenticates via the shared X-Webhook-Secret header (VAATLUSTE_WEBHOOK_SECRET).
// This avoids ever exposing the service_role key outside Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WEBHOOK_SECRET) {
    console.error("Missing env vars");
    return json({ error: "server_misconfigured" }, 500);
  }

  // Shared-secret auth
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (provided !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Minimal validation — table has its own NOT NULL constraints as backstop
  const report_data = body.report_data;
  if (!report_data || typeof report_data !== "object") {
    return json({ error: "missing_report_data" }, 400);
  }

  const row = {
    generated_at: typeof body.generated_at === "string"
      ? body.generated_at
      : new Date().toISOString(),
    report_data,
    period_start: body.period_start ?? null,
    period_end: body.period_end ?? null,
    source: typeof body.source === "string" ? body.source : "n8n",
    model: typeof body.model === "string" ? body.model : null,
    input_tokens: typeof body.input_tokens === "number" ? body.input_tokens : null,
    output_tokens: typeof body.output_tokens === "number" ? body.output_tokens : null,
  };

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("vaatluste_raport")
      .insert(row)
      .select("id, generated_at")
      .single();

    if (error) {
      console.error("insert failed:", error);
      return json({ error: "insert_failed", details: error.message }, 500);
    }

    return json({ ok: true, id: data.id, generated_at: data.generated_at }, 201);
  } catch (err) {
    console.error("unexpected error:", err);
    return json({ error: "internal_error", details: String(err) }, 500);
  }
});
