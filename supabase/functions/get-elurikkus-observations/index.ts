// supabase/functions/get-elurikkus-observations/index.ts
//
// Returns recent rows from elurikkus_observations as a JSON array.
// Auth: X-Webhook-Secret: <VAATLUSTE_WEBHOOK_SECRET>  (matches repo convention)
// Used by the vaatluste-koordinaator n8n workflow to supplement the Estonia
// section of Ülevaade reports with elurikkus.ee observations.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-webhook-secret, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DAYS_WINDOW = 14;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const providedSecret = req.headers.get("x-webhook-secret") || "";
  const expectedSecret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: VAATLUSTE_WEBHOOK_SECRET unset" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (providedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - DAYS_WINDOW);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("elurikkus_observations")
    .select("species_name, species_lat, observed_at, locality, county, lat, lon, observer, individual_count, behavior, sub_id")
    .gte("observed_at", cutoffIso)
    .order("observed_at", { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify(data || []),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
