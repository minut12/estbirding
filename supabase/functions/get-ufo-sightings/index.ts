// get-ufo-sightings
// Public endpoint returning recent UFO sightings from public.ufo_sightings.
// No auth — used by the usa-co-poi map layer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let days = parseInt(url.searchParams.get("days") ?? "90", 10);
  if (!Number.isFinite(days) || days <= 0) days = 90;
  if (days > 365) days = 365;

  let limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  if (limit > 300) limit = 300;

  const regionRaw = url.searchParams.get("region");
  const region =
    regionRaw && /^[A-Za-z ]{2,40}$/.test(regionRaw) ? regionRaw : null;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let query = supabase
    .from("ufo_sightings")
    .select(
      "case_id, occurred, submitted, lat, lon, city, region, shape, summary, source, tags, url",
    )
    .gte("submitted", cutoff)
    .order("submitted", { ascending: false })
    .limit(limit);

  if (region) {
    query = query.eq("region", region);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sightings: data ?? [] }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
});
