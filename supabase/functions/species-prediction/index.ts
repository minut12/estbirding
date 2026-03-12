import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const DEFAULT_TIMEOUT_MS = 15000;

type PredictionRequest = {
  requestType?: string;
  species?: {
    key?: string;
    name?: string;
    latinName?: string;
  };
  settings?: Record<string, unknown>;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const webhookUrl = (Deno.env.get('SPECIES_PREDICTION_N8N_WEBHOOK_URL') || '').trim();
  if (!webhookUrl) {
    return json({
      ok: false,
      disabled: true,
      error: 'Species prediction webhook is not configured',
    }, 200);
  }

  let payload: PredictionRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const speciesName = String(payload?.species?.name || '').trim();
  const speciesKey = String(payload?.species?.key || '').trim();
  if (!speciesName || !speciesKey) {
    return json({ ok: false, error: 'Species key and name are required' }, 400);
  }

  const timeoutMs = Math.max(5000, Math.min(30000, Number(Deno.env.get('SPECIES_PREDICTION_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    const authHeaderName = (Deno.env.get('SPECIES_PREDICTION_N8N_AUTH_HEADER') || '').trim();
    const authHeaderValue = (Deno.env.get('SPECIES_PREDICTION_N8N_AUTH_VALUE') || '').trim();
    if (authHeaderName && authHeaderValue) {
      headers[authHeaderName] = authHeaderValue;
    }

    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await upstream.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!upstream.ok) {
      return json({
        ok: false,
        error: `n8n request failed: ${upstream.status}`,
        details: body,
      }, 502);
    }

    return json({
      ok: true,
      ...(body?.result ? body : { result: body }),
    }, 200);
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    return json({
      ok: false,
      error: isAbort ? `Species prediction request timed out after ${timeoutMs}ms` : String((error as Error)?.message || error),
    }, isAbort ? 504 : 500);
  } finally {
    clearTimeout(timer);
  }
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
