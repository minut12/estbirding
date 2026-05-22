// mark-observations-notified
// Marks ebird_rare_observations rows as notified by setting notification_sent_at.
// Only sets if currently NULL (preserves original notification time).
// Auth via X-Webhook-Secret against VAATLUSTE_WEBHOOK_SECRET.

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const observationIds = body.observation_ids;
  if (!Array.isArray(observationIds) || observationIds.length === 0) {
    return jsonResponse(200, { ok: true, marked: 0, already_notified: 0, errors: [] });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let marked = 0;
  let alreadyNotified = 0;
  const errors: Array<{ id: string; error: string }> = [];
  const now = new Date().toISOString();

  for (const rawId of observationIds) {
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id) {
      errors.push({ id: String(rawId), error: 'invalid_id' });
      continue;
    }

    try {
      // Check current value to differentiate newly marked vs already notified
      const { data: existing, error: selErr } = await supabase
        .from('ebird_rare_observations')
        .select('id, notification_sent_at')
        .eq('id', id)
        .maybeSingle();

      if (selErr) throw new Error(selErr.message);
      if (!existing) {
        errors.push({ id, error: 'not_found' });
        continue;
      }

      if (existing.notification_sent_at != null) {
        alreadyNotified++;
        continue;
      }

      const { error: updErr } = await supabase
        .from('ebird_rare_observations')
        .update({ notification_sent_at: now })
        .eq('id', id);

      if (updErr) throw new Error(updErr.message);
      marked++;
    } catch (e) {
      errors.push({
        id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return jsonResponse(200, { ok: true, marked, already_notified: alreadyNotified, errors });
});
