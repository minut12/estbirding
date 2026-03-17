import type { SpeciesScopeId } from '@/lib/mapScope';

export const SPECIES_PREDICTION_DEBUG_EVENT = 'species-prediction-debug-updated';
export const SPECIES_PREDICTION_DEBUG_RERUN_EVENT = 'species-prediction-debug-rerun';
export const SPECIES_PREDICTION_DEBUG_RESYNC_EVENT = 'species-prediction-debug-resync';
export const SPECIES_PREDICTION_DEBUG_PANEL_STATE_MESSAGE = 'SPECIES_PREDICTION_PANEL_STATE';

type DebugStatus = 'idle' | 'loading' | 'success' | 'error';

export type SpeciesPredictionPanelStateSnapshot = {
  speciesName?: string;
  speciesKey?: string;
  scope?: SpeciesScopeId | string;
  generatedAt?: string;
  analysisVersion?: string;
  insightSummary?: string;
  externalPressureScore?: number;
  countryScores?: Record<string, unknown>;
  topPredictedPoints?: unknown[];
  runtimeMarker?: string;
};

export type SpeciesPredictionDebugSnapshot = {
  activeContext: {
    speciesName: string;
    speciesKey: string;
    mapScope: SpeciesScopeId | '';
    panelRuntimeMarker: string;
    lastPredictionRequestAt: string;
    lastPredictionResponseAt: string;
    predictionStatus: DebugStatus;
  };
  rawBackendResponse: unknown | null;
  panelPayload: unknown | null;
  panelState: SpeciesPredictionPanelStateSnapshot | null;
  latestBackendResponseForResync: unknown | null;
};

const state: SpeciesPredictionDebugSnapshot = {
  activeContext: {
    speciesName: '',
    speciesKey: '',
    mapScope: '',
    panelRuntimeMarker: '',
    lastPredictionRequestAt: '',
    lastPredictionResponseAt: '',
    predictionStatus: 'idle',
  },
  rawBackendResponse: null,
  panelPayload: null,
  panelState: null,
  latestBackendResponseForResync: null,
};

function emit(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SpeciesPredictionDebugSnapshot>(SPECIES_PREDICTION_DEBUG_EVENT, {
    detail: getSpeciesPredictionDebugSnapshot(),
  }));
}

export function getSpeciesPredictionDebugSnapshot(): SpeciesPredictionDebugSnapshot {
  return JSON.parse(JSON.stringify(state)) as SpeciesPredictionDebugSnapshot;
}

export function updateSpeciesPredictionDebugContext(patch: Partial<SpeciesPredictionDebugSnapshot['activeContext']>): void {
  Object.assign(state.activeContext, patch);
  emit();
}

export function setSpeciesPredictionDebugBackendResponse(response: unknown): void {
  state.rawBackendResponse = response ?? null;
  state.latestBackendResponseForResync = response ?? null;
  emit();
}

export function setSpeciesPredictionDebugPanelPayload(payload: unknown): void {
  state.panelPayload = payload ?? null;
  emit();
}

export function setSpeciesPredictionDebugPanelState(panelState: SpeciesPredictionPanelStateSnapshot | null): void {
  state.panelState = panelState ?? null;
  emit();
}

export function clearSpeciesPredictionDebugMemory(): void {
  state.rawBackendResponse = null;
  state.panelPayload = null;
  state.panelState = null;
  state.latestBackendResponseForResync = null;
  state.activeContext.lastPredictionRequestAt = '';
  state.activeContext.lastPredictionResponseAt = '';
  state.activeContext.predictionStatus = 'idle';
  emit();
}

export function getSpeciesPredictionDebugStorageSnapshot(): {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
} {
  const includeKey = (key: string) => (
    key.startsWith('speciesPrediction.')
    || key.startsWith('speciesPredictionDefaults.')
    || key.includes('activeSpecies')
    || key.includes('prediction')
  );
  const readStorage = (storage: Storage | undefined): Record<string, string> => {
    if (!storage) return {};
    const out: Record<string, string> = {};
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !includeKey(key)) continue;
      out[key] = storage.getItem(key) || '';
    }
    return out;
  };
  return {
    localStorage: typeof window === 'undefined' ? {} : readStorage(window.localStorage),
    sessionStorage: typeof window === 'undefined' ? {} : readStorage(window.sessionStorage),
  };
}

export function clearSpeciesPredictionDebugStorage(): void {
  if (typeof window === 'undefined') return;
  const includeKey = (key: string) => (
    key.startsWith('speciesPrediction.')
    || key.startsWith('speciesPredictionDefaults.')
    || key.includes('activeSpecies')
    || key.includes('prediction')
  );
  const removeMatching = (storage: Storage): void => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && includeKey(key)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  };
  removeMatching(window.localStorage);
  removeMatching(window.sessionStorage);
  emit();
}
