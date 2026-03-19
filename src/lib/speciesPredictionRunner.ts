import { supabase } from '@/integrations/supabase/client';
import {
  extractUsablePayloadFromErrorEnvelope,
  hasUsableSpeciesPredictionResult,
  isPredictionRequestType,
  normalizeSpeciesPredictionResult,
  type PredictionRequestType,
  type SpeciesPredictionRequestPayload,
  type SpeciesPredictionResult,
} from '@/lib/speciesPrediction';
import {
  setSpeciesPredictionDebugBackendResponse,
  setSpeciesPredictionTransportError,
  updateSpeciesPredictionTransport,
  type SpeciesPredictionTransportError,
} from '@/lib/speciesPredictionDebug';
import type { SpeciesScopeId } from '@/lib/mapScope';
import { getFunctionsBaseUrl, getSupabaseAnonKey, isDeveloperModeEnabled } from '@/config/supabaseConfig';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 180000;

export type PredictionJobState = {
  requestId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'polling' | 'poll_timeout';
  speciesKey: string;
  speciesName: string;
  scope: SpeciesScopeId;
  startedAt: string;
  lastUpdatedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  failedAt?: string;
  pollCount: number;
  result?: SpeciesPredictionResult;
  error?: string;
  errorJson?: unknown;
};

export type SpeciesPredictionRequestDiagnostics = {
  requestUrl: string;
  requestTimestamp: string;
  responseTimestamp: string;
  requestId: string;
  httpStatus: number | null;
  responseBody: unknown;
  error: SpeciesPredictionTransportError | null;
  jobState?: PredictionJobState;
};

type PollResponse = {
  ok: boolean;
  requestId?: string;
  status?: string;
  result?: unknown;
  error?: unknown;
  speciesKey?: string;
  speciesName?: string;
  updatedAt?: string;
  generatedAt?: string;
  analysisVersion?: string;
  message?: string;
};

