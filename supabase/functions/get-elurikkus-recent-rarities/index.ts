// supabase/functions/get-elurikkus-recent-rarities/index.ts
//
// Public endpoint returning elurikkus.ee observations for rare/super/mega species
// from the last 14 days. Used by the vaatluste-koordinaator-elurikkus n8n workflow.
// No auth required — limited scope, read-only, data is already public via elurikkus.ee.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const DAYS_WINDOW = 14;
const SPECIES_META_URL =
  "https://eenwcyuyugyrjgpivxrq.supabase.co/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let metaRes: any;
  try {
    const metaFetch = await fetch(SPECIES_META_URL + "?t=" + Date.now(), {
      headers: { "Cache-Control": "no-cache" },
    });
    if (!metaFetch.ok) {
      return new Response(
        JSON.stringify({ error: `species_meta fetch failed: HTTP ${metaFetch.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    metaRes = await metaFetch.json();
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: `species_meta fetch error: ${String(e?.message || e)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const items = (metaRes && metaRes.items) || {};
  const rareSpeciesNames: string[] = [];
  for (const estKey of Object.keys(items)) {
    const item = items[estKey] || {};
    const lvl = item.rarityLevel;
    if (lvl === "rare" || lvl === "super" || lvl === "mega") {
      const capitalized = estKey.charAt(0).toUpperCase() + estKey.slice(1);
      rareSpeciesNames.push(capitalized);
    }
  }

  if (rareSpeciesNames.length === 0) {
    return new Response(
      JSON.stringify({ error: "No rare species found in species_meta dictionary" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
    .select(
      "species_name, species_lat, observed_at, locality, county, lat, lon, observer, individual_count, behavior, sub_id",
    )
    .gte("observed_at", cutoffIso)
    .in("species_name", rareSpeciesNames)
    .order("observed_at", { ascending: false });

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
