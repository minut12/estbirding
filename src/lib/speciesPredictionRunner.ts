import { supabase } from '@/integrations/supabase/client';
import {
  hasUsableSpeciesPredictionResult,
  isPredictionRequestType,
  normalizeSpeciesPredictionResult,
  type PredictionRequestType,
  type SpeciesPredictionRequestPayload,
  type SpeciesPredictionResult,
} from '@/lib/speciesPrediction';
import { setSpeciesPredictionDebugBackendResponse } from '@/lib/speciesPredictionDebug';
import type { SpeciesScopeId } from '@/lib/mapScope';
import { isDeveloperModeEnabled } from '@/config/supabaseConfig';

export async function runSpeciesPredictionRequest(
  payload: SpeciesPredictionRequestPayload,
  scope: SpeciesScopeId,
): Promise<{ ok: boolean; disabled?: boolean; error?: string; stage?: string; result?: SpeciesPredictionResult }> {
  try {
    if (!isPredictionRequestType(payload.requestType)) {
      return {
        ok: false,
        error: 'Prediction request type is invalid',
      };
    }
    const { data, error } = await supabase.functions.invoke('species-prediction', {
      body: payload,
    });
    console.debug('[speciesPrediction] raw backend response', summarizePredictionPayload(data, payload.species.key));
    if (error) throw error;
    if (isErrorEnvelope(data)) {
      return {
        ok: false,
        ...(data.disabled ? { disabled: true } : {}),
        ...(typeof data.stage === 'string' ? { stage: data.stage } : {}),
        error: resolveUserFacingBackendMessage(String(data.message || data.error || 'Prediction request failed')),
      };
    }
    const sourceResult = isWrappedSuccessEnvelope(data) ? data.result : data;
    setSpeciesPredictionDebugBackendResponse(sourceResult);
    console.debug('[speciesPrediction] compare raw backend', comparePredictionFields(sourceResult, payload.species.key));
    if (isDeveloperModeEnabled()) {
      console.debug('[SpeciesPredictionDebug] backend', comparePredictionFields(sourceResult, payload.species.key));
    }
    if (!hasUsableSpeciesPredictionResult(sourceResult)) {
      return {
        ok: false,
        error: 'Prediction service is temporarily unavailable',
      };
    }
    return {
      ok: true,
      result: logNormalizedPredictionResult(
        normalizeSpeciesPredictionResult(sourceResult, payload.species.name, scope),
      ),
    };
  } catch (error: unknown) {
    const message = resolvePredictionErrorMessage(error);
    return {
      ok: false,
      stage: resolvePredictionErrorStage(error),
      error: message,
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

    if (status === 404 || resolvedMessage.includes('404')) {
      return 'Prediction backend is unavailable or not deployed';
    }
    if (status === 503) {
      return 'Prediction backend is not configured yet';
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
