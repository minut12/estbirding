// update-news-translation-v2
// Applies whitelisted patch to a news_items row.
// Auth: X-Webhook-Secret header must equal VAATLUSTE_WEBHOOK_SECRET.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_KEYS = new Set([
  'title_et_v2',
  'body_et_v2',
  'translation_engine',
  'translation_v2_status',
  'translation_v2_error',
  'translated_v2_at',
]);

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

  const expectedSecret = Deno.env.get('VAATLUSTE_WEBHOOK_SECRET');
  if (!expectedSecret) {
    return jsonResponse(500, {
      error: 'server_misconfigured',
      detail: 'VAATLUSTE_WEBHOOK_SECRET not set',
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

  const id = body.id;
  if (typeof id !== 'string' || !id) {
    return jsonResponse(400, { error: 'invalid_id' });
  }

  const patch = body.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return jsonResponse(400, { error: 'invalid_patch' });
  }

  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (ALLOWED_KEYS.has(k)) safe[k] = v;
  }
  if (Object.keys(safe).length === 0) {
    return jsonResponse(400, { error: 'no_allowed_fields' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await supabase.from('news_items').update(safe).eq('id', id);
  if (error) {
    return jsonResponse(500, { error: 'db_error', detail: error.message });
  }

  return jsonResponse(200, { ok: true, id });
});
