import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const EDGE_FUNCTION_VERSION = 'species-prediction-2026-03-17-async';
const DEFAULT_TIMEOUT_MS = 120000;
const WEBHOOK_ENV_KEY = 'SPECIES_PREDICTION_N8N_WEBHOOK_URL';
const AUTH_HEADER_ENV_KEY = 'SPECIES_PREDICTION_N8N_AUTH_HEADER';
const AUTH_VALUE_ENV_KEY = 'SPECIES_PREDICTION_N8N_AUTH_VALUE';
const TIMEOUT_ENV_KEY = 'SPECIES_PREDICTION_TIMEOUT_MS';
const LOG_PREFIX = '[species-prediction]';

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const webhookUrl = readWebhookUrl();
    const webhookConfigured = webhookUrl.length > 0;
    const timeoutMsUsed = resolveTimeoutMs();

    // ── GET ?mode=status ──
    if (req.method === 'GET' && url.searchParams.get('mode') === 'status') {
      console.info(`${LOG_PREFIX} status check`, { webhookConfigured, edgeFunctionVersion: EDGE_FUNCTION_VERSION });
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

    // ── GET ?mode=poll&requestId=X ──
    if (req.method === 'GET' && url.searchParams.get('mode') === 'poll') {
      const requestId = (url.searchParams.get('requestId') || '').trim();
      if (!requestId) {
        return json({ ok: false, message: 'Missing requestId parameter' }, 400);
      }
      console.info(`${LOG_PREFIX} poll`, { requestId });
      const admin = getSupabaseAdmin();
      const { data: job, error: jobError } = await admin
        .from('prediction_jobs')
        .select('*')
        .eq('request_id', requestId)
        .maybeSingle();

      if (jobError) {
        console.error(`${LOG_PREFIX} poll db error`, { requestId, error: String(jobError) });
        return json({ ok: false, message: 'Failed to retrieve job status' }, 500);
      }
      if (!job) {
        return json({ ok: false, message: `Job ${requestId} not found` }, 404);
      }

      const response: Record<string, unknown> = {
        ok: true,
        requestId: job.request_id,
        status: job.status,
        speciesKey: job.species_key,
        speciesName: job.species_name,
        scope: job.scope,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        generatedAt: job.generated_at,
        analysisVersion: job.analysis_version,
      };

      if (job.status === 'completed' && job.result_json) {
        response.result = job.result_json;
      }
      if (job.status === 'failed' && job.error_json) {
        response.error = job.error_json;
      }

      return json(response);
    }

    // ── POST: create async prediction job ──
    if (req.method !== 'POST') {
      return json({ ok: false, message: 'Method not allowed' }, 405);
    }

    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    console.info(`${LOG_PREFIX} request_received`, { requestId, edgeFunctionVersion: EDGE_FUNCTION_VERSION });

    let body: unknown;
    try {
      body = await req.json();
    } catch (err) {
      console.warn(`${LOG_PREFIX} invalid JSON body`, { requestId, error: String(err) });
      return json({
        ok: false,
        message: 'Invalid request body',
        requestId,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      }, 400);
    }

    if (!webhookConfigured) {
      console.warn(`${LOG_PREFIX} webhook env missing`, { requestId, envKey: WEBHOOK_ENV_KEY });
      return json({
        ok: false,
        message: 'Prediction backend is not configured yet',
        requestId,
        stage: 'missing_webhook',
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      }, 503);
    }

    const payload = body as Record<string, unknown> | null;
    const species = payload?.species as Record<string, unknown> | undefined;
    const settings = payload?.settings as Record<string, unknown> | undefined;
    const speciesKey = typeof species?.key === 'string' ? species.key.trim() : '';
    const speciesName = typeof species?.name === 'string' ? species.name.trim() : '';
    const scope = typeof payload?.scope === 'string' ? payload.scope.trim() : 'linnuliigid';

    if (!speciesKey || !speciesName) {
      return json({
        ok: false,
        message: 'Missing species information for prediction',
        requestId,
        stage: 'parse',
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      }, 400);
    }

    // Create job record
    const admin = getSupabaseAdmin();
    const { error: insertError } = await admin
      .from('prediction_jobs')
      .insert({
        request_id: requestId,
        species_key: speciesKey,
        species_name: speciesName,
        scope,
        status: 'running',
        settings: settings ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`${LOG_PREFIX} failed to create job`, { requestId, error: String(insertError) });
      return json({
        ok: false,
        message: 'Failed to create prediction job',
        requestId,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      }, 500);
    }

    console.info(`${LOG_PREFIX} job created, starting background n8n call`, {
      requestId,
      speciesKey,
      speciesName,
      timeoutMsUsed,
    });

    // Fire-and-forget background work
    const backgroundWork = executeN8nAndPersist({
      requestId,
      webhookUrl,
      payload: payload ?? {},
      speciesKey,
      speciesName,
      timeoutMsUsed,
      admin,
    });

    // Keep background work alive via waitUntil if available
    try {
      const runtime = (globalThis as Record<string, unknown>).EdgeRuntime as
        | { waitUntil?: (p: Promise<unknown>) => void }
        | undefined;
      if (runtime?.waitUntil) {
        runtime.waitUntil(backgroundWork);
      }
    } catch {
      // waitUntil not available - background work may get killed
    }

    // Return immediately with 202 Accepted
    return json({
      ok: true,
      accepted: true,
      requestId,
      status: 'running',
      speciesKey,
      speciesName,
      scope,
      edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      message: 'Prediction job accepted and running',
    }, 202);

  } catch (err) {
    console.error(`${LOG_PREFIX} unexpected error`, { error: String(err) });
    return json({
      ok: false,
      message: 'Prediction service encountered an unexpected error',
      edgeFunctionVersion: EDGE_FUNCTION_VERSION,
    }, 500);
  }
});

