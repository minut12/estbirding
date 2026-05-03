// supabase/functions/get-elurikkus-arrivals-window/index.ts
//
// Public endpoint returning ALL elurikkus.ee observations from the last 28 days
// (current 14d period + previous 14d period). Used by the vaatluste-koordinaator-elurikkus
// n8n workflow to compute newly-arrived species (current period MINUS previous period).
//
// No auth — limited scope (28 days), read-only, data already public via elurikkus.ee.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const DAYS_WINDOW = 28; // 14 current + 14 previous

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    .select("species_name, observed_at, locality, county, observer")
    .gte("observed_at", cutoffIso)
    .order("observed_at", { ascending: true });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify(data || []),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
});