export async function runSpeciesPredictionRequest(
  payload: SpeciesPredictionRequestPayload,
  scope: SpeciesScopeId,
  onJobUpdate?: (job: PredictionJobState) => void,
): Promise<{ ok: boolean; disabled?: boolean; error?: string; stage?: string; result?: SpeciesPredictionResult; diagnostics: SpeciesPredictionRequestDiagnostics }> {
  const requestTimestamp = new Date().toISOString();
  const requestId = `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestUrl = `${getFunctionsBaseUrl()}/species-prediction`;
  const anonKeyPresent = Boolean(getSupabaseAnonKey());
  const session = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const authSessionPresent = Boolean(session.data.session);

  const jobState: PredictionJobState = {
    requestId,
    status: 'running',
    speciesKey: payload.species.key,
    speciesName: payload.species.name,
    scope,
    startedAt: requestTimestamp,
    lastUpdatedAt: requestTimestamp,
    pollCount: 0,
  };

  updateSpeciesPredictionTransport({
    requestUrl,
    requestTimestamp,
    responseTimestamp: '',
    requestId,
    invocationMethod: 'supabase.functions.invoke',
    authSessionPresent,
    anonKeyPresent,
    intendedHeaders: {
      apikey: anonKeyPresent,
      authorization: anonKeyPresent || authSessionPresent,
      contentType: 'application/json',
    },
    failedBeforeResponse: false,
    httpStatus: null,
    responseBody: null,
    timeoutMs: POLL_TIMEOUT_MS,
    abortedByClientTimeout: false,
    likelyReachedEdgeFunction: false,
    error: null,
  });

  onJobUpdate?.(jobState);

  try {
    if (!isPredictionRequestType(payload.requestType)) {
      const responseTimestamp = new Date().toISOString();
      const transportError = createTransportError('validation', null, 'Prediction request type is invalid', null, requestUrl, requestId, responseTimestamp, 'unknown');
      updateTransportOnError(transportError, responseTimestamp);
      jobState.status = 'failed';
      jobState.error = transportError.message;
      jobState.failedAt = responseTimestamp;
      onJobUpdate?.(jobState);
      return { ok: false, error: transportError.message, stage: 'validation', diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, null, null, transportError, jobState) };
    }

    // Step 1: Send async POST to edge function
    const { data, error } = await supabase.functions.invoke('species-prediction', {
      body: { ...payload, scope },
    });

    const responseTimestamp = new Date().toISOString();
    updateSpeciesPredictionTransport({ responseTimestamp, responseBody: data ?? null });
    console.debug('[speciesPrediction] async POST response', data);

    if (error) {
      const transportError = resolveInvokeTransportError(error, data, requestUrl, requestId, responseTimestamp);
      updateTransportOnError(transportError, responseTimestamp);
      jobState.status = 'failed';
      jobState.error = transportError.message;
      jobState.failedAt = responseTimestamp;
      onJobUpdate?.(jobState);
      return { ok: false, error: transportError.message, stage: transportError.stage, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, null, data, transportError, jobState) };
    }

    // Check if edge returned error envelope — but try to recover usable payload first
    if (data && typeof data === 'object' && data.ok === false) {
      const recovered = extractUsablePayloadFromErrorEnvelope(data as Record<string, unknown>);
      if (recovered) {
        console.debug('[speciesPrediction] recovered usable payload from error envelope', { path: recovered.summarySourcePath });
        setSpeciesPredictionDebugBackendResponse(data);
        updateSuccessTransport(data);
        const normalizedResult = normalizeSpeciesPredictionResult(
          recovered.source as Partial<SpeciesPredictionResult>,
          payload.species.name,
          scope,
        );
        normalizedResult.recoveredFromErrorEnvelope = true;
        normalizedResult.summarySourcePath = recovered.summarySourcePath;
        normalizedResult.normalizedPredictionShape = 'nested-aiSummary-error-envelope';
        jobState.status = 'completed';
        jobState.result = normalizedResult;
        jobState.completedAt = responseTimestamp;
        onJobUpdate?.(jobState);
        return { ok: true, result: normalizedResult, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, 200, data, null, jobState) };
      }

      const msg = String(data.message || 'Prediction request failed');
      const transportError = createTransportError(
        mapStage(data.stage),
        safeNumber(data.status),
        resolveUserMessage(msg),
        data,
        requestUrl,
        requestId,
        responseTimestamp,
        'server',
        extractBackendErrorDetails(data),
      );
      updateTransportOnError(transportError, responseTimestamp);
      jobState.status = 'failed';
      jobState.error = resolveUserMessage(msg);
      jobState.failedAt = responseTimestamp;
      onJobUpdate?.(jobState);
      return { ok: false, error: resolveUserMessage(msg), stage: String(data.stage || ''), diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, safeNumber(data.status), data, transportError, jobState) };
    }

    // Check if edge returned accepted (async mode)
    if (data && typeof data === 'object' && data.accepted === true && data.requestId) {
      const serverRequestId = String(data.requestId);
      jobState.requestId = serverRequestId;
      jobState.status = 'running';
      jobState.acceptedAt = responseTimestamp;
      jobState.lastUpdatedAt = responseTimestamp;
      onJobUpdate?.(jobState);

      updateSpeciesPredictionTransport({
        httpStatus: 202,
        failedBeforeResponse: false,
        likelyReachedEdgeFunction: true,
        error: null,
      });
      setSpeciesPredictionTransportError(null);

      console.debug('[speciesPrediction] job accepted, starting poll', { requestId: serverRequestId });

      // Step 2: Poll for result
      return await pollForResult(serverRequestId, payload, scope, requestUrl, requestTimestamp, jobState, onJobUpdate);
    }

    // Fallback: edge returned a direct result (fast path)
    const sourceResult = (data && typeof data === 'object' && 'result' in data) ? data.result : data;
    setSpeciesPredictionDebugBackendResponse(sourceResult);
    updateSuccessTransport(sourceResult);

    if (!hasUsableSpeciesPredictionResult(sourceResult)) {
      const transportError = createTransportError('parse', 200, 'Prediction service is temporarily unavailable', sourceResult, requestUrl, requestId, responseTimestamp, 'parse');
      updateTransportOnError(transportError, responseTimestamp);
      jobState.status = 'failed';
      jobState.error = transportError.message;
      onJobUpdate?.(jobState);
      return { ok: false, error: transportError.message, stage: 'parse', diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, 200, sourceResult, transportError, jobState) };
    }

    const normalizedResult = normalizeSpeciesPredictionResult(sourceResult, payload.species.name, scope);
    console.debug('[speciesPrediction] direct result', { speciesKey: normalizedResult.speciesKey });
    jobState.status = 'completed';
    jobState.result = normalizedResult;
    jobState.completedAt = new Date().toISOString();
    onJobUpdate?.(jobState);
    return { ok: true, result: normalizedResult, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, 200, sourceResult, null, jobState) };

  } catch (error: unknown) {
    const message = resolveErrorMessage(error);
    const responseTimestamp = new Date().toISOString();
    const transportError = createTransportError('frontend_fetch', null, message, null, requestUrl, requestId, responseTimestamp, resolveErrorType(error));
    updateTransportOnError(transportError, responseTimestamp);
    setSpeciesPredictionTransportError(transportError);
    jobState.status = 'failed';
    jobState.error = message;
    jobState.failedAt = responseTimestamp;
    onJobUpdate?.(jobState);
    return { ok: false, stage: 'frontend_fetch', error: message, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, null, null, transportError, jobState) };
  }
}

// ── Polling logic ──

async function pollForResult(
  requestId: string,
  payload: SpeciesPredictionRequestPayload,
  scope: SpeciesScopeId,
  requestUrl: string,
  requestTimestamp: string,
  jobState: PredictionJobState,
  onJobUpdate?: (job: PredictionJobState) => void,
): Promise<{ ok: boolean; error?: string; stage?: string; result?: SpeciesPredictionResult; diagnostics: SpeciesPredictionRequestDiagnostics }> {
  const pollStart = Date.now();
  let pollCount = 0;

  while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    pollCount++;
    jobState.pollCount = pollCount;
    jobState.lastUpdatedAt = new Date().toISOString();
    onJobUpdate?.(jobState);

    try {
      const { data, error } = await supabase.functions.invoke('species-prediction', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: undefined,
      });

      // supabase.functions.invoke doesn't support query params well, use direct fetch
      const pollUrl = `${requestUrl}?mode=poll&requestId=${encodeURIComponent(requestId)}`;
      const pollResp = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''}`,
        },
      });

      if (!pollResp.ok) {
        console.warn('[speciesPrediction] poll non-2xx', { status: pollResp.status, pollCount });
        continue; // retry
      }

      const pollData = await pollResp.json() as PollResponse;
      console.debug('[speciesPrediction] poll response', { requestId, status: pollData.status, pollCount });

      if (pollData.status === 'completed' && pollData.result) {
        const sourceResult = pollData.result;
        setSpeciesPredictionDebugBackendResponse(sourceResult);
        updateSuccessTransport(sourceResult);

        const normalizedResult = normalizeSpeciesPredictionResult(
          sourceResult as Partial<SpeciesPredictionResult>,
          payload.species.name,
          scope,
        );

        jobState.status = 'completed';
        jobState.result = normalizedResult;
        jobState.completedAt = new Date().toISOString();
        jobState.lastUpdatedAt = new Date().toISOString();
        onJobUpdate?.(jobState);

        const responseTimestamp = new Date().toISOString();
        return {
          ok: true,
          result: normalizedResult,
          diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, 200, sourceResult, null, jobState),
        };
      }

      if (pollData.status === 'failed') {
        // Try to recover usable payload from error
        const errorRecord = (pollData.error && typeof pollData.error === 'object') ? pollData.error as Record<string, unknown> : null;
        const recoveredFromPoll = errorRecord ? extractUsablePayloadFromErrorEnvelope(errorRecord) : null;
        if (recoveredFromPoll) {
          console.debug('[speciesPrediction] recovered usable payload from polled error', { path: recoveredFromPoll.summarySourcePath });
          setSpeciesPredictionDebugBackendResponse(pollData.error);
          updateSuccessTransport(pollData.error);
          const normalizedResult = normalizeSpeciesPredictionResult(
            recoveredFromPoll.source as Partial<SpeciesPredictionResult>,
            payload.species.name,
            scope,
          );
          normalizedResult.recoveredFromErrorEnvelope = true;
          normalizedResult.summarySourcePath = recoveredFromPoll.summarySourcePath;
          normalizedResult.normalizedPredictionShape = 'nested-aiSummary-error-envelope';
          jobState.status = 'completed';
          jobState.result = normalizedResult;
          jobState.completedAt = new Date().toISOString();
          jobState.lastUpdatedAt = new Date().toISOString();
          onJobUpdate?.(jobState);
          const responseTimestamp = new Date().toISOString();
          return { ok: true, result: normalizedResult, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, 200, pollData.error, null, jobState) };
        }

        const errorDetails = extractBackendErrorDetails(pollData.error);
        const errorMsg = errorDetails.message || (typeof pollData.error === 'string' ? pollData.error : 'Prediction failed');
        const responseTimestamp = new Date().toISOString();
        const transportError = createTransportError(
          mapStage((pollData.error as Record<string, unknown> | null | undefined)?.stage),
          errorDetails.upstreamStatus ?? null,
          resolveUserMessage(errorMsg),
          pollData.error,
          requestUrl,
          requestId,
          responseTimestamp,
          'server',
          errorDetails,
        );
        updateTransportOnError(transportError, responseTimestamp);

        jobState.status = 'failed';
        jobState.error = transportError.message;
        jobState.errorJson = pollData.error;
        jobState.failedAt = responseTimestamp;
        jobState.lastUpdatedAt = responseTimestamp;
        onJobUpdate?.(jobState);

        return {
          ok: false,
          error: transportError.message,
          stage: transportError.stage,
          diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, transportError.httpStatus, pollData, transportError, jobState),
        };
      }

      // Still running, continue polling
    } catch (pollError) {
      console.warn('[speciesPrediction] poll error', { requestId, pollCount, error: String(pollError) });
      // Continue polling on transient errors
    }
  }

  // Poll timeout
  const responseTimestamp = new Date().toISOString();
  const transportError = createTransportError('n8n_timeout', null, 'Prediction request timed out waiting for results', null, requestUrl, requestId, responseTimestamp, 'timeout');
  updateTransportOnError(transportError, responseTimestamp);

  jobState.status = 'poll_timeout';
  jobState.error = 'Prediction request timed out waiting for results';
  jobState.failedAt = responseTimestamp;
  jobState.lastUpdatedAt = responseTimestamp;
  onJobUpdate?.(jobState);

  return {
    ok: false,
    error: 'Prediction request timed out waiting for results',
    stage: 'n8n_timeout',
    diagnostics: buildDiagnostics(requestUrl, requestTimestamp, responseTimestamp, requestId, null, null, transportError, jobState),
  };
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTransportError(
  stage: SpeciesPredictionTransportError['stage'],
  httpStatus: number | null,
  message: string,
  responseBody: unknown,
  requestUrl: string,
  requestId: string,
  timestamp: string,
  errorType: SpeciesPredictionTransportError['errorType'],
  extra: Partial<SpeciesPredictionTransportError> = {},
): SpeciesPredictionTransportError {
  return { ...extra, stage, httpStatus, message, responseBody, requestUrl, requestId, timestamp, errorType };
}

