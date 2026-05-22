// insert-ebird-rare-observations
// Append-only archive for rare/super/mega bird sightings from neighbor countries.
// Dedup on (ebird_sub_id, species_code). Auth via X-Webhook-Secret against
// VAATLUSTE_WEBHOOK_SECRET (shared with the other insert-* functions).

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

interface ObsInput {
  ebird_sub_id?: string;
  species_code?: string;
  species_lat_name?: string;
  species_et_name?: string;
  rarity_level?: string;
  country_code?: string;
  region?: string;
  location?: string;
  lat?: number;
  lng?: number;
  distance_to_ee_km?: number;
  obs_date?: string;
  obs_count?: number;
  observer_names?: string[];
  raw_observation?: Record<string, unknown>;
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

  const observations = body.observations;
  if (!Array.isArray(observations) || observations.length === 0) {
    return jsonResponse(200, { ok: true, inserted: 0, updated: 0, skipped: 0, errors: [] });
  }

  const windCorridor =
    body.wind_corridor_at_time && typeof body.wind_corridor_at_time === 'object'
      ? (body.wind_corridor_at_time as Record<string, unknown>)
      : null;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ ebird_sub_id?: string; species_code?: string; error: string }> = [];

  for (const raw of observations as ObsInput[]) {
    const obs = raw && typeof raw === 'object' ? raw : ({} as ObsInput);
    const sub = typeof obs.ebird_sub_id === 'string' ? obs.ebird_sub_id : '';
    const code = typeof obs.species_code === 'string' ? obs.species_code : '';
    const date = typeof obs.obs_date === 'string' ? obs.obs_date : '';

    if (!sub || !code || !date) {
      skipped++;
      continue;
    }

    try {
      // Check existence to differentiate insert vs update and to preserve immutable fields.
      const { data: existing, error: selErr } = await supabase
        .from('ebird_rare_observations')
        .select(
          'id, species_lat_name, species_et_name, rarity_level, country_code, region, location, lat, lng, distance_to_ee_km, raw_observation',
        )
        .eq('ebird_sub_id', sub)
        .eq('species_code', code)
        .maybeSingle();

      if (selErr) throw new Error(selErr.message);

      const now = new Date().toISOString();

      if (!existing) {
        const insertRow: Record<string, unknown> = {
          ebird_sub_id: sub,
          species_code: code,
          species_lat_name: obs.species_lat_name ?? null,
          species_et_name: obs.species_et_name ?? null,
          rarity_level: obs.rarity_level ?? null,
          country_code: obs.country_code ?? null,
          region: obs.region ?? null,
          location: obs.location ?? null,
          lat: typeof obs.lat === 'number' ? obs.lat : null,
          lng: typeof obs.lng === 'number' ? obs.lng : null,
          distance_to_ee_km:
            typeof obs.distance_to_ee_km === 'number' ? obs.distance_to_ee_km : null,
          obs_date: date,
          obs_count: typeof obs.obs_count === 'number' ? obs.obs_count : null,
          observer_names: Array.isArray(obs.observer_names) ? obs.observer_names : null,
          wind_corridor_at_time: windCorridor,
          raw_observation:
            obs.raw_observation && typeof obs.raw_observation === 'object'
              ? obs.raw_observation
              : null,
          first_seen_at: now,
          last_seen_at: now,
        };

        const { error: insErr } = await supabase
          .from('ebird_rare_observations')
          .insert(insertRow);
        if (insErr) throw new Error(insErr.message);
        inserted++;
      } else {
        // Backfill NULL-only fields; always refresh last_seen_at and wind_corridor_at_time.
        const updateRow: Record<string, unknown> = {
          last_seen_at: now,
          wind_corridor_at_time: windCorridor,
        };
        const backfill: Array<[string, unknown]> = [
          ['species_lat_name', obs.species_lat_name],
          ['species_et_name', obs.species_et_name],
          ['rarity_level', obs.rarity_level],
          ['country_code', obs.country_code],
          ['region', obs.region],
          ['location', obs.location],
          ['lat', typeof obs.lat === 'number' ? obs.lat : undefined],
          ['lng', typeof obs.lng === 'number' ? obs.lng : undefined],
          [
            'distance_to_ee_km',
            typeof obs.distance_to_ee_km === 'number' ? obs.distance_to_ee_km : undefined,
          ],
          [
            'raw_observation',
            obs.raw_observation && typeof obs.raw_observation === 'object'
              ? obs.raw_observation
              : undefined,
          ],
        ];
        for (const [field, value] of backfill) {
          if (value === undefined || value === null) continue;
          if ((existing as Record<string, unknown>)[field] == null) {
            updateRow[field] = value;
          }
        }

        const { error: updErr } = await supabase
          .from('ebird_rare_observations')
          .update(updateRow)
          .eq('ebird_sub_id', sub)
          .eq('species_code', code);
        if (updErr) throw new Error(updErr.message);
        updated++;
      }
    } catch (e) {
      errors.push({
        ebird_sub_id: sub,
        species_code: code,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return jsonResponse(200, { ok: true, inserted, updated, skipped, errors });
});
