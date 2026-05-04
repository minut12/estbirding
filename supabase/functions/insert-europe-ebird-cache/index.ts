// supabase/functions/insert-europe-ebird-cache/index.ts
//
// Webhook-secret-protected endpoint to upsert eBird neighbor-country occurrence data
// into europe_ebird_cache. Called by the n8n europe-ebird-cache workflow.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_COUNTRIES = new Set(['FI','SE','LV','LT','PL','BY','RU']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const expectedSecret = Deno.env.get('VAATLUSTE_WEBHOOK_SECRET');
  const providedSecret = req.headers.get('x-webhook-secret');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) {
    return new Response(JSON.stringify({ error: 'missing_rows_array' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const valid: any[] = [];
  const rejected: any[] = [];
  for (const r of rows) {
    const speciesName = typeof r?.species_name === 'string' ? r.species_name.trim() : '';
    const countryCode = typeof r?.country_code === 'string' ? r.country_code.trim().toUpperCase() : '';
    const occ7 = Number(r?.occ7);
    if (!speciesName) { rejected.push({ row: r, reason: 'missing_species_name' }); continue; }
    if (!ALLOWED_COUNTRIES.has(countryCode)) { rejected.push({ row: r, reason: `invalid_country_code:${countryCode}` }); continue; }
    if (!Number.isFinite(occ7) || occ7 < 0) { rejected.push({ row: r, reason: 'invalid_occ7' }); continue; }
    const lat = Number(r?.latest_lat);
    const lon = Number(r?.latest_lon);
    valid.push({
      species_name: speciesName,
      country_code: countryCode,
      occ7: Math.floor(occ7),
      latest_obs_date: r?.latest_obs_date || null,
      latest_lat: Number.isFinite(lat) ? lat : null,
      latest_lon: Number.isFinite(lon) ? lon : null,
      latest_loc: typeof r?.latest_loc === 'string' ? r.latest_loc.slice(0, 500) : null,
      fetched_at: new Date().toISOString(),
    });
  }

  if (valid.length === 0) {
    return new Response(JSON.stringify({ ok: true, upserted: 0, rejected }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await supabase
    .from('europe_ebird_cache')
    .upsert(valid, { onConflict: 'species_name,country_code' });

  if (error) {
    return new Response(JSON.stringify({ error: 'db_error', detail: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, upserted: valid.length, rejected }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
