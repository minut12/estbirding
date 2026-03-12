import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const DEFAULT_TIMEOUT_MS = 15000;
const VALID_REQUEST_TYPES = new Set(['prediction', 'insight', 'prediction_and_insight']);
const VALID_RISKS = new Set(['low', 'medium', 'high']);

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
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const webhookUrl = (Deno.env.get('SPECIES_PREDICTION_N8N_WEBHOOK_URL') || '').trim();
    const webhookConfigured = Boolean(webhookUrl);

    if (req.method === 'GET' && url.searchParams.get('mode') === 'status') {
      const message = webhookConfigured
        ? 'Prediction backend is configured'
        : 'Prediction backend is not configured yet';
      console.log('[species-prediction] status request', { configured: webhookConfigured });
      return json({
        ok: true,
        configured: webhookConfigured,
        webhookConfigured,
        message,
      }, 200);
    }

    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed', message: 'Method not allowed' }, 405);
    }

    if (!webhookConfigured) {
      console.warn('[species-prediction] missing webhook env');
      return json({
        ok: false,
        disabled: true,
        error: 'Species prediction webhook is not configured',
        message: 'Prediction backend is not configured yet',
      }, 200);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body', message: 'Invalid JSON body' }, 400);
    }

    const payload = normalizeRequest(rawPayload);
    if (!payload.ok) {
      return json({ ok: false, error: payload.error, message: payload.error }, 400);
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
        body: JSON.stringify(payload.value),
        signal: controller.signal,
      });
      const text = await upstream.text();
      const parsed = parseJsonObject(text);

      if (!upstream.ok) {
        console.error('[species-prediction] webhook request failed', { status: upstream.status });
        return json({
          ok: false,
          error: `n8n request failed: ${upstream.status}`,
          message: `n8n request failed: ${upstream.status}`,
          details: parsed.ok ? parsed.value : { raw: text },
        }, 502);
      }

      if (!parsed.ok) {
        console.error('[species-prediction] webhook returned invalid JSON');
        return json({
          ok: false,
          error: 'n8n response was not valid JSON',
          message: 'n8n response was not valid JSON',
        }, 502);
      }

      const normalizedResult = normalizeResult(parsed.value, payload.value);
      if (!normalizedResult.ok) {
        return json({
          ok: false,
          error: normalizedResult.error,
          message: normalizedResult.error,
        }, 502);
      }

      return json({
        ok: true,
        message: 'Species prediction request succeeded',
        result: normalizedResult.value,
      }, 200);
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      const message = isAbort
        ? `Species prediction request timed out after ${timeoutMs}ms`
        : String((error as Error)?.message || error);
      console.error('[species-prediction] request failed', { message });
      return json({
        ok: false,
        error: message,
        message,
      }, isAbort ? 504 : 500);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected species prediction handler failure';
    console.error('[species-prediction] unexpected handler failure', error);
    return json({
      ok: false,
      error: message,
      message,
    }, 500);
  }
});

function normalizeRequest(input: unknown):
  | { ok: true; value: { requestType: string; species: { key: string; name: string; latinName: string }; settings: Record<string, unknown> } }
  | { ok: false; error: string } {
  const payload = asRecord(input);
  const requestType = String(payload.requestType || '').trim();
  const species = asRecord(payload.species);
  const settings = asRecord(payload.settings);
  const speciesKey = String(species.key || '').trim();
  const speciesName = String(species.name || '').trim();
  const latinName = String(species.latinName || '').trim();

  if (!VALID_REQUEST_TYPES.has(requestType)) {
    return { ok: false, error: 'requestType is required and must be prediction, insight, or prediction_and_insight' };
  }
  if (!speciesKey || !speciesName) {
    return { ok: false, error: 'species.key and species.name are required' };
  }
  if (!payload.settings || typeof payload.settings !== 'object' || Array.isArray(payload.settings)) {
    return { ok: false, error: 'settings object is required' };
  }

  return {
    ok: true,
    value: {
      requestType,
      species: {
        key: speciesKey,
        name: speciesName,
        latinName,
      },
      settings,
    },
  };
}

function normalizeResult(
  input: Record<string, unknown>,
  request: { species: { key: string; name: string } },
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  const source = asRecord(input.result && typeof input.result === 'object' ? input.result : input);
  if (!source || Object.keys(source).length === 0) {
    return { ok: false, error: 'n8n response body was empty' };
  }

  const countryScoresInput = asRecord(source.countryScores);
  const pointsInput = Array.isArray(source.topPredictedPoints) ? source.topPredictedPoints : [];

  return {
    ok: true,
    value: {
      speciesKey: cleanString(source.speciesKey || request.species.key),
      speciesName: cleanString(source.speciesName || request.species.name),
      generatedAt: cleanString(source.generatedAt) || new Date().toISOString(),
      externalPressureScore: toNumber(source.externalPressureScore),
      springFitScore: toNumber(source.springFitScore),
      windSupportScore: toNumber(source.windSupportScore),
      routeVector: cleanString(source.routeVector),
      bestEntryZone: cleanString(source.bestEntryZone),
      alreadyMissedRisk: normalizeRisk(source.alreadyMissedRisk),
      countryScores: {
        latvia: toNumber(countryScoresInput.latvia),
        lithuania: toNumber(countryScoresInput.lithuania),
        belarus: toNumber(countryScoresInput.belarus),
        poland: toNumber(countryScoresInput.poland),
        russia: toNumber(countryScoresInput.russia),
        ...(countryScoresInput.finlandContextOnly != null
          ? { finlandContextOnly: toNumber(countryScoresInput.finlandContextOnly) }
          : (countryScoresInput.finlandContext != null ? { finlandContextOnly: toNumber(countryScoresInput.finlandContext) } : {})),
      },
      topPredictedPoints: pointsInput.map((point, index) => normalizePoint(point, index)),
      ...(cleanString(source.insightSummary) ? { insightSummary: cleanString(source.insightSummary) } : {}),
      ...(source.rawResearchPayload && typeof source.rawResearchPayload === 'object' ? { rawResearchPayload: source.rawResearchPayload } : {}),
    },
  };
}

function normalizePoint(point: unknown, index: number) {
  const row = asRecord(point);
  return {
    rank: clampNumber(row.rank, 1, 99, index + 1),
    name: cleanString(row.name),
    countyOrParish: cleanString(row.countyOrParish),
    lat: toNumber(row.lat),
    lon: toNumber(row.lon),
    confidence: clampNumber(row.confidence, 0, 100, 0),
    eta: cleanString(row.eta),
    searchRadiusKm: clampNumber(row.searchRadiusKm, 0, 500, 0),
    habitatCue: cleanString(row.habitatCue),
    reason: cleanString(row.reason),
  };
}

function parseJsonObject(text: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const value = text ? JSON.parse(text) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanString(value: unknown): string {
  return String(value || '').trim();
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeRisk(value: unknown): string {
  const risk = cleanString(value).toLowerCase();
  return VALID_RISKS.has(risk) ? risk : 'low';
}
