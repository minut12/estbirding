// insert-vaatluste-raport
// ────────────────────────
// Accepts POST from n8n with a generated observation report and inserts a row
// into public.vaatluste_raport using the service-role key held server-side.
// n8n authenticates via the shared X-Webhook-Secret header
// (N8N_VAATLUSTE_WEBHOOK_SECRET — same value used by trigger-vaatluste-refresh).
// This avoids ever exposing the service_role key outside Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("N8N_VAATLUSTE_WEBHOOK_SECRET") ?? "";

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
  if (!provided || provided !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Required fields
  if (!body.period_start || !body.period_end) {
    return json({ error: "missing_required_fields" }, 400);
  }

  const row = {
    period_start: body.period_start,
    period_end: body.period_end,
    intro_et: typeof body.intro_et === "string" ? body.intro_et : null,
    estonia_narrative_et:
      typeof body.estonia_narrative_et === "string" ? body.estonia_narrative_et : null,
    estonia_entries: Array.isArray(body.estonia_entries) ? body.estonia_entries : [],
    europe_narrative_et:
      typeof body.europe_narrative_et === "string" ? body.europe_narrative_et : null,
    europe_entries: Array.isArray(body.europe_entries) ? body.europe_entries : [],
    source_data:
      body.source_data && typeof body.source_data === "object" ? body.source_data : {},
    model: typeof body.model === "string" ? body.model : null,
    generation_meta:
      body.generation_meta && typeof body.generation_meta === "object"
        ? body.generation_meta
        : {},
  };

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("vaatluste_raport")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("insert failed:", error);
      return json({ error: error.message }, 500);
    }

    return json({ inserted: true, id: data.id }, 201);
  } catch (err) {
    console.error("unexpected error:", err);
    return json({ error: String(err) }, 500);
  }
});
