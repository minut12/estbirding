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
    if (data?.ok === false) {
      return {
        ok: false,
        ...(data?.disabled ? { disabled: true } : {}),
        error: String(data?.message || data?.error || 'Prediction request failed'),
      };
    }
    const sourceResult = data?.result || data;
    if (!hasUsableSpeciesPredictionResult(sourceResult)) {
      return {
        ok: false,
        error: 'Prediction response payload is invalid',
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
      return 'Prediction backend is unavailable';
    }
    if (message) return message;
    if (statusText) return statusText;
  }
  return error instanceof Error ? error.message : 'Prediction request failed';
}
