import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const EDGE_FUNCTION_VERSION = 'species-prediction-2026-03-17-a';
const DEFAULT_TIMEOUT_MS = 120000;
const WEBHOOK_ENV_KEY = 'SPECIES_PREDICTION_N8N_WEBHOOK_URL';
const AUTH_HEADER_ENV_KEY = 'SPECIES_PREDICTION_N8N_AUTH_HEADER';
const AUTH_VALUE_ENV_KEY = 'SPECIES_PREDICTION_N8N_AUTH_VALUE';
const TIMEOUT_ENV_KEY = 'SPECIES_PREDICTION_TIMEOUT_MS';
const LOG_PREFIX = '[species-prediction]';
const SUCCESS_STAGE = 'completed';

type FailureStage =
  | 'parse'
  | 'missing_webhook'
  | 'upstream_fetch'
  | 'upstream_timeout'
  | 'upstream_non_2xx'
  | 'invalid_upstream_json'
  | 'unexpected';

type DebugDetails = {
  requestId: string;
  elapsedMs: number;
  timeoutMsUsed: number;
  edgeFunctionVersion: string;
  webhook?: {
    configured: boolean;
    host: string | null;
    pathname: string | null;
  };
  upstreamStatus?: number | null;
  upstreamResponsePreview?: unknown;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const webhookUrl = readWebhookUrl();
    const webhookConfigured = webhookUrl.length > 0;
    const timeoutMsUsed = resolveTimeoutMs();

    if (req.method === 'GET' && url.searchParams.get('mode') === 'status') {
      console.info('[species-prediction] status check', {
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
        timeoutMsUsed,
        webhookConfigured,
        envKey: WEBHOOK_ENV_KEY,
      });
      return json({
        ok: true,
        stage: 'status',
        available: true,
        deployed: true,
        configured: webhookConfigured,
        webhookConfigured,
        timeoutMsUsed,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
        timestamp: new Date().toISOString(),
        message: webhookConfigured
          ? 'Prediction backend is deployed and configured'
          : 'Prediction backend is not configured yet',
      });
    }

    if (req.method !== 'POST') {
      return json({ message: 'Method not allowed' }, 405);
    }

    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    logLifecycle(requestId, 'request_received', {
      method: req.method,
      url: req.url,
      edgeFunctionVersion: EDGE_FUNCTION_VERSION,
    });

    let body: unknown;
    try {
      body = await req.json();
      logLifecycle(requestId, 'body_parsed', {
        bodyType: body === null ? 'null' : Array.isArray(body) ? 'array' : typeof body,
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} invalid JSON body`, { requestId, error: String(err) });
      return postJsonError({
        requestId,
        startedAt,
        message: 'Invalid request body',
        status: 400,
        stage: 'parse',
        webhookConfigured,
        timeoutMsUsed,
      });
    }

    const payload = body as Record<string, unknown> | null;
    const debugMode = payload?.debug === true;
    const safeWebhook = toSafeWebhook(webhookUrl);
    logLifecycle(requestId, 'webhook_loaded', {
      webhookConfigured,
      webhook: safeWebhook,
      debugMode,
    });

    if (!webhookConfigured) {
      console.warn(`${LOG_PREFIX} webhook env missing`, { requestId, envKey: WEBHOOK_ENV_KEY });
      return postJsonError({
        requestId,
        startedAt,
        message: 'Prediction backend is not configured yet',
        status: 503,
        stage: 'missing_webhook',
        webhookConfigured,
        timeoutMsUsed,
        debugMode,
        debugDetails: buildDebugDetails({
          requestId,
          startedAt,
          webhookUrl,
          timeoutMsUsed,
        }),
      });
    }

    const species = payload?.species as Record<string, unknown> | undefined;
    const settings = payload?.settings as Record<string, unknown> | undefined;
    const speciesKey = typeof species?.key === 'string' ? species.key.trim() : '';
    const speciesName = typeof species?.name === 'string' ? species.name.trim() : '';
    const speciesLatinName = typeof species?.latinName === 'string' ? species.latinName.trim() : '';
    const ebirdSpeciesCodeOverride = typeof settings?.ebirdSpeciesCodeOverride === 'string' ? settings.ebirdSpeciesCodeOverride.trim() : '';

    if (!speciesKey || !speciesName) {
      console.warn(`${LOG_PREFIX} missing required species fields`, { requestId });
      return postJsonError({
        requestId,
        startedAt,
        message: 'Missing species information for prediction',
        status: 400,
        stage: 'parse',
        webhookConfigured,
        timeoutMsUsed,
        debugMode,
        debugDetails: buildDebugDetails({
          requestId,
          startedAt,
          webhookUrl,
          timeoutMsUsed,
        }),
      });
    }

    logLifecycle(requestId, 'request_validated', {
      speciesKey,
      speciesName,
      latinName: speciesLatinName || null,
      ebirdSpeciesCodeOverride: ebirdSpeciesCodeOverride || null,
    });

    logLifecycle(requestId, 'timeout_ms_used', {
      timeoutMsUsed,
      timeoutEnvKey: TIMEOUT_ENV_KEY,
      edgeFunctionVersion: EDGE_FUNCTION_VERSION,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMsUsed);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const authHeader = (Deno.env.get(AUTH_HEADER_ENV_KEY) || '').trim();
      const authValue = (Deno.env.get(AUTH_VALUE_ENV_KEY) || '').trim();
      if (authHeader && authValue) headers[authHeader] = authValue;

      const upstreamStartedAt = new Date().toISOString();
      logLifecycle(requestId, 'upstream_request_start', {
        speciesKey,
        speciesName,
        latinName: speciesLatinName || null,
        ebirdSpeciesCodeOverride: ebirdSpeciesCodeOverride || null,
        webhookConfigured,
        webhook: safeWebhook,
        timeoutMsUsed,
        upstreamStartedAt,
      });

      const upstream = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await upstream.text();
      const upstreamBodyPreview = toPreview(safeJson(text));
      logLifecycle(requestId, 'upstream_response_received', {
        status: upstream.status,
        statusText: upstream.statusText,
        upstreamBodyPreview,
      });

      if (!upstream.ok) {
        const upstreamMessage = resolveReadableUpstreamMessage(text);
        console.error(`${LOG_PREFIX} webhook forwarding failed`, {
          requestId,
          status: upstream.status,
          statusText: upstream.statusText,
          upstreamMessage: upstreamMessage || null,
          upstreamBodyPreview,
        });
        return postJsonError({
          requestId,
          startedAt,
          message: normalizeUpstreamMessage(upstreamMessage),
          status: 502,
          stage: 'upstream_non_2xx',
          webhookConfigured,
          timeoutMsUsed,
          upstreamStatus: upstream.status,
          upstreamBody: safeJson(text),
          debugMode,
          debugDetails: buildDebugDetails({
            requestId,
            startedAt,
            webhookUrl,
            timeoutMsUsed,
            upstreamStatus: upstream.status,
            upstreamResponsePreview: upstreamBodyPreview,
          }),
        });
      }

      let data: unknown;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        console.error(`${LOG_PREFIX} upstream returned invalid JSON`, { requestId, upstreamBodyPreview });
        return postJsonError({
          requestId,
          startedAt,
          message: 'Prediction backend returned an invalid response',
          status: 502,
          stage: 'invalid_upstream_json',
          webhookConfigured,
          timeoutMsUsed,
          upstreamBody: text || null,
          debugMode,
          debugDetails: buildDebugDetails({
            requestId,
            startedAt,
            webhookUrl,
            timeoutMsUsed,
            upstreamStatus: upstream.status,
            upstreamResponsePreview: upstreamBodyPreview,
          }),
        });
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        console.error(`${LOG_PREFIX} upstream response is not a JSON object`, { requestId, upstreamBodyPreview });
        return postJsonError({
          requestId,
          startedAt,
          message: 'Prediction backend returned an invalid response',
          status: 502,
          stage: 'invalid_upstream_json',
          webhookConfigured,
          timeoutMsUsed,
          upstreamBody: data,
          debugMode,
          debugDetails: buildDebugDetails({
            requestId,
            startedAt,
            webhookUrl,
            timeoutMsUsed,
            upstreamStatus: upstream.status,
            upstreamResponsePreview: upstreamBodyPreview,
          }),
        });
      }

      const responseBody = data as Record<string, unknown>;
      const elapsedMs = Date.now() - startedAt;
      const finalBody = debugMode
        ? {
          ...responseBody,
          stage: SUCCESS_STAGE,
          elapsedMs,
          timeoutMsUsed,
          edgeFunctionVersion: EDGE_FUNCTION_VERSION,
          debug: buildDebugDetails({
            requestId,
            startedAt,
            webhookUrl,
            timeoutMsUsed,
            upstreamStatus: upstream.status,
            upstreamResponsePreview: upstreamBodyPreview,
          }),
        }
        : {
          ...responseBody,
          stage: SUCCESS_STAGE,
          elapsedMs,
          timeoutMsUsed,
          edgeFunctionVersion: EDGE_FUNCTION_VERSION,
        };
      logLifecycle(requestId, 'response_returned', {
        ok: true,
        status: 200,
        stage: SUCCESS_STAGE,
        elapsedMs,
        timeoutMsUsed,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      });
      return json(finalBody);
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) {
        logLifecycle(requestId, 'upstream_timeout', {
          timeoutMsUsed,
          edgeFunctionVersion: EDGE_FUNCTION_VERSION,
        });
        console.error(`${LOG_PREFIX} webhook timeout`, { requestId, timeoutMsUsed });
        return postJsonError({
          requestId,
          startedAt,
          message: 'Prediction request timed out',
          status: 504,
          stage: 'upstream_timeout',
          webhookConfigured,
          timeoutMsUsed,
          upstreamBody: { timeoutMsUsed },
          debugMode,
          debugDetails: buildDebugDetails({
            requestId,
            startedAt,
            webhookUrl,
            timeoutMsUsed,
            upstreamResponsePreview: { timeoutMsUsed },
          }),
        });
      }
      console.error(`${LOG_PREFIX} webhook request failed`, { requestId, error: String(err) });
      return postJsonError({
        requestId,
        startedAt,
        message: 'Prediction service is temporarily unavailable',
        status: 502,
        stage: 'upstream_fetch',
        webhookConfigured,
        timeoutMsUsed,
        upstreamBody: { error: String(err) },
        debugMode,
        debugDetails: buildDebugDetails({
          requestId,
          startedAt,
          webhookUrl,
          timeoutMsUsed,
          upstreamResponsePreview: { error: String(err) },
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logLifecycle('untracked', 'unexpected_error', {
      error: String(err),
      edgeFunctionVersion: EDGE_FUNCTION_VERSION,
    });
    console.error(`${LOG_PREFIX} unexpected error`, { error: String(err) });
    return postJsonError({
      requestId: crypto.randomUUID(),
      startedAt: Date.now(),
      message: 'Prediction service encountered an unexpected error',
      status: 500,
      stage: 'unexpected',
      webhookConfigured: readWebhookUrl().length > 0,
      timeoutMsUsed: resolveTimeoutMs(),
      upstreamBody: { error: String(err) },
    });
  }
});

function readWebhookUrl(): string {
  return (Deno.env.get(WEBHOOK_ENV_KEY) || '').trim();
}

function postJsonError(input: {
  requestId: string;
  startedAt: number;
  message: string;
  status: number;
  stage: FailureStage;
  webhookConfigured: boolean;
  timeoutMsUsed: number;
  upstreamStatus?: number;
  upstreamBody?: unknown;
  debugMode?: boolean;
  debugDetails?: DebugDetails;
}): Response {
  const elapsedMs = Date.now() - input.startedAt;
  const body: Record<string, unknown> = {
    ok: false,
    message: input.message,
    stage: input.stage,
    upstreamStatus: typeof input.upstreamStatus === 'number' ? input.upstreamStatus : null,
    upstreamBody: typeof input.upstreamBody !== 'undefined' ? input.upstreamBody : null,
    elapsedMs,
    timeoutMsUsed: input.timeoutMsUsed,
    edgeFunctionVersion: EDGE_FUNCTION_VERSION,
    webhookConfigured: input.webhookConfigured,
    status: input.status,
    requestId: input.requestId,
    timestamp: new Date().toISOString(),
  };
  if (input.debugMode) body.debug = input.debugDetails || null;
  logLifecycle(input.requestId, 'response_returned', {
    ok: false,
    status: input.status,
    stage: input.stage,
    elapsedMs,
    timeoutMsUsed: input.timeoutMsUsed,
    webhookConfigured: input.webhookConfigured,
    edgeFunctionVersion: EDGE_FUNCTION_VERSION,
  });
  return json(body, input.status);
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

function resolveTimeoutMs(): number {
  return clampNumber(
    Number(Deno.env.get(TIMEOUT_ENV_KEY) || DEFAULT_TIMEOUT_MS),
    5000,
    180000,
    DEFAULT_TIMEOUT_MS,
  );
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

function safeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function toSafeWebhook(value: string): { configured: boolean; host: string | null; pathname: string | null } {
  if (!value) return { configured: false, host: null, pathname: null };
  try {
    const url = new URL(value);
    return {
      configured: true,
      host: url.host || null,
      pathname: url.pathname || null,
    };
  } catch {
    return {
      configured: true,
      host: null,
      pathname: null,
    };
  }
}

function toPreview(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  return value;
}

function buildDebugDetails(input: {
  requestId: string;
  startedAt: number;
  webhookUrl: string;
  timeoutMsUsed: number;
  upstreamStatus?: number | null;
  upstreamResponsePreview?: unknown;
}): DebugDetails {
  return {
    requestId: input.requestId,
    elapsedMs: Date.now() - input.startedAt,
    timeoutMsUsed: input.timeoutMsUsed,
    edgeFunctionVersion: EDGE_FUNCTION_VERSION,
    webhook: toSafeWebhook(input.webhookUrl),
    upstreamStatus: typeof input.upstreamStatus === 'number' ? input.upstreamStatus : null,
    upstreamResponsePreview: typeof input.upstreamResponsePreview === 'undefined'
      ? null
      : input.upstreamResponsePreview,
  };
}

function logLifecycle(requestId: string, event: string, details: Record<string, unknown>): void {
  console.info(`${LOG_PREFIX} ${event}`, {
    requestId,
    ...details,
  });
}
