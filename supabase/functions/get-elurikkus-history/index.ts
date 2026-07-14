// get-elurikkus-history
// Serves coord-bearing elurikkus_observations for a single species, newest first.
// Read-only. Reads ONLY elurikkus_observations. Zero outbound network calls.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const PAGE = 1000;
const MAX_ROWS = 10000;

type Row = {
  observed_at: string;
  lat: number | null;
  lon: number | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const species = (url.searchParams.get("species") || "").trim();
  if (!species) {
    return new Response(JSON.stringify({ error: "species_required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sinceRaw = (url.searchParams.get("since") || "").trim();
  const sinceValid = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) &&
    !Number.isNaN(new Date(sinceRaw).getTime());
  const sinceApplied = sinceValid ? sinceRaw : null;
  const sinceEcho = sinceApplied;                       // only echo what was used
  const sinceInvalid = !!sinceRaw && !sinceValid;       // present but unparseable

  const todayIso = new Date().toISOString().slice(0, 10);

  const items: Array<{ d: string; lat: number; lon: number }> = [];
  let pages = 0;
  let truncated = false;
  let offset = 0;

  while (offset < MAX_ROWS) {
    let q = supabase
      .from("elurikkus_observations")
      .select("observed_at, lat, lon")
      .eq("species_name", species)
      .not("lat", "is", null)
      .not("lon", "is", null)
      .lte("observed_at", todayIso)
      .order("observed_at", { ascending: false })
      .order("id", { ascending: false });
    if (sinceApplied) q = q.gt("observed_at", sinceApplied);

    const upper = Math.min(offset + PAGE - 1, MAX_ROWS - 1);
    const { data, error } = await q.range(offset, upper);
    pages++;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const batch = (data ?? []) as Row[];
    for (const r of batch) {
      const lat = typeof r.lat === "number" ? r.lat : Number(r.lat);
      const lon = typeof r.lon === "number" ? r.lon : Number(r.lon);
      items.push({ d: r.observed_at, lat, lon });
    }

    if (batch.length < PAGE) break;
    offset += PAGE;
    if (offset >= MAX_ROWS) {
      truncated = true;
      break;
    }
  }

  const body = {
    species,
    since: sinceEcho,
    since_invalid: sinceInvalid,
    count: items.length,
    pages,
    truncated,
    items,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
});
