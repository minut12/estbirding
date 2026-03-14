import type { SpeciesScopeId } from '@/lib/mapScope';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';

export const ACTIVE_PREDICTION_SPECIES_EVENT = 'active-prediction-species-changed';
export const ACTIVE_PREDICTION_SPECIES_MESSAGE = 'SPECIES_PREDICTION_ACTIVE_SPECIES';
export const ACTIVE_PREDICTION_IFRAME_READY_MESSAGE = 'SPECIES_PREDICTION_IFRAME_READY';

const STORAGE_PREFIX = 'speciesPrediction.activeSpecies';

export type ActivePredictionSpecies = {
  scope: SpeciesScopeId;
  speciesName: string;
  speciesKey: string;
};

export function getActivePredictionSpecies(scope: SpeciesScopeId): ActivePredictionSpecies | null {
  if (typeof window === 'undefined') return null;
  const speciesName = normalizeUiText(window.localStorage.getItem(storageKey(scope)) || '');
  if (!speciesName) return null;
  return {
    scope,
    speciesName,
    speciesKey: normalizeSpeciesName(speciesName),
  };
}

export function setActivePredictionSpecies(scope: SpeciesScopeId, speciesName: string): ActivePredictionSpecies | null {
  if (typeof window === 'undefined') return null;
  const normalizedName = normalizeUiText(speciesName);
  const speciesKey = normalizeSpeciesName(normalizedName);
  if (!normalizedName || !speciesKey) return null;
  window.localStorage.setItem(storageKey(scope), normalizedName);
  const detail: ActivePredictionSpecies = { scope, speciesName: normalizedName, speciesKey };
  window.dispatchEvent(new CustomEvent<ActivePredictionSpecies>(ACTIVE_PREDICTION_SPECIES_EVENT, { detail }));
  return detail;
}

function storageKey(scope: SpeciesScopeId): string {
  return `${STORAGE_PREFIX}.${scope}`;
}