function updateTransportOnError(error: SpeciesPredictionTransportError, responseTimestamp: string): void {
  updateSpeciesPredictionTransport({
    responseTimestamp,
    httpStatus: error.httpStatus,
    responseBody: error.responseBody,
    failedBeforeResponse: error.httpStatus == null,
    likelyReachedEdgeFunction: isEdgeFunctionStage(error.stage),
    error,
  });
}

function updateSuccessTransport(sourceResult: unknown): void {
  updateSpeciesPredictionTransport({
    httpStatus: 200,
    responseBody: sourceResult,
    failedBeforeResponse: false,
    abortedByClientTimeout: false,
    likelyReachedEdgeFunction: true,
    error: null,
  });
  setSpeciesPredictionTransportError(null);
}

function buildDiagnostics(
  requestUrl: string,
  requestTimestamp: string,
  responseTimestamp: string,
  requestId: string,
  httpStatus: number | null,
  responseBody: unknown,
  error: SpeciesPredictionTransportError | null,
  jobState?: PredictionJobState,
): SpeciesPredictionRequestDiagnostics {
  return { requestUrl, requestTimestamp, responseTimestamp, requestId, httpStatus, responseBody, error, jobState };
}

function extractBackendErrorDetails(input: unknown): Partial<SpeciesPredictionTransportError> & { message?: string; upstreamStatus?: number | null } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  return {
    code: typeof record.code === 'string' ? record.code : null,
    message: typeof record.message === 'string' ? record.message : undefined,
    upstreamStatus: safeNumber(record.upstreamStatus),
    upstreamMessage: typeof record.upstreamMessage === 'string' ? record.upstreamMessage : null,
    resolvedWebhookUrl: typeof record.resolvedWebhookUrl === 'string' ? record.resolvedWebhookUrl : null,
    resolvedWebhookPath: typeof record.resolvedWebhookPath === 'string' ? record.resolvedWebhookPath : null,
    productionWebhookInactive: record.productionWebhookInactive === true,
  };
}

