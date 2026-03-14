import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const DEFAULT_TIMEOUT_MS = 15000;
const WEBHOOK_ENV_KEY = 'SPECIES_PREDICTION_N8N_WEBHOOK_URL';
const AUTH_HEADER_ENV_KEY = 'SPECIES_PREDICTION_N8N_AUTH_HEADER';
const AUTH_VALUE_ENV_KEY = 'SPECIES_PREDICTION_N8N_AUTH_VALUE';
const TIMEOUT_ENV_KEY = 'SPECIES_PREDICTION_TIMEOUT_MS';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const webhookUrl = readWebhookUrl();
    const webhookConfigured = webhookUrl.length > 0;

    if (req.method === 'GET' && url.searchParams.get('mode') === 'status') {
      console.info('[species-prediction] status check', {
        webhookConfigured,
        envKey: WEBHOOK_ENV_KEY,
      });
      return json({
        ok: true,
        available: true,
        deployed: true,
        configured: webhookConfigured,
        webhookConfigured,
        message: webhookConfigured
          ? 'Prediction backend is deployed and configured'
          : 'Prediction backend is not configured yet',
      });
    }

    if (req.method !== 'POST') {
      return jsonError('Method not allowed', 405);
    }

    if (!webhookConfigured) {
      console.warn('[species-prediction] webhook env missing', { envKey: WEBHOOK_ENV_KEY });
      return jsonError('Prediction backend is not configured yet', 503);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      console.warn('[species-prediction] invalid JSON body');
      return jsonError('Invalid request body', 400);
    }

    const payload = body as Record<string, unknown> | null;
    const species = payload?.species as Record<string, unknown> | undefined;
    const speciesKey = typeof species?.key === 'string' ? species.key.trim() : '';
    const speciesName = typeof species?.name === 'string' ? species.name.trim() : '';
    const speciesLatinName = typeof species?.latinName === 'string' ? species.latinName.trim() : '';

    if (!speciesKey || !speciesName) {
      console.warn('[species-prediction] missing required species fields');
      return jsonError('Missing required species information', 400);
    }

    console.info('[species-prediction] request validated', {
      speciesKey,
      speciesName,
      latinName: speciesLatinName || null,
    });

    const timeoutMs = clampNumber(
      Number(Deno.env.get(TIMEOUT_ENV_KEY) || DEFAULT_TIMEOUT_MS),
      5000,
      30000,
      DEFAULT_TIMEOUT_MS,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const authHeader = (Deno.env.get(AUTH_HEADER_ENV_KEY) || '').trim();
      const authValue = (Deno.env.get(AUTH_VALUE_ENV_KEY) || '').trim();
      if (authHeader && authValue) headers[authHeader] = authValue;

      console.info('[species-prediction] forwarding request', {
        speciesKey,
        speciesName,
        latinName: speciesLatinName || null,
        webhookConfigured: true,
      });

      const upstream = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await upstream.text();

      if (!upstream.ok) {
        const upstreamMessage = resolveReadableUpstreamMessage(text);
        console.error('[species-prediction] webhook forwarding failed', {
          status: upstream.status,
          statusText: upstream.statusText,
          upstreamMessage: upstreamMessage || null,
        });
        return jsonError(normalizeUpstreamMessage(upstreamMessage), 502);
      }

      let data: unknown;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        console.error('[species-prediction] upstream returned invalid JSON');
        return jsonError('Prediction backend returned an invalid response', 502);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        console.error('[species-prediction] upstream response is not a JSON object');
        return jsonError('Prediction backend returned an invalid response', 502);
      }

      return json(data as Record<string, unknown>);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) {
        console.error('[species-prediction] webhook timeout', { timeoutMs });
        return jsonError('Prediction service is temporarily unavailable', 504);
      }
      console.error('[species-prediction] webhook request failed', { error: String(err) });
      return jsonError('Prediction service is temporarily unavailable', 502);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error('[species-prediction] unexpected error', { error: String(err) });
    return jsonError('Prediction service encountered an unexpected error', 500);
  }
});

function readWebhookUrl(): string {
  return (Deno.env.get(WEBHOOK_ENV_KEY) || '').trim();
}

function jsonError(message: string, status: number): Response {
  return json({ ok: false, message }, status);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function resolveReadableUpstreamMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown; error?: unknown; details?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    if (typeof parsed.details === 'string' && parsed.details.trim()) return parsed.details.trim();
  } catch {
    // Fall back to plain text below.
  }
  return trimmed;
}

function normalizeUpstreamMessage(message: string): string {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return 'Prediction service is temporarily unavailable';
  if (normalized.includes('missing required species information') || normalized.includes('missing species information')) {
    return 'Missing species information for prediction';
  }
  if (normalized.includes('invalid response')) {
    return 'Prediction backend returned an invalid response';
  }
  if (
    normalized.includes('temporarily unavailable')
    || normalized.includes('error in workflow')
    || normalized.includes('internal server error')
    || normalized.includes('bad gateway')
  ) {
    return 'Prediction service is temporarily unavailable';
  }
  return message;
}
