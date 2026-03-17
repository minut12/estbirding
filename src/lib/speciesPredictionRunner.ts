import { supabase } from '@/integrations/supabase/client';
import {
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

const SPECIES_PREDICTION_TIMEOUT_MS = 120000;

export type SpeciesPredictionRequestDiagnostics = {
  requestUrl: string;
  requestTimestamp: string;
  responseTimestamp: string;
  requestId: string;
  httpStatus: number | null;
  responseBody: unknown;
  error: SpeciesPredictionTransportError | null;
};

export async function runSpeciesPredictionRequest(
  payload: SpeciesPredictionRequestPayload,
  scope: SpeciesScopeId,
): Promise<{ ok: boolean; disabled?: boolean; error?: string; stage?: string; result?: SpeciesPredictionResult; diagnostics: SpeciesPredictionRequestDiagnostics }> {
  const requestTimestamp = new Date().toISOString();
  const requestId = `species-prediction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestUrl = `${getFunctionsBaseUrl()}/species-prediction`;
  const anonKeyPresent = Boolean(getSupabaseAnonKey());
  const session = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const authSessionPresent = Boolean(session.data.session);
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
    timeoutMs: SPECIES_PREDICTION_TIMEOUT_MS,
    abortedByClientTimeout: false,
    likelyReachedEdgeFunction: false,
    error: null,
  });
  try {
    if (!isPredictionRequestType(payload.requestType)) {
      const responseTimestamp = new Date().toISOString();
      const transportError = createTransportError({
        stage: 'validation',
        httpStatus: null,
        message: 'Prediction request type is invalid',
        responseBody: null,
        requestUrl,
        requestId,
        timestamp: responseTimestamp,
        errorType: 'unknown',
      });
      updateSpeciesPredictionTransport({
        responseTimestamp,
        failedBeforeResponse: true,
        timeoutMs: SPECIES_PREDICTION_TIMEOUT_MS,
        error: transportError,
      });
      return {
        ok: false,
        error: 'Prediction request type is invalid',
        stage: 'validation',
        diagnostics: buildDiagnostics({
          requestUrl,
          requestTimestamp,
          responseTimestamp,
          requestId,
          httpStatus: null,
          responseBody: null,
          error: transportError,
        }),
      };
    }
    const { data, error } = await supabase.functions.invoke('species-prediction', {
      body: payload,
    });
    const responseTimestamp = new Date().toISOString();
    updateSpeciesPredictionTransport({
      responseTimestamp,
      responseBody: data ?? null,
    });
    console.debug('[speciesPrediction] raw backend response', summarizePredictionPayload(data, payload.species.key));
    if (error) {
      throw createInvokeError(error, {
        requestUrl,
        requestTimestamp,
        responseTimestamp,
        requestId,
        responseBody: data ?? null,
      });
    }
    if (isErrorEnvelope(data)) {
      const transportError = createTransportError({
        stage: mapErrorStage(data.stage),
        httpStatus: readNumber((data as Record<string, unknown>).status) ?? null,
        message: String(data.message || data.error || 'Prediction request failed'),
        responseBody: data,
        requestUrl,
        requestId,
        timestamp: responseTimestamp,
        errorType: 'server',
      });
      updateSpeciesPredictionTransport({
        httpStatus: transportError.httpStatus,
        responseBody: data,
        failedBeforeResponse: false,
        timeoutMs: readTimeoutMs(data) ?? SPECIES_PREDICTION_TIMEOUT_MS,
        abortedByClientTimeout: false,
        likelyReachedEdgeFunction: reachedEdgeFunction(transportError.stage),
        error: transportError,
      });
      return {
        ok: false,
        ...(data.disabled ? { disabled: true } : {}),
        ...(typeof data.stage === 'string' ? { stage: data.stage } : {}),
        error: resolveUserFacingBackendMessage(String(data.message || data.error || 'Prediction request failed')),
        diagnostics: buildDiagnostics({
          requestUrl,
          requestTimestamp,
          responseTimestamp,
          requestId,
          httpStatus: transportError.httpStatus,
          responseBody: data,
          error: transportError,
        }),
      };
    }
    const sourceResult = isWrappedSuccessEnvelope(data) ? data.result : data;
    setSpeciesPredictionDebugBackendResponse(sourceResult);
    updateSpeciesPredictionTransport({
      httpStatus: 200,
      responseBody: sourceResult,
      failedBeforeResponse: false,
      timeoutMs: SPECIES_PREDICTION_TIMEOUT_MS,
      abortedByClientTimeout: false,
      likelyReachedEdgeFunction: true,
      error: null,
    });
    setSpeciesPredictionTransportError(null);
    console.debug('[speciesPrediction] compare raw backend', comparePredictionFields(sourceResult, payload.species.key));
    if (isDeveloperModeEnabled()) {
      console.debug('[SpeciesPredictionDebug] backend', comparePredictionFields(sourceResult, payload.species.key));
    }
    if (!hasUsableSpeciesPredictionResult(sourceResult)) {
      const transportError = createTransportError({
        stage: 'parse',
        httpStatus: 200,
        message: 'Prediction service is temporarily unavailable',
        responseBody: sourceResult,
        requestUrl,
        requestId,
        timestamp: responseTimestamp,
        errorType: 'parse',
      });
      updateSpeciesPredictionTransport({
        httpStatus: 200,
        responseBody: sourceResult,
        failedBeforeResponse: false,
        timeoutMs: SPECIES_PREDICTION_TIMEOUT_MS,
        abortedByClientTimeout: false,
        likelyReachedEdgeFunction: true,
        error: transportError,
      });
      return {
        ok: false,
        error: 'Prediction service is temporarily unavailable',
        stage: 'parse',
        diagnostics: buildDiagnostics({
          requestUrl,
          requestTimestamp,
          responseTimestamp,
          requestId,
          httpStatus: 200,
          responseBody: sourceResult,
          error: transportError,
        }),
      };
    }
    return {
      ok: true,
      result: logNormalizedPredictionResult(
        normalizeSpeciesPredictionResult(sourceResult, payload.species.name, scope),
      ),
      diagnostics: buildDiagnostics({
        requestUrl,
        requestTimestamp,
        responseTimestamp,
        requestId,
        httpStatus: 200,
        responseBody: sourceResult,
        error: null,
      }),
    };
  } catch (error: unknown) {
    const message = resolvePredictionErrorMessage(error);
    const diagnostics = resolveRequestDiagnostics(error, requestUrl, requestTimestamp, requestId);
    updateSpeciesPredictionTransport({
      requestUrl: diagnostics.requestUrl,
      requestTimestamp: diagnostics.requestTimestamp,
      responseTimestamp: diagnostics.responseTimestamp,
      requestId: diagnostics.requestId,
      invocationMethod: 'supabase.functions.invoke',
      authSessionPresent,
      anonKeyPresent,
      intendedHeaders: {
        apikey: anonKeyPresent,
        authorization: anonKeyPresent || authSessionPresent,
        contentType: 'application/json',
      },
      failedBeforeResponse: diagnostics.httpStatus == null && isFailureBeforeResponse(diagnostics.responseBody),
      httpStatus: diagnostics.httpStatus,
      responseBody: diagnostics.responseBody,
      timeoutMs: readTimeoutMs(diagnostics.responseBody) ?? SPECIES_PREDICTION_TIMEOUT_MS,
      abortedByClientTimeout: diagnostics.error?.stage === 'frontend_fetch' && diagnostics.error?.errorType === 'timeout',
      likelyReachedEdgeFunction: reachedEdgeFunction(diagnostics.error?.stage),
      error: diagnostics.error,
    });
    setSpeciesPredictionTransportError(diagnostics.error);
    return {
      ok: false,
      stage: resolvePredictionErrorStage(error),
      error: message,
      diagnostics,
    };
  }
}

function logNormalizedPredictionResult(result: SpeciesPredictionResult): SpeciesPredictionResult {
  console.debug('[speciesPrediction] normalized response', summarizePredictionResult(result));
  console.debug('[speciesPrediction] compare normalized response', comparePredictionFields(result, result.speciesKey));
  return result;
}

function summarizePredictionPayload(data: unknown, speciesKey: string) {
  const candidate = (data && typeof data === 'object' && !Array.isArray(data)) ? data as Record<string, unknown> : {};
  const result = isWrappedSuccessEnvelope(data)
    ? candidate.result
    : candidate;
  const record = (result && typeof result === 'object' && !Array.isArray(result)) ? result as Record<string, unknown> : {};
  const points = Array.isArray(record.topPredictedPoints) ? record.topPredictedPoints : [];
  const countryScores = (record.countryScores && typeof record.countryScores === 'object' && !Array.isArray(record.countryScores))
    ? record.countryScores as Record<string, unknown>
    : null;
  return {
    speciesKey,
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : null,
    analysisVersion: typeof record.analysisVersion === 'string' ? record.analysisVersion : null,
    insightSummary: typeof record.insightSummary === 'string' ? record.insightSummary.slice(0, 140) : '',
    externalPressureScore: typeof record.externalPressureScore === 'number' ? record.externalPressureScore : record.externalPressureScore ?? null,
    springFitScore: typeof record.springFitScore === 'number' ? record.springFitScore : record.springFitScore ?? null,
    windSupportScore: typeof record.windSupportScore === 'number' ? record.windSupportScore : record.windSupportScore ?? null,
    countryScores: countryScores ? {
      latvia: countryScores.latvia ?? null,
      lithuania: countryScores.lithuania ?? null,
      belarus: countryScores.belarus ?? null,
      poland: countryScores.poland ?? null,
      russia: countryScores.russia ?? null,
      finlandContextOnly: countryScores.finlandContextOnly ?? null,
    } : null,
    topPredictedPoints: points.slice(0, 3).map(summarizePoint),
  };
}

function summarizePredictionResult(result: SpeciesPredictionResult) {
  return {
    speciesKey: result.speciesKey,
    generatedAt: result.generatedAt,
    analysisVersion: result.analysisVersion || null,
    insightSummary: String(result.insightSummary || '').slice(0, 140),
    externalPressureScore: result.externalPressureScore,
    springFitScore: result.springFitScore,
    windSupportScore: result.windSupportScore,
    countryScores: result.countryScores,
    topPredictedPointCount: Array.isArray(result.topPredictedPoints) ? result.topPredictedPoints.length : 0,
    topPredictedPoints: result.topPredictedPoints.slice(0, 3).map((point) => ({
      rank: point.rank,
      name: point.name,
      confidence: point.confidence,
      reason: point.reason,
    })),
  };
}

function summarizePoint(point: unknown) {
  const record = (point && typeof point === 'object' && !Array.isArray(point)) ? point as Record<string, unknown> : {};
  return {
    rank: typeof record.rank === 'number' ? record.rank : null,
    name: typeof record.name === 'string' ? record.name : '',
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    eta: typeof record.eta === 'string' ? record.eta : '',
    reason: typeof record.reason === 'string' ? record.reason : '',
  };
}

function comparePredictionFields(value: unknown, speciesKey: string) {
  const record = (value && typeof value === 'object' && !Array.isArray(value)) ? value as Record<string, unknown> : {};
  const countryScores = (record.countryScores && typeof record.countryScores === 'object' && !Array.isArray(record.countryScores))
    ? record.countryScores as Record<string, unknown>
    : ((record.countryScoreMap && typeof record.countryScoreMap === 'object' && !Array.isArray(record.countryScoreMap))
      ? record.countryScoreMap as Record<string, unknown>
      : {});
  const points = Array.isArray(record.topPredictedPoints)
    ? record.topPredictedPoints
    : (Array.isArray(record.points)
      ? record.points
      : (Array.isArray(record.candidates) ? record.candidates : []));
  const firstPoint = (points[0] && typeof points[0] === 'object' && !Array.isArray(points[0])) ? points[0] as Record<string, unknown> : {};
  return {
    speciesKey,
    insightSummary: typeof record.insightSummary === 'string'
      ? record.insightSummary
      : (typeof record.summary === 'string' ? record.summary : null),
    externalPressureScore: record.externalPressureScore ?? record.pressureScore ?? null,
    lithuania: countryScores.lithuania ?? null,
    topPredictedPointReason: typeof firstPoint.reason === 'string' ? firstPoint.reason : null,
  };
}

export function resolvePredictionRequestType(enablePrediction: boolean, enableResearchInsights: boolean): PredictionRequestType {
  if (enablePrediction && enableResearchInsights) return 'prediction_and_insight';
  if (enableResearchInsights) return 'insight';
  return 'prediction';
}

function resolvePredictionErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: unknown;
      context?: unknown;
      status?: unknown;
      statusText?: unknown;
      response?: unknown;
      error?: unknown;
      details?: unknown;
    };
    const status = Number(candidate.status);
    const message = typeof candidate.message === 'string' ? candidate.message : '';
    const context = typeof candidate.context === 'string' ? candidate.context : '';
    const statusText = typeof candidate.statusText === 'string' ? candidate.statusText : '';
    const details = typeof candidate.details === 'string' ? candidate.details : '';
    const contextMessage = extractContextMessage(candidate.context);
    const responseMessage = extractResponseMessage(candidate.response);
    const nestedError = typeof candidate.error === 'string' ? candidate.error : '';
    const resolvedMessage = contextMessage || responseMessage || message || nestedError || details || context || statusText;
    const stage = mapErrorStage(resolvePredictionErrorStage(error));

    if (status === 404 || resolvedMessage.includes('404')) {
      return 'Prediction backend is unavailable or not deployed';
    }
    if (status === 503) {
      return 'Prediction backend is not configured yet';
    }
    if (stage === 'n8n_timeout' || resolvedMessage.toLowerCase().includes('timed out')) {
      return 'Prediction request timed out';
    }
    if (status >= 500 && resolvedMessage) {
      return resolveUserFacingBackendMessage(resolvedMessage);
    }
    if (status >= 500) return 'Prediction service is temporarily unavailable';
    if (resolvedMessage) return resolveUserFacingBackendMessage(resolvedMessage);
  }
  if (error instanceof Error) {
    return resolveUserFacingBackendMessage(error.message);
  }
  return 'Prediction service is temporarily unavailable';
}

function buildDiagnostics(input: SpeciesPredictionRequestDiagnostics): SpeciesPredictionRequestDiagnostics {
  return input;
}

type ErrorEnvelope = {
  ok?: boolean;
  error?: unknown;
  message?: unknown;
  disabled?: unknown;
  stage?: unknown;
};

type WrappedSuccessEnvelope = {
  result?: unknown;
};

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as ErrorEnvelope).ok === false,
  );
}

function isWrappedSuccessEnvelope(value: unknown): value is WrappedSuccessEnvelope {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'result' in (value as WrappedSuccessEnvelope),
  );
}

function resolveUserFacingBackendMessage(message: string): string {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return 'Prediction service is temporarily unavailable';
  if (normalized.includes('missing required species information') || normalized.includes('missing species information')) {
    return 'Missing species information for prediction';
  }
  if (normalized.includes('invalid response')) {
    return 'Prediction backend returned an invalid response';
  }
  if (normalized.includes('not configured')) {
    return 'Prediction backend is not configured yet';
  }
  if (
    normalized.includes('temporarily unavailable')
    || normalized.includes('error in workflow')
    || normalized.includes('internal server error')
    || normalized.includes('bad gateway')
  ) {
    return 'Prediction service is temporarily unavailable';
  }
  if (
    normalized.includes('non-2xx status code')
    || normalized.includes('edge function returned')
    || normalized.includes('fetch failed')
    || normalized.includes('failed to fetch')
    || normalized.includes('networkerror')
    || normalized.includes('network request failed')
    || normalized.includes('load failed')
  ) {
    return 'Prediction service is temporarily unavailable';
  }
  return message;
}

function extractResponseMessage(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  const candidate = response as { message?: unknown; error?: unknown; details?: unknown };
  if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message.trim();
  if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error.trim();
  if (typeof candidate.details === 'string' && candidate.details.trim()) return candidate.details.trim();
  return '';
}

function resolvePredictionErrorStage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { stage?: unknown; context?: unknown; response?: unknown };
  if (typeof candidate.stage === 'string' && candidate.stage.trim()) return candidate.stage.trim();
  const contextStage = extractStage(candidate.context);
  if (contextStage) return contextStage;
  const responseStage = extractStage(candidate.response);
  if (responseStage) return responseStage;
  return undefined;
}

function createTransportError(error: SpeciesPredictionTransportError): SpeciesPredictionTransportError {
  return error;
}

function resolveRequestDiagnostics(
  error: unknown,
  requestUrl: string,
  requestTimestamp: string,
  requestId: string,
): SpeciesPredictionRequestDiagnostics {
  const responseTimestamp = new Date().toISOString();
  const candidate = (error && typeof error === 'object') ? error as Record<string, unknown> : {};
  const responseBody = candidate.responseBody ?? candidate.context ?? candidate.response ?? null;
  const httpStatus = readNumber(candidate.httpStatus) ?? readNumber(candidate.status) ?? null;
  const transportError = createTransportError({
    stage: mapErrorStage(resolvePredictionErrorStage(error)),
    httpStatus,
    message: resolvePredictionErrorMessage(error),
    responseBody,
    requestUrl: typeof candidate.requestUrl === 'string' ? candidate.requestUrl : requestUrl,
    requestId: typeof candidate.requestId === 'string' ? candidate.requestId : requestId,
    timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : responseTimestamp,
    errorType: resolveErrorType(error),
  });
  return {
    requestUrl: transportError.requestUrl,
    requestTimestamp: typeof candidate.requestTimestamp === 'string' ? candidate.requestTimestamp : requestTimestamp,
    responseTimestamp,
    requestId: transportError.requestId || requestId,
    httpStatus,
    responseBody,
    error: transportError,
  };
}

function createInvokeError(
  error: unknown,
  diagnostics: {
    requestUrl: string;
    requestTimestamp: string;
    responseTimestamp: string;
    requestId: string;
    responseBody: unknown;
  },
): Error {
  const message = resolvePredictionErrorMessage(error);
  const err = new Error(message) as Error & Record<string, unknown>;
  const candidate = (error && typeof error === 'object') ? error as Record<string, unknown> : {};
  err.stage = resolvePredictionErrorStage(error) || 'frontend_fetch';
  err.httpStatus = readNumber(candidate.status) ?? null;
  err.status = readNumber(candidate.status) ?? null;
  err.response = candidate.response ?? null;
  err.responseBody = diagnostics.responseBody;
  err.context = candidate.context ?? null;
  err.requestUrl = diagnostics.requestUrl;
  err.requestTimestamp = diagnostics.requestTimestamp;
  err.responseTimestamp = diagnostics.responseTimestamp;
  err.requestId = diagnostics.requestId;
  err.timestamp = diagnostics.responseTimestamp;
  err.failedBeforeResponse = diagnostics.responseBody == null;
  return err;
}

function mapErrorStage(stage: unknown): SpeciesPredictionTransportError['stage'] {
  switch (String(stage || '').trim()) {
    case 'frontend_fetch':
    case 'edge_function':
    case 'n8n_upstream':
    case 'n8n_timeout':
    case 'n8n_non_2xx':
    case 'invalid_upstream_json':
    case 'missing_webhook_url':
    case 'parse':
    case 'validation':
    case 'status':
      return String(stage) as SpeciesPredictionTransportError['stage'];
    case 'n8n':
      return 'n8n_upstream';
    case 'upstream_json':
      return 'invalid_upstream_json';
    default:
      return 'unknown';
  }
}

function resolveErrorType(error: unknown): SpeciesPredictionTransportError['errorType'] {
  const candidate = (error && typeof error === 'object') ? error as Record<string, unknown> : {};
  const message = resolvePredictionErrorMessage(error).toLowerCase();
  const stage = mapErrorStage(resolvePredictionErrorStage(error));
  if (stage === 'n8n_timeout' || message.includes('timeout')) return 'timeout';
  if (stage === 'parse' || stage === 'invalid_upstream_json' || message.includes('invalid response')) return 'parse';
  if (message.includes('fetch failed') || message.includes('network') || message.includes('load failed')) return 'network';
  if (readNumber(candidate.status) != null || stage === 'edge_function' || stage === 'n8n_non_2xx' || stage === 'n8n_upstream') return 'server';
  return 'unknown';
}

function readTimeoutMs(value: unknown): number | null {
  const record = (value && typeof value === 'object' && !Array.isArray(value)) ? value as Record<string, unknown> : {};
  const upstreamBody = (record.upstreamBody && typeof record.upstreamBody === 'object' && !Array.isArray(record.upstreamBody))
    ? record.upstreamBody as Record<string, unknown>
    : {};
  return readNumber(upstreamBody.timeoutMs) ?? readNumber(record.timeoutMs);
}

function reachedEdgeFunction(stage: unknown): boolean {
  const normalized = mapErrorStage(stage);
  return normalized === 'edge_function'
    || normalized === 'n8n_timeout'
    || normalized === 'n8n_non_2xx'
    || normalized === 'n8n_upstream'
    || normalized === 'invalid_upstream_json'
    || normalized === 'missing_webhook_url'
    || normalized === 'parse'
    || normalized === 'validation'
    || normalized === 'status';
}

function isFailureBeforeResponse(responseBody: unknown): boolean {
  if (responseBody == null) return true;
  if (typeof responseBody !== 'object') return false;
  return !Object.keys(responseBody as Record<string, unknown>).length;
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractStage(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const candidate = value as { stage?: unknown; json?: unknown; body?: unknown; response?: unknown };
  if (typeof candidate.stage === 'string' && candidate.stage.trim()) return candidate.stage.trim();
  return extractStage(candidate.json) || extractStage(candidate.body) || extractStage(candidate.response);
}

function extractContextMessage(context: unknown): string {
  if (!context) return '';
  if (typeof context === 'string') return context.trim();
  if (typeof context !== 'object') return '';
  const candidate = context as {
    json?: unknown;
    body?: unknown;
    response?: unknown;
    message?: unknown;
    error?: unknown;
  };
  return (
    extractResponseMessage(candidate.json)
    || extractResponseMessage(candidate.body)
    || extractResponseMessage(candidate.response)
    || (typeof candidate.message === 'string' ? candidate.message.trim() : '')
    || (typeof candidate.error === 'string' ? candidate.error.trim() : '')
  );
}