// ── Background worker: call n8n and persist result ──
async function executeN8nAndPersist(opts: {
  requestId: string;
  webhookUrl: string;
  payload: Record<string, unknown>;
  speciesKey: string;
  speciesName: string;
  timeoutMsUsed: number;
  admin: ReturnType<typeof getSupabaseAdmin>;
}): Promise<void> {
  const { requestId, webhookUrl, payload, speciesKey, speciesName, timeoutMsUsed, admin } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMsUsed);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authHeader = (Deno.env.get(AUTH_HEADER_ENV_KEY) || '').trim();
    const authValue = (Deno.env.get(AUTH_VALUE_ENV_KEY) || '').trim();
    if (authHeader && authValue) headers[authHeader] = authValue;

    console.info(`${LOG_PREFIX} upstream_request_start`, { requestId, speciesKey });

    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error(`${LOG_PREFIX} upstream non-2xx`, { requestId, status: upstream.status });
      await admin.from('prediction_jobs').update({
        status: 'failed',
        error_json: { message: 'Upstream returned non-2xx', status: upstream.status, body: safeJsonParse(text) },
        updated_at: new Date().toISOString(),
      }).eq('request_id', requestId);
      return;
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      console.error(`${LOG_PREFIX} invalid upstream JSON`, { requestId });
      await admin.from('prediction_jobs').update({
        status: 'failed',
        error_json: { message: 'Invalid JSON from upstream', bodyPreview: text?.slice(0, 500) },
        updated_at: new Date().toISOString(),
      }).eq('request_id', requestId);
      return;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      await admin.from('prediction_jobs').update({
        status: 'failed',
        error_json: { message: 'Upstream returned non-object response' },
        updated_at: new Date().toISOString(),
      }).eq('request_id', requestId);
      return;
    }

    const resultObj = data as Record<string, unknown>;
    const analysisVersion = typeof resultObj.analysisVersion === 'string' ? resultObj.analysisVersion : null;
    const generatedAt = typeof resultObj.generatedAt === 'string' ? resultObj.generatedAt : new Date().toISOString();

    console.info(`${LOG_PREFIX} upstream_success`, {
      requestId,
      speciesKey,
      analysisVersion,
      generatedAt,
    });

    await admin.from('prediction_jobs').update({
      status: 'completed',
      result_json: resultObj,
      analysis_version: analysisVersion,
      generated_at: generatedAt,
      updated_at: new Date().toISOString(),
    }).eq('request_id', requestId);

  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const errorMessage = isAbort ? 'Prediction request timed out' : 'Prediction service upstream error';
    console.error(`${LOG_PREFIX} background_error`, { requestId, isAbort, error: String(err) });

    await admin.from('prediction_jobs').update({
      status: 'failed',
      error_json: { message: errorMessage, detail: String(err) },
      updated_at: new Date().toISOString(),
    }).eq('request_id', requestId).catch(() => {});
  } finally {
    clearTimeout(timer);
  }
}

function readWebhookUrl(): string {
  return (Deno.env.get(WEBHOOK_ENV_KEY) || '').trim();
}

function resolveTimeoutMs(): number {
  const value = Number(Deno.env.get(TIMEOUT_ENV_KEY) || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(180000, Math.max(5000, value));
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text?.slice(0, 500) || '';
  }
}
