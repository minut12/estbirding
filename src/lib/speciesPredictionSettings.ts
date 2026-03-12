import { supabase } from '@/integrations/supabase/client';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';
import { normalizeSpeciesPredictionSettings, type SpeciesPredictionSettings } from '@/lib/speciesPrediction';
import type { SpeciesScopeId } from '@/lib/mapScope';

const CACHE_PREFIX = 'speciesPredictionDefaults';

type CloudRow = {
  map_scope: string;
  species_key: string;
  species_name: string;
  settings: SpeciesPredictionSettings;
  updated_at: string;
  updated_by?: string | null;
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

export async function loadSpeciesPredictionSettings(scope: SpeciesScopeId, speciesName: string): Promise<SpeciesPredictionSettings> {
  const speciesKey = normalizeSpeciesName(speciesName);
  try {
    const { data, error } = await (supabase
      .from('species_prediction_defaults' as any)
      .select('map_scope, species_key, species_name, settings, updated_at, updated_by')
      .eq('map_scope', scope)
      .eq('species_key', speciesKey)
      .maybeSingle() as any);
    if (error) throw error;
    if (!data) return loadLocalSpeciesPredictionSettings(scope, speciesName);
    const normalized = normalizeSpeciesPredictionSettings(
      {
        ...((data as CloudRow).settings || {}),
        speciesKey,
        speciesName: normalizeUiText((data as CloudRow).species_name || speciesName),
        updatedAt: normalizeUiText((data as CloudRow).updated_at || ''),
      },
      speciesName,
      scope,
    );
    saveLocalSpeciesPredictionSettings(scope, normalized);
    return normalized;
  } catch {
    return loadLocalSpeciesPredictionSettings(scope, speciesName);
  }
}

export async function saveSpeciesPredictionSettings(scope: SpeciesScopeId, settings: SpeciesPredictionSettings, userId?: string): Promise<SpeciesPredictionSaveResult> {
  const normalized = validateSpeciesSettings(scope, settings);
  const payload = {
    map_scope: scope,
    species_key: normalized.speciesKey,
    species_name: normalized.speciesName,
    settings: normalized,
    ...(userId ? { updated_by: userId } : {}),
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
        ...((data as CloudRow).settings || {}),
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
    const reason = error instanceof Error && error.message ? error.message : 'Backend save unavailable';
    console.error('[speciesPredictionSettings] backend save failed', { scope, speciesKey: normalized.speciesKey, reason, error });
    saveLocalSpeciesPredictionSettings(scope, normalized);
    return {
      settings: normalized,
      storage: 'local',
      reason,
    };
  }
}
