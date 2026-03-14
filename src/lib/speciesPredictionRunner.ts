import { supabase } from '@/integrations/supabase/client';
import {
  hasUsableSpeciesPredictionResult,
  isPredictionRequestType,
  normalizeSpeciesPredictionResult,
  type PredictionRequestType,
  type SpeciesPredictionRequestPayload,
  type SpeciesPredictionResult,
} from '@/lib/speciesPrediction';
import type { SpeciesScopeId } from '@/lib/mapScope';

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
    if (!hasUsableSpeciesPredictionResult(sourceResult)) {
      return {
        ok: false,
        error: 'Prediction service is temporarily unavailable',
      };
    }
    return {
      ok: true,
      result: normalizeSpeciesPredictionResult(sourceResult, payload.species.name, scope),
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
