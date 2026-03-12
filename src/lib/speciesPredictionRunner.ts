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
        error: String(data?.error || 'Prediction request failed'),
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
    const message = error instanceof Error ? error.message : 'Prediction request failed';
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
