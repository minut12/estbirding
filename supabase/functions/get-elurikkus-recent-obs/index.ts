// get-elurikkus-recent-obs
// Serves last-7-days elurikkus observations with coords, capped to newest 20 per species.
// Public, read-only. Modeled on get-elurikkus-recent-rarities.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const DAYS_WINDOW = 7;
const CAP_PER_SPECIES = 20;

type Row = {
  species_name: string;
  observed_at: string;
  lat: number | null;
  lon: number | null;
  locality: string | null;
  county: string | null;
  observer: string | null;
  individual_count: number | null;
  behavior: string | null;
  sub_id: string | null;
  fetched_at: string | null;
};

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

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
  const speciesParam = (url.searchParams.get("species") || "").trim();
  const speciesFilter = speciesParam
    ? speciesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const daysParam = parseInt(url.searchParams.get("days") || "", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : DAYS_WINDOW;


  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  // Pull all last-7d rows for chosen species (for total_7d count),
  // then filter coord-bearing rows and cap in memory.
  let baseQuery = supabase
    .from("elurikkus_observations")
    .select(
      "species_name, observed_at, lat, lon, locality, county, observer, individual_count, behavior, sub_id, fetched_at",
    )
    .gte("observed_at", cutoffIso)
    .order("observed_at", { ascending: false })
    .order("fetched_at", { ascending: false });

  if (speciesFilter && speciesFilter.length > 0) {
    baseQuery = baseQuery.in("species_name", speciesFilter);
  }

  // page through to avoid 1k default cap
  const rows: Row[] = [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await baseQuery.range(from, from + PAGE - 1);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 100_000) break;
  }

  const totals = new Map<string, number>();
  const capped = new Map<string, Row[]>();
  for (const r of rows) {
    const sp = r.species_name;
    if (!sp) continue;
    totals.set(sp, (totals.get(sp) ?? 0) + 1);
    if (r.lat == null || r.lon == null) continue;
    const arr = capped.get(sp) ?? [];
    if (arr.length < CAP_PER_SPECIES) {
      arr.push(r);
      capped.set(sp, arr);
    }
  }

  const species: Record<string, unknown> = {};
  for (const [sp, total] of totals.entries()) {
    const obs = (capped.get(sp) ?? []).map((r) =>
      compact({
        d: r.observed_at,
        lat: typeof r.lat === "number" ? r.lat : Number(r.lat),
        lon: typeof r.lon === "number" ? r.lon : Number(r.lon),
        loc: r.locality,
        cty: r.county,
        obr: r.observer,
        n: r.individual_count,
        bhv: r.behavior,
        sid: r.sub_id,
      })
    );
    species[sp] = { total_7d: total, obs };
  }

  const body = {
    generated_at: new Date().toISOString(),
    days: days,
    cap_per_species: CAP_PER_SPECIES,
    species,
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
