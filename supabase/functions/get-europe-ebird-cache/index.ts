// supabase/functions/get-europe-ebird-cache/index.ts
//
// Public endpoint returning rows from europe_ebird_cache for the
// linnuliigid Tõenäosus neighbor-country boost feature.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get('since');
  const speciesParam = url.searchParams.get('species');

  let sinceISO: string;
  if (sinceParam) {
    const d = new Date(sinceParam);
    sinceISO = isNaN(d.getTime())
      ? new Date(Date.now() - 48 * 3600 * 1000).toISOString()
      : d.toISOString();
  } else {
    sinceISO = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let q = supabase
    .from('europe_ebird_cache')
    .select('species_name, country_code, occ7, latest_obs_date, latest_lat, latest_lon, latest_loc, fetched_at')
    .gte('fetched_at', sinceISO)
    .order('fetched_at', { ascending: false });

  if (speciesParam) q = q.eq('species_name', speciesParam);

  const { data, error } = await q;

  if (error) {
    return new Response(JSON.stringify({ error: 'db_error', detail: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rows = data || [];
  const fetchedAts = rows.map((r) => r.fetched_at).filter(Boolean).sort();

  return new Response(JSON.stringify({
    rows,
    count: rows.length,
    oldest_fetched_at: fetchedAts[0] || null,
    newest_fetched_at: fetchedAts[fetchedAts.length - 1] || null,
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
});
