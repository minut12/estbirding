import { supabase } from '@/integrations/supabase/client';
import {
  hasUsableSpeciesPredictionResult,
  isPredictionRequestType,
  normalizeSpeciesPredictionResult,
  resolveSpeciesPredictionSource,
  type PredictionRequestType,
  type SpeciesPredictionRequestPayload,
  type SpeciesPredictionResult,
} from '@/lib/speciesPrediction';
import {
  setSpeciesPredictionDebugBackendResponse,
  setSpeciesPredictionTransportError,
  updateSpeciesPredictionTransport,
  type SpeciesPredictionTransportError,
  type PredictionLifecycleState,
} from '@/lib/speciesPredictionDebug';
import type { SpeciesScopeId } from '@/lib/mapScope';
import { getFunctionsBaseUrl, getSupabaseAnonKey, isDeveloperModeEnabled } from '@/config/supabaseConfig';
import { safeFetchJson } from '@/lib/net';

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
  terminalState: Exclude<PredictionLifecycleState, 'idle' | 'loading'>;
  transport: PredictionTransportResult;
  jobState?: PredictionJobState;
};

export type PredictionTransportResult = {
  ok: boolean;
  status: number | null;
  data: unknown | null;
  error: string | null;
  errorObject?: unknown;
  timedOut: boolean;
  aborted: boolean;
  receivedAt: string | null;
  requestId: string;
  requestUrl: string;
  method: 'POST' | 'GET';
  invocationMethod: 'supabase.functions.invoke' | 'raw_fetch';
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

type PredictionRequestRunResult = {
  ok: boolean;
  disabled?: boolean;
  error?: string;
  stage?: string;
  result?: SpeciesPredictionResult;
  diagnostics: SpeciesPredictionRequestDiagnostics;
};

function tryRecoverNormalizedResult(
  raw: unknown,
  speciesName: string,
  scope: SpeciesScopeId,
): SpeciesPredictionResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const resolved = resolveSpeciesPredictionSource(raw as Partial<SpeciesPredictionResult>);
  if (!resolved.insightSummary) return null;
  return normalizeSpeciesPredictionResult(raw as Partial<SpeciesPredictionResult>, speciesName, scope);
}

