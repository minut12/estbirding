// insert-ufo-sightings
// Receives MUFON/UFOStalker sighting batches from n8n and upserts them into
// public.ufo_sightings using the service-role key. Auth via X-Webhook-Secret
// header against VAATLUSTE_WEBHOOK_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

const MAX_PER_CALL = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const expectedSecret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json(500, { error: "server_misconfigured" });
  }
  if (req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json(401, { error: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const sightings = body?.sightings;
  if (!Array.isArray(sightings)) {
    return json(400, { error: "missing_sightings_array" });
  }

  const limited = sightings.slice(0, MAX_PER_CALL);
  const now = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (const s of limited) {
    if (!s || typeof s !== "object") {
      skipped++;
      continue;
    }
    const r = s as Record<string, unknown>;
    const case_id = typeof r.case_id === "string" ? r.case_id.trim() : "";
    const lat = typeof r.lat === "number" ? r.lat : Number(r.lat);
    const lon = typeof r.lon === "number" ? r.lon : Number(r.lon);
    if (!case_id || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      skipped++;
      continue;
    }
    rows.push({
      case_id,
      occurred: r.occurred ?? null,
      submitted: r.submitted ?? null,
      lat,
      lon,
      city: typeof r.city === "string" ? r.city : null,
      region: typeof r.region === "string" ? r.region : null,
      shape: typeof r.shape === "string" ? r.shape : null,
      summary: typeof r.summary === "string" ? r.summary : null,
      source: typeof r.source === "string" ? r.source : null,
      tags: Array.isArray(r.tags) ? r.tags : [],
      url: typeof r.url === "string" ? r.url : null,
      updated_at: now,
    });
  }

  if (sightings.length > MAX_PER_CALL) {
    skipped += sightings.length - MAX_PER_CALL;
  }

  if (rows.length === 0) {
    return json(200, { ok: true, upserted: 0, skipped });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase
    .from("ufo_sightings")
    .upsert(rows, { onConflict: "case_id" });

  if (error) {
    return json(500, { error: "upsert_failed", detail: error.message });
  }

  return json(200, { ok: true, upserted: rows.length, skipped });
});
