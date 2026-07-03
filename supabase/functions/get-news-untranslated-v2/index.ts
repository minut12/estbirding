// get-news-untranslated-v2
// Returns rows from news_items where translation_v2_status = 'pending'.
// Auth: X-Webhook-Secret header must equal VAATLUSTE_WEBHOOK_SECRET.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const rawLimit = Number(body.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(50, Math.floor(rawLimit)))
    : 10;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase
    .from('news_items')
    .select('id,source_slug,source_lang,title,body')
    .eq('translation_v2_status', 'pending')
    .neq('source_slug', 'eoy')
    .or('source_lang.is.null,source_lang.neq.et')
    .order('published_at', { ascending: true })
    .limit(limit);

  if (error) {
    return jsonResponse(500, { error: 'db_error', detail: error.message });
  }

  return new Response(JSON.stringify(data ?? []), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
