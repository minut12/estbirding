// supabase/functions/get-ennustus-map/index.ts
//
// Returns rows from ennustus_cache as a JSON array.
// Auth: none (public endpoint, mirrors get-elurikkus-recent-rarities pattern).
// Used by the vaatluste-koordinaator n8n workflow to enrich europe_entries with
// Estonia's current_pct probability for entries from neighbor countries.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-webhook-secret, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Service-role client to read ennustus_cache (bypasses RLS) ---
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("ennustus_cache")
    .select("species_name, current_pct, no_data");

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
