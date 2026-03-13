import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const DEFAULT_TIMEOUT_MS = 15000;

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return json({}, 204);
  }

  try {
    const url = new URL(req.url);
    const webhookUrl = (Deno.env.get('SPECIES_PREDICTION_N8N_WEBHOOK_URL') || '').trim();
    const webhookConfigured = Boolean(webhookUrl);

    // ── GET ?mode=status ──
    if (req.method === 'GET' && url.searchParams.get('mode') === 'status') {
      console.log('[species-prediction] status check', { configured: webhookConfigured });
      return json({
        ok: true,
        configured: webhookConfigured,
        webhookConfigured,
        message: webhookConfigured
          ? 'Prediction backend is configured'
          : 'Prediction backend is not configured yet',
      });
    }

    // ── Only POST allowed beyond this point ──
    if (req.method !== 'POST') {
      return json({ ok: false, message: 'Method not allowed' }, 405);
    }

    // ── Check webhook env ──
    if (!webhookConfigured) {
      console.warn('[species-prediction] SPECIES_PREDICTION_N8N_WEBHOOK_URL is not set');
      return json({ ok: false, message: 'Prediction backend is not configured yet' }, 503);
    }

    // ── Parse body ──
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400);
    }

    // ── Validate payload ──
    const payload = body as Record<string, unknown> | null;
    const species = payload?.species as Record<string, unknown> | undefined;
    if (!species?.key || !species?.name) {
      console.warn('[species-prediction] missing species.key or species.name');
      return json({ ok: false, message: 'Missing required species information' }, 400);
    }

    // ── Forward to n8n webhook ──
    const timeoutMs = clampNumber(
      Number(Deno.env.get('SPECIES_PREDICTION_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS),
      5000, 30000, DEFAULT_TIMEOUT_MS,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      const authHeader = (Deno.env.get('SPECIES_PREDICTION_N8N_AUTH_HEADER') || '').trim();
      const authValue = (Deno.env.get('SPECIES_PREDICTION_N8N_AUTH_VALUE') || '').trim();
      if (authHeader && authValue) {
        headers[authHeader] = authValue;
      }

      const upstream = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await upstream.text();

      if (!upstream.ok) {
        console.error('[species-prediction] upstream failed', { status: upstream.status });
        return json({ ok: false, message: 'Prediction service is temporarily unavailable' }, 502);
      }

      // ── Parse upstream JSON ──
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        console.error('[species-prediction] upstream returned invalid JSON');
        return json({ ok: false, message: 'Prediction backend returned an invalid response' }, 502);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        console.error('[species-prediction] upstream response is not a JSON object');
        return json({ ok: false, message: 'Prediction backend returned an invalid response' }, 502);
      }

      // ── Normalize and return result ──
      const source = (data as Record<string, unknown>).result ?? data;
      const result = typeof source === 'object' && source && !Array.isArray(source)
        ? source as Record<string, unknown>
        : data as Record<string, unknown>;

      if (!result || Object.keys(result).length === 0) {
        return json({ ok: false, message: 'Prediction backend returned an empty response' }, 502);
      }

      return json(result);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) {
        console.error('[species-prediction] upstream timed out', { timeoutMs });
        return json({ ok: false, message: 'Prediction service is temporarily unavailable' }, 504);
      }
      console.error('[species-prediction] upstream error', { error: String(err) });
      return json({ ok: false, message: 'Prediction service is temporarily unavailable' }, 502);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error('[species-prediction] unexpected error', err);
    return json({ ok: false, message: 'Prediction service encountered an unexpected error' }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
