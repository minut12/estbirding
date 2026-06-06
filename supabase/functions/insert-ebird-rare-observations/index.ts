import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });

  const expectedSecret = Deno.env.get('VAATLUSTE_WEBHOOK_SECRET');
  if (!expectedSecret) return jsonResponse(500, { error: 'server_misconfigured' });
  if (req.headers.get('x-webhook-secret') !== expectedSecret) return jsonResponse(401, { error: 'unauthorized' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: 'invalid_json' }); }

  const observations = body.observations;
  if (!Array.isArray(observations) || observations.length === 0) {
    return jsonResponse(200, { ok: true, inserted: 0, updated: 0, skipped: 0 });
  }
  const windCorridor =
    body.wind_corridor_at_time && typeof body.wind_corridor_at_time === 'object'
      ? body.wind_corridor_at_time : null;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('bulk_upsert_ebird_rare_observations', {
    p_observations: observations,
    p_wind_corridor: windCorridor,
  });
  if (error) return jsonResponse(500, { error: 'rpc_failed', detail: error.message });
  return jsonResponse(200, data ?? { ok: true });
});
