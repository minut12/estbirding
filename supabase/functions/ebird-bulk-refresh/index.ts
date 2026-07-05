import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, x-refresh-secret, apikey, authorization",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Auth check
  const secret = req.headers.get("x-refresh-secret") || "";
  const expected = Deno.env.get("EBIRD_REFRESH_SECRET") || "";
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const t0 = Date.now();

  // Read observations from POST body (n8n fetches eBird and passes them here)
  const body = await req.json().catch(() => ({}));
  const observations: Array<{
    comName?: string;
    obsDt?: string;
    lat?: number;
    lng?: number;
    locName?: string;
    subId?: string;
  }> = body?.observations;

  if (!Array.isArray(observations) || observations.length === 0) {
    return new Response(
      JSON.stringify({
        error: "Missing or empty observations array in request body",
        duration_ms: Date.now() - t0,
      }),
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    // Aggregate by species
    const bySpecies = new Map<
      string,
      {
        occ7: number;
        t: string;
        lat: number;
        lon: number;
        location_name: string;
        sub_id: string;
      }
    >();

    for (const obs of observations) {
      const name = obs.comName;
      if (!name) continue;
      const existing = bySpecies.get(name);
      const obsDate = obs.obsDt?.split(" ")[0] || "";
      if (!existing || obsDate > existing.t) {
        bySpecies.set(name, {
          occ7: (existing?.occ7 || 0) + 1,
          t: obsDate,
          lat: obs.lat ?? 0,
          lon: obs.lng ?? 0,
          location_name: obs.locName || "",
          sub_id: obs.subId || "",
        });
      } else {
        existing.occ7++;
      }
    }

    // Upsert into ebird_cache
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase env vars");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rows = Array.from(bySpecies.entries()).map(
      ([species_name, d]) => ({
        species_name,
        lat: d.lat,
        lon: d.lon,
        occ7: d.occ7,
        t: d.t,
        location_name: d.location_name,
        sub_id: d.sub_id,
        fetched_at: new Date().toISOString(),
      }),
    );

    let updated = 0;
    let errors = 0;

    // Batch upsert in chunks of 500 to stay within Supabase limits
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("ebird_cache")
        .upsert(chunk, { onConflict: "species_name" });
      if (error) {
        errors++;
        console.error("[ebird-bulk-refresh] upsert error:", error.message);
      } else {
        updated += chunk.length;
      }
    }


    const duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({
        done: rows.length,
        updated,
        errors,
        species_count: rows.length,
        observations_total: observations.length,
        duration_ms,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (e) {
    const duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({
        error: String(e),
        duration_ms,
      }),
      { status: 500, headers: corsHeaders },
    );
  }
});
