// supabase/functions/insert-elurikkus-raport/index.ts
//
// Inserts a new row into elurikkus_raport. Auth: X-Webhook-Secret header.
// Called by the n8n vaatluste-koordinaator-elurikkus workflow.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-webhook-secret, content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InsertPayload {
  period_start: string;
  period_end: string;
  intro_et?: string | null;
  estonia_entries: unknown[];
  generation_meta?: Record<string, unknown> | null;
  kevadranne_narrative_et?: string | null;
  kevadranne_arrivals?: unknown[];
}

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

  const expectedSecret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json({ error: "Server misconfigured: VAATLUSTE_WEBHOOK_SECRET unset" }, 500);
  }
  const providedSecret = req.headers.get("x-webhook-secret") || "";
  if (providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: InsertPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!payload.period_start || !payload.period_end || !Array.isArray(payload.estonia_entries)) {
    return json(
      { error: "Missing required fields: period_start, period_end, estonia_entries" },
      400,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("elurikkus_raport")
    .insert({
      period_start: payload.period_start,
      period_end: payload.period_end,
      intro_et: payload.intro_et ?? null,
      estonia_entries: payload.estonia_entries,
      generation_meta: payload.generation_meta ?? {},
      kevadranne_narrative_et: payload.kevadranne_narrative_et ?? null,
      kevadranne_arrivals: payload.kevadranne_arrivals ?? [],
    })
    .select("id, generated_at")
    .single();

  if (error) {
    console.error("insert failed:", error);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, id: data.id, generated_at: data.generated_at }, 200);
});