function resolveInvokeTransportError(
  error: unknown,
  data: unknown,
  requestUrl: string,
  requestId: string,
  responseTimestamp: string,
): SpeciesPredictionTransportError {
  const message = resolveErrorMessage(error);
  const candidate = (error && typeof error === 'object') ? error as Record<string, unknown> : {};
  const status = safeNumber(candidate.status) ?? null;
  return createTransportError('frontend_fetch', status, message, data, requestUrl, requestId, responseTimestamp, resolveErrorType(error));
}

function resolveErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const c = error as { message?: string; context?: unknown; error?: string };
    const msg = c.message || extractContextMessage(c.context) || c.error || '';
    if (msg) return resolveUserMessage(msg);
  }
  if (error instanceof Error) return resolveUserMessage(error.message);
  return 'Prediction service is temporarily unavailable';
}

function extractContextMessage(context: unknown): string {
  if (!context || typeof context !== 'object') return '';
  const c = context as { json?: unknown; body?: unknown; message?: string };
  const inner = (c.json || c.body) as Record<string, unknown> | undefined;
  if (inner && typeof inner === 'object' && typeof inner.message === 'string') return inner.message;
  return c.message || '';
}

function resolveUserMessage(message: string): string {
  const n = String(message || '').trim().toLowerCase();
  if (!n) return 'Prediction service is temporarily unavailable';
  if (n.includes('species-prediction') && n.includes('not registered')) {
    return 'The Supabase prediction function is still pointing to an outdated n8n webhook path.';
  }
  if (n.includes('workflow must be active')) {
    return 'Prediction backend is configured, but the n8n production webhook is not active or not registered.';
  }
  if (n.includes('not configured')) return 'Prediction backend is not configured yet';
  if (n.includes('timed out') || n.includes('timeout')) return 'Prediction request timed out';
  if (n.includes('temporarily unavailable') || n.includes('internal server error') || n.includes('bad gateway') || n.includes('error in workflow')) return 'Prediction service is temporarily unavailable';
  if (n.includes('non-2xx') || n.includes('fetch failed') || n.includes('failed to fetch') || n.includes('load failed') || n.includes('networkerror')) return 'Prediction service is temporarily unavailable';
  return message;
}

