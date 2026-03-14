import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';
import { normalizeSpeciesPredictionSettings, type SpeciesPredictionSettings } from '@/lib/speciesPrediction';
import type { SpeciesScopeId } from '@/lib/mapScope';

const CACHE_PREFIX = 'speciesPredictionDefaults';

type CloudRow = Database['public']['Tables']['species_prediction_defaults']['Row'];
type PostgrestErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
};

export type SpeciesPredictionSaveResult = {
  settings: SpeciesPredictionSettings;
  storage: 'backend' | 'local';
  reason?: string;
};

function cacheKey(scope: SpeciesScopeId, speciesKey: string): string {
  return `${CACHE_PREFIX}.${scope}.${speciesKey}`;
}

export function loadLocalSpeciesPredictionSettings(scope: SpeciesScopeId, speciesName: string): SpeciesPredictionSettings {
  const speciesKey = normalizeSpeciesName(speciesName);
  try {
    const raw = localStorage.getItem(cacheKey(scope, speciesKey));
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeSpeciesPredictionSettings(parsed, speciesName, scope);
  } catch {
    return normalizeSpeciesPredictionSettings(null, speciesName, scope);
  }
}

function saveLocalSpeciesPredictionSettings(scope: SpeciesScopeId, settings: SpeciesPredictionSettings): void {
  localStorage.setItem(cacheKey(scope, settings.speciesKey), JSON.stringify(settings));
}

function validateSpeciesSettings(scope: SpeciesScopeId, settings: SpeciesPredictionSettings): SpeciesPredictionSettings {
  const normalized = normalizeSpeciesPredictionSettings(settings, settings.speciesName, scope);
  if (!scope || !normalized.speciesName || !normalized.speciesKey) {
    throw new Error('Select a valid species before saving prediction settings');
  }
  return normalized;
}

function isMissingResourceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as PostgrestErrorLike;
  const combined = `${candidate.code || ''} ${candidate.message || ''} ${candidate.details || ''} ${candidate.hint || ''}`.toLowerCase();
  return (
    combined.includes('species_prediction_defaults')
    && (
      combined.includes('404')
      || combined.includes('not found')
      || combined.includes('could not find')
      || combined.includes('relation')
      || combined.includes('schema cache')
      || combined.includes('pgrst')
    )
  );
}

function resolveCloudFailureReason(error: unknown): string {
  if (isMissingResourceError(error)) {
    return 'Prediction settings storage is not available in Supabase yet';
  }
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const candidate = error as PostgrestErrorLike;
    if (candidate.message) return candidate.message;
  }
  return 'Backend save unavailable';
}

export async function loadSpeciesPredictionSettings(scope: SpeciesScopeId, speciesName: string): Promise<SpeciesPredictionSettings> {
  const speciesKey = normalizeSpeciesName(speciesName);
  try {
    const { data, error } = await supabase
      .from('species_prediction_defaults')
      .select('map_scope, species_key, species_name, settings, updated_at, updated_by')
      .eq('map_scope', scope)
      .eq('species_key', speciesKey)
      .maybeSingle();
    if (error) throw error;
    if (!data) return loadLocalSpeciesPredictionSettings(scope, speciesName);
    const normalized = normalizeSpeciesPredictionSettings(
      {
        ...((data as CloudRow).settings as SpeciesPredictionSettings || {}),
        speciesKey,
        speciesName: normalizeUiText((data as CloudRow).species_name || speciesName),
        updatedAt: normalizeUiText((data as CloudRow).updated_at || ''),
      },
      speciesName,
      scope,
    );
    saveLocalSpeciesPredictionSettings(scope, normalized);
    return normalized;
  } catch (error) {
    if (isMissingResourceError(error)) {
      console.error('[speciesPredictionSettings] missing Supabase resource for species prediction settings', {
        scope,
        speciesKey,
        error,
      });
    }
    console.warn('[speciesPredictionSettings] backend load failed, using local fallback', {
      scope,
      speciesKey,
      reason: resolveCloudFailureReason(error),
    });
    return loadLocalSpeciesPredictionSettings(scope, speciesName);
  }
}

export async function saveSpeciesPredictionSettings(scope: SpeciesScopeId, settings: SpeciesPredictionSettings, userId?: string): Promise<SpeciesPredictionSaveResult> {
  const normalized = validateSpeciesSettings(scope, settings);
  const payload: Database['public']['Tables']['species_prediction_defaults']['Insert'] = {
    map_scope: scope,
    species_key: normalized.speciesKey,
    species_name: normalized.speciesName,
    settings: normalized,
    updated_by: userId ?? null,
  };
  try {
    const { data, error } = await supabase
      .from('species_prediction_defaults')
      .upsert(payload, { onConflict: 'map_scope,species_key' })
      .select('map_scope, species_key, species_name, settings, updated_at, updated_by')
      .single();
    if (error) throw error;
    const next = normalizeSpeciesPredictionSettings(
      {
        ...((data as CloudRow).settings as SpeciesPredictionSettings || {}),
        speciesKey: normalizeUiText((data as CloudRow).species_key || normalized.speciesKey),
        speciesName: normalizeUiText((data as CloudRow).species_name || normalized.speciesName),
        updatedAt: normalizeUiText((data as CloudRow).updated_at || normalized.updatedAt),
      },
      normalized.speciesName,
      scope,
    );
    saveLocalSpeciesPredictionSettings(scope, next);
    return { settings: next, storage: 'backend' };
  } catch (error: unknown) {
    const reason = resolveCloudFailureReason(error);
    if (isMissingResourceError(error)) {
      console.error('[speciesPredictionSettings] missing Supabase resource for species prediction settings save', {
        scope,
        speciesKey: normalized.speciesKey,
        error,
      });
    }
    console.error('[speciesPredictionSettings] backend save failed', { scope, speciesKey: normalized.speciesKey, reason, error });
    saveLocalSpeciesPredictionSettings(scope, normalized);
    return {
      settings: normalized,
      storage: 'local',
      reason,
    };
  }
}