export async function runSpeciesPredictionRequest(
  payload: SpeciesPredictionRequestPayload,
  scope: SpeciesScopeId,
  onJobUpdate?: (job: PredictionJobState) => void,
): Promise<PredictionRequestRunResult> {
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
    receivedAt: null,
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
    ok: null,
    httpStatus: null,
    responseBody: null,
    timeoutMs: POLL_TIMEOUT_MS,
    timedOut: false,
    aborted: false,
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
      return { ok: false, error: transportError.message, stage: 'validation', diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, toTransportResultFromError(transportError, 'POST', 'supabase.functions.invoke'), transportError, jobState) };
    }

    const invokeTransport = await invokePredictionTransport({
      requestUrl,
      requestId,
      body: { ...payload, scope },
    });

    applyTransportSnapshot(invokeTransport);
    console.debug('[speciesPrediction] async POST response', invokeTransport.data);

    if (invokeTransport.timedOut) {
      const transportError = createTransportError('frontend_fetch', invokeTransport.status, invokeTransport.error || 'Prediction request timed out', invokeTransport.data, requestUrl, requestId, invokeTransport.receivedAt || new Date().toISOString(), 'timeout');
      updateTransportOnError(transportError, invokeTransport.receivedAt || new Date().toISOString(), invokeTransport);
      jobState.status = 'failed';
      jobState.error = transportError.message;
      jobState.failedAt = invokeTransport.receivedAt || new Date().toISOString();
      onJobUpdate?.(jobState);
      return { ok: false, error: transportError.message, stage: transportError.stage, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, invokeTransport, transportError, jobState) };
    }

    if (invokeTransport.error) {
      const recoveredResult = tryRecoverNormalizedResult(invokeTransport.data, payload.species.name, scope);
      if (recoveredResult) {
        console.debug('[speciesPrediction] recovered usable payload despite SDK error', { path: recoveredResult.summarySourcePath });
        setSpeciesPredictionDebugBackendResponse(invokeTransport.data);
        updateSuccessTransport(invokeTransport.data, invokeTransport);
        jobState.status = 'completed';
        jobState.result = recoveredResult;
        jobState.completedAt = invokeTransport.receivedAt || new Date().toISOString();
        onJobUpdate?.(jobState);
        return { ok: true, result: recoveredResult, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...invokeTransport, ok: true, error: null }, null, jobState) };
      }
      const transportError = resolveInvokeTransportError(invokeTransport.errorObject, invokeTransport.data, requestUrl, requestId, invokeTransport.receivedAt || new Date().toISOString());
      updateTransportOnError(transportError, invokeTransport.receivedAt || new Date().toISOString(), invokeTransport);
      jobState.status = 'failed';
      jobState.error = transportError.message;
      jobState.failedAt = invokeTransport.receivedAt || new Date().toISOString();
      onJobUpdate?.(jobState);
      return { ok: false, error: transportError.message, stage: transportError.stage, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, invokeTransport, transportError, jobState) };
    }

    const data = invokeTransport.data;
    const responseTimestamp = invokeTransport.receivedAt || new Date().toISOString();

    // Check if edge returned error envelope — but try to recover usable payload first
    if (data && typeof data === 'object' && data.ok === false) {
      const recoveredResult = tryRecoverNormalizedResult(data, payload.species.name, scope);
      if (recoveredResult) {
        console.debug('[speciesPrediction] recovered usable payload from error envelope', { path: recoveredResult.summarySourcePath });
        setSpeciesPredictionDebugBackendResponse(data);
        updateSuccessTransport(data, invokeTransport);
        jobState.status = 'completed';
        jobState.result = recoveredResult;
        jobState.completedAt = responseTimestamp;
        onJobUpdate?.(jobState);
        return { ok: true, result: recoveredResult, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...invokeTransport, ok: true, error: null, status: 200 }, null, jobState) };
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
      updateTransportOnError(transportError, responseTimestamp, invokeTransport);
      jobState.status = 'failed';
      jobState.error = resolveUserMessage(msg);
      jobState.failedAt = responseTimestamp;
      onJobUpdate?.(jobState);
      return { ok: false, error: resolveUserMessage(msg), stage: String(data.stage || ''), diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...invokeTransport, status: safeNumber(data.status) }, transportError, jobState) };
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
        ok: true,
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
    const recoveredDirectResult = tryRecoverNormalizedResult(sourceResult, payload.species.name, scope);
    if (recoveredDirectResult) {
      setSpeciesPredictionDebugBackendResponse(sourceResult);
      updateSuccessTransport(sourceResult, invokeTransport);
      jobState.status = 'completed';
      jobState.result = recoveredDirectResult;
      jobState.completedAt = new Date().toISOString();
      onJobUpdate?.(jobState);
      return { ok: true, result: recoveredDirectResult, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...invokeTransport, ok: true, error: null, data: sourceResult, status: 200 }, null, jobState) };
    }
    setSpeciesPredictionDebugBackendResponse(sourceResult);
    updateSuccessTransport(sourceResult, invokeTransport);

    if (!hasUsableSpeciesPredictionResult(sourceResult)) {
      const transportError = createTransportError('parse', 200, 'Prediction service is temporarily unavailable', sourceResult, requestUrl, requestId, responseTimestamp, 'parse');
      updateTransportOnError(transportError, responseTimestamp, { ...invokeTransport, status: 200, data: sourceResult });
      jobState.status = 'failed';
      jobState.error = transportError.message;
      onJobUpdate?.(jobState);
      return { ok: false, error: transportError.message, stage: 'parse', diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...invokeTransport, status: 200, data: sourceResult }, transportError, jobState) };
    }

    const normalizedResult = normalizeSpeciesPredictionResult(sourceResult, payload.species.name, scope);
    console.debug('[speciesPrediction] direct result', { speciesKey: normalizedResult.speciesKey });
    jobState.status = 'completed';
    jobState.result = normalizedResult;
    jobState.completedAt = new Date().toISOString();
    onJobUpdate?.(jobState);
    return { ok: true, result: normalizedResult, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...invokeTransport, ok: true, error: null, status: 200, data: sourceResult }, null, jobState) };

  } catch (error: unknown) {
    const message = resolveErrorMessage(error);
    const responseTimestamp = new Date().toISOString();
    const transportError = createTransportError('frontend_fetch', null, message, null, requestUrl, requestId, responseTimestamp, resolveErrorType(error));
    const transport = toTransportResultFromError(transportError, 'POST', 'supabase.functions.invoke');
    updateTransportOnError(transportError, responseTimestamp, transport);
    setSpeciesPredictionTransportError(transportError);
    jobState.status = 'failed';
    jobState.error = message;
    jobState.failedAt = responseTimestamp;
    onJobUpdate?.(jobState);
    return { ok: false, stage: 'frontend_fetch', error: message, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, transport, transportError, jobState) };
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
): Promise<PredictionRequestRunResult> {
  const pollStart = Date.now();
  let pollCount = 0;

  while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    pollCount++;
    jobState.pollCount = pollCount;
    jobState.lastUpdatedAt = new Date().toISOString();
    onJobUpdate?.(jobState);

    try {
      const pollUrl = `${requestUrl}?mode=poll&requestId=${encodeURIComponent(requestId)}`;
      const pollTransport = await fetchPredictionTransport<PollResponse>({
        requestId,
        requestUrl: pollUrl,
        method: 'GET',
        headers: {
          apikey: getSupabaseAnonKey() || '',
          Authorization: `Bearer ${getSupabaseAnonKey() || ''}`,
        },
      });
      updateSpeciesPredictionTransport({
        responseTimestamp: pollTransport.receivedAt || '',
        receivedAt: pollTransport.receivedAt,
        invocationMethod: 'raw_fetch',
        ok: pollTransport.ok,
        httpStatus: pollTransport.status,
        responseBody: pollTransport.data,
        timedOut: pollTransport.timedOut,
        aborted: pollTransport.aborted,
        abortedByClientTimeout: pollTransport.timedOut,
        failedBeforeResponse: pollTransport.status == null,
        likelyReachedEdgeFunction: pollTransport.status != null,
      });

      if (pollTransport.timedOut) {
        break;
      }

      if (!pollTransport.ok) {
        console.warn('[speciesPrediction] poll non-2xx', { status: pollTransport.status, pollCount });
        continue;
      }

      const pollData = pollTransport.data as PollResponse;
      console.debug('[speciesPrediction] poll response', { requestId, status: pollData.status, pollCount });

      if (pollData.status === 'completed' && pollData.result) {
        const sourceResult = pollData.result;
        const recoveredCompletedResult = tryRecoverNormalizedResult(sourceResult, payload.species.name, scope);
        if (recoveredCompletedResult) {
          setSpeciesPredictionDebugBackendResponse(sourceResult);
          updateSuccessTransport(sourceResult, pollTransport);
          jobState.status = 'completed';
          jobState.result = recoveredCompletedResult;
          jobState.completedAt = new Date().toISOString();
          jobState.lastUpdatedAt = new Date().toISOString();
          onJobUpdate?.(jobState);
          const responseTimestamp = new Date().toISOString();
          return {
            ok: true,
            result: recoveredCompletedResult,
            diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...pollTransport, ok: true, error: null, data: sourceResult, status: 200 }, null, jobState),
          };
        }
        setSpeciesPredictionDebugBackendResponse(sourceResult);
        updateSuccessTransport(sourceResult, pollTransport);

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
          diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...pollTransport, ok: true, error: null, data: sourceResult, status: 200 }, null, jobState),
        };
      }

      if (pollData.status === 'failed') {
        const recoveredFromPoll = tryRecoverNormalizedResult(pollData.error, payload.species.name, scope);
        if (recoveredFromPoll) {
          console.debug('[speciesPrediction] recovered usable payload from polled error', { path: recoveredFromPoll.summarySourcePath });
          setSpeciesPredictionDebugBackendResponse(pollData.error);
          updateSuccessTransport(pollData.error, pollTransport);
          jobState.status = 'completed';
          jobState.result = recoveredFromPoll;
          jobState.completedAt = new Date().toISOString();
          jobState.lastUpdatedAt = new Date().toISOString();
          onJobUpdate?.(jobState);
          const responseTimestamp = new Date().toISOString();
          return { ok: true, result: recoveredFromPoll, diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...pollTransport, ok: true, error: null, data: pollData.error, status: 200 }, null, jobState) };
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
        updateTransportOnError(transportError, responseTimestamp, { ...pollTransport, status: transportError.httpStatus, data: pollData, error: transportError.message, errorObject: pollData.error });

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
          diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, { ...pollTransport, status: transportError.httpStatus, data: pollData, error: transportError.message, errorObject: pollData.error }, transportError, jobState),
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
  const timeoutTransport = toTransportResultFromError(transportError, 'GET', 'raw_fetch');
  updateTransportOnError(transportError, responseTimestamp, timeoutTransport);

  jobState.status = 'poll_timeout';
  jobState.error = 'Prediction request timed out waiting for results';
  jobState.failedAt = responseTimestamp;
  jobState.lastUpdatedAt = responseTimestamp;
  onJobUpdate?.(jobState);

  return {
    ok: false,
    error: 'Prediction request timed out waiting for results',
    stage: 'n8n_timeout',
    diagnostics: buildDiagnostics(requestUrl, requestTimestamp, requestId, timeoutTransport, transportError, jobState),
  };
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveTerminalState(
  transport: PredictionTransportResult,
  error: SpeciesPredictionTransportError | null,
): Exclude<PredictionLifecycleState, 'idle' | 'loading'> {
  if (transport.timedOut || error?.errorType === 'timeout' || error?.stage === 'n8n_timeout') return 'timeout';
  return error ? 'error' : 'success';
}

