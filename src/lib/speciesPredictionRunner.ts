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
): Promise<{ ok: boolean; disabled?: boolean; error?: string; result?: SpeciesPredictionResult }> {
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
    };
    const status = Number(candidate.status);
    const message = typeof candidate.message === 'string' ? candidate.message : '';
    const context = typeof candidate.context === 'string' ? candidate.context : '';
    const statusText = typeof candidate.statusText === 'string' ? candidate.statusText : '';

    if (status === 404 || message.includes('404') || context.includes('404')) {
      return 'Prediction backend is unavailable or not deployed';
    }
    if (status === 503) {
      return 'Prediction backend is not configured yet';
    }
    if (status >= 500) return 'Prediction service is temporarily unavailable';
    if (message) return resolveUserFacingBackendMessage(message);
    if (statusText) return resolveUserFacingBackendMessage(statusText);
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
  if (normalized.includes('not configured')) {
    return 'Prediction backend is not configured yet';
  }
  if (
    normalized.includes('fetch failed')
    || normalized.includes('failed to fetch')
    || normalized.includes('networkerror')
    || normalized.includes('network request failed')
    || normalized.includes('load failed')
  ) {
    return 'Prediction service is temporarily unavailable';
  }
  return message;
}
