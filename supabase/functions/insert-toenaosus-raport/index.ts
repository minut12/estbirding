// insert-toenaosus-raport
// Receives the n8n Tõenäosus workflow payload and inserts a row into
// public.toenaosus_raport using the service-role key. Auth via
// X-Webhook-Secret header against N8N_TOENAOSUS_WEBHOOK_SECRET env var.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_SEASONS = new Set(['spring_summer', 'fall_winter']);

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const expectedSecret = Deno.env.get('N8N_TOENAOSUS_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return jsonResponse(500, {
      error: 'server_misconfigured',
      detail: 'N8N_TOENAOSUS_WEBHOOK_SECRET not set',
    });
  }
  if (req.headers.get('x-webhook-secret') !== expectedSecret) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const period_start = body.period_start as string | undefined;
  const period_end = body.period_end as string | undefined;
  const season = body.season as string | undefined;

  if (!period_start || !period_end || !season) {
    return jsonResponse(400, {
      error: 'missing_required_fields',
      required: ['period_start', 'period_end', 'season'],
    });
  }
  if (!ALLOWED_SEASONS.has(season)) {
    return jsonResponse(400, {
      error: 'invalid_season',
      allowed: Array.from(ALLOWED_SEASONS),
      received: season,
    });
  }

  const regions = Array.isArray(body.regions) ? (body.regions as string[]) : [];
  const intro_et = typeof body.intro_et === 'string' ? body.intro_et : null;
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const source_data =
    body.source_data && typeof body.source_data === 'object'
      ? (body.source_data as Record<string, unknown>)
      : {};
  const model = typeof body.model === 'string' ? body.model : null;
  const generation_meta =
    body.generation_meta && typeof body.generation_meta === 'object'
      ? (body.generation_meta as Record<string, unknown>)
      : {};

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase
    .from('toenaosus_raport')
    .insert({
      period_start,
      period_end,
      season,
      regions,
      intro_et,
      entries,
      source_data,
      model,
      generation_meta,
    })
    .select('id')
    .single();

  if (error) {
    return jsonResponse(500, { error: 'insert_failed', detail: error.message });
  }

  return jsonResponse(201, { inserted: true, id: data.id });
});