function resolveInvokeStatus(data: unknown, error: unknown): number | null {
  const candidate = (error && typeof error === 'object') ? error as Record<string, unknown> : {};
  const errorStatus = safeNumber(candidate.status);
  if (errorStatus != null) return errorStatus;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (record.accepted === true) return 202;
    const dataStatus = safeNumber(record.status);
    if (dataStatus != null) return dataStatus;
    return 200;
  }
  return null;
}

async function invokePredictionTransport({
  requestUrl,
  requestId,
  body,
}: {
  requestUrl: string;
  requestId: string;
  body: unknown;
}): Promise<PredictionTransportResult> {
  try {
    const outcome = await Promise.race([
      supabase.functions.invoke('species-prediction', { body }),
      new Promise<{ __timeout: true }>((resolve) => setTimeout(() => resolve({ __timeout: true }), POLL_TIMEOUT_MS)),
    ]);

    if ('__timeout' in outcome) {
      return {
        ok: false,
        status: null,
        data: null,
        error: 'Prediction request timed out',
        timedOut: true,
        aborted: false,
        receivedAt: new Date().toISOString(),
        requestId,
        requestUrl,
        method: 'POST',
        invocationMethod: 'supabase.functions.invoke',
      };
    }

    const response = outcome as Awaited<ReturnType<typeof supabase.functions.invoke>>;
    return {
      ok: !response.error,
      status: resolveInvokeStatus(response.data, response.error),
      data: response.data ?? null,
      error: response.error ? resolveErrorMessage(response.error) : null,
      errorObject: response.error ?? undefined,
      timedOut: false,
      aborted: isAbortLikeError(response.error),
      receivedAt: new Date().toISOString(),
      requestId,
      requestUrl,
      method: 'POST',
      invocationMethod: 'supabase.functions.invoke',
    };
  } catch (error) {
    return {
      ok: false,
      status: safeNumber((error as { status?: unknown } | null | undefined)?.status),
      data: null,
      error: resolveErrorMessage(error),
      errorObject: error,
      timedOut: isTimeoutLikeError(error),
      aborted: isAbortLikeError(error),
      receivedAt: new Date().toISOString(),
      requestId,
      requestUrl,
      method: 'POST',
      invocationMethod: 'supabase.functions.invoke',
    };
  }
}