function resolveErrorType(error: unknown): SpeciesPredictionTransportError['errorType'] {
  const msg = resolveErrorMessage(error).toLowerCase();
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('fetch') || msg.includes('network')) return 'network';
  return 'unknown';
}

function mapStage(stage: unknown): SpeciesPredictionTransportError['stage'] {
  const s = String(stage || '').trim();
  const valid: SpeciesPredictionTransportError['stage'][] = [
    'frontend_fetch', 'edge_function', 'n8n_upstream', 'n8n_timeout', 'n8n_non_2xx',
    'invalid_upstream_json', 'missing_webhook_url', 'parse', 'validation', 'status',
  ];
  if (valid.includes(s as SpeciesPredictionTransportError['stage'])) return s as SpeciesPredictionTransportError['stage'];
  return 'unknown';
}

function isEdgeFunctionStage(stage: string): boolean {
  return ['edge_function', 'n8n_upstream', 'n8n_timeout', 'n8n_non_2xx', 'invalid_upstream_json', 'missing_webhook_url', 'parse', 'validation', 'status'].includes(stage);
}

function safeNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolvePredictionRequestType(enablePrediction: boolean, enableResearchInsights: boolean): PredictionRequestType {
  if (enablePrediction && enableResearchInsights) return 'prediction_and_insight';
  if (enableResearchInsights) return 'insight';
  return 'prediction';
}