async function fetchPredictionTransport<T>({
  requestId,
  requestUrl,
  method,
  headers,
}: {
  requestId: string;
  requestUrl: string;
  method: 'GET';
  headers?: Record<string, string>;
}): Promise<PredictionTransportResult> {
  try {
    const response = await safeFetchJson<T>(requestUrl, {
      method,
      headers,
      timeoutMs: POLL_INTERVAL_MS * 2,
      retries: 0,
    });
    return {
      ok: response.ok,
      status: response.status,
      data: response.json ?? null,
      error: response.ok ? null : 'Prediction poll failed',
      timedOut: false,
      aborted: false,
      receivedAt: new Date().toISOString(),
      requestId,
      requestUrl,
      method,
      invocationMethod: 'raw_fetch',
    };
  } catch (error) {
    return {
      ok: false,
      status: safeNumber((error as { status?: unknown } | null | undefined)?.status),
      data: null,
      error: resolveErrorMessage(error),
      errorObject: error,
      timedOut: isTimeoutLikeError(error),
      aborted: isAbortLikeError(error),
      receivedAt: new Date().toISOString(),
      requestId,
      requestUrl,
      method,
      invocationMethod: 'raw_fetch',
    };
  }
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

function toTransportResultFromError(
  error: SpeciesPredictionTransportError,
  method: 'POST' | 'GET',
  invocationMethod: 'supabase.functions.invoke' | 'raw_fetch',
): PredictionTransportResult {
  return {
    ok: false,
    status: error.httpStatus,
    data: error.responseBody,
    error: error.message,
    errorObject: error,
    timedOut: error.errorType === 'timeout',
    aborted: false,
    receivedAt: error.timestamp,
    requestId: error.requestId || '',
    requestUrl: error.requestUrl,
    method,
    invocationMethod,
  };
}

function applyTransportSnapshot(transport: PredictionTransportResult): void {
  updateSpeciesPredictionTransport({
    responseTimestamp: transport.receivedAt || '',
    receivedAt: transport.receivedAt,
    invocationMethod: transport.invocationMethod,
    ok: transport.ok,
    httpStatus: transport.status,
    responseBody: transport.data,
    timedOut: transport.timedOut,
    aborted: transport.aborted,
    abortedByClientTimeout: transport.timedOut,
    failedBeforeResponse: transport.status == null && !transport.data,
    likelyReachedEdgeFunction: transport.status != null || transport.data != null,
  });
}

function updateTransportOnError(error: SpeciesPredictionTransportError, responseTimestamp: string, transport?: PredictionTransportResult): void {
  updateSpeciesPredictionTransport({
    responseTimestamp,
    receivedAt: transport?.receivedAt ?? responseTimestamp,
    ok: false,
    httpStatus: error.httpStatus,
    responseBody: error.responseBody,
    failedBeforeResponse: error.httpStatus == null,
    timedOut: transport?.timedOut ?? error.errorType === 'timeout',
    aborted: transport?.aborted ?? false,
    abortedByClientTimeout: transport?.timedOut ?? error.errorType === 'timeout',
    likelyReachedEdgeFunction: isEdgeFunctionStage(error.stage),
    error,
  });
}

function updateSuccessTransport(sourceResult: unknown, transport?: PredictionTransportResult): void {
  updateSpeciesPredictionTransport({
    receivedAt: transport?.receivedAt ?? new Date().toISOString(),
    ok: true,
    httpStatus: transport?.status ?? 200,
    responseBody: sourceResult,
    failedBeforeResponse: false,
    timedOut: false,
    aborted: false,
    abortedByClientTimeout: false,
    likelyReachedEdgeFunction: true,
    error: null,
  });
  setSpeciesPredictionTransportError(null);
}

function buildDiagnostics(
  requestUrl: string,
  requestTimestamp: string,
  requestId: string,
  transport: PredictionTransportResult,
  error: SpeciesPredictionTransportError | null,
  jobState?: PredictionJobState,
): SpeciesPredictionRequestDiagnostics {
  return {
    requestUrl,
    requestTimestamp,
    responseTimestamp: transport.receivedAt || '',
    requestId,
    httpStatus: transport.status,
    responseBody: transport.data,
    error,
    terminalState: deriveTerminalState(transport, error),
    transport,
    jobState,
  };
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

function isTimeoutLikeError(error: unknown): boolean {
  const message = resolveErrorMessage(error).toLowerCase();
  return message.includes('timed out') || message.includes('timeout');
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; message?: string };
  return candidate.name === 'AbortError' || String(candidate.message || '').toLowerCase().includes('abort');
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
