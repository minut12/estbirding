import type { SpeciesScopeId } from '@/lib/mapScope';

export const SPECIES_PREDICTION_DEBUG_EVENT = 'species-prediction-debug-updated';
export const SPECIES_PREDICTION_DEBUG_RERUN_EVENT = 'species-prediction-debug-rerun';
export const SPECIES_PREDICTION_DEBUG_RESYNC_EVENT = 'species-prediction-debug-resync';
export const SPECIES_PREDICTION_DEBUG_PANEL_STATE_MESSAGE = 'SPECIES_PREDICTION_PANEL_STATE';
export const SPECIES_PREDICTION_DEBUG_HEALTHCHECK_EVENT = 'species-prediction-debug-healthcheck';

type DebugStatus = 'idle' | 'loading' | 'success' | 'error';
export type SpeciesPredictionErrorStage =
  | 'frontend_fetch'
  | 'edge_function'
  | 'n8n_upstream'
  | 'n8n_timeout'
  | 'n8n_non_2xx'
  | 'invalid_upstream_json'
  | 'missing_webhook_url'
  | 'parse'
  | 'validation'
  | 'status'
  | 'unknown';

export type SpeciesPredictionErrorType = 'timeout' | 'network' | 'server' | 'parse' | 'unknown';

export type SpeciesPredictionTransportError = {
  stage: SpeciesPredictionErrorStage;
  httpStatus: number | null;
  message: string;
  responseBody: unknown;
  requestUrl: string;
  requestId: string | null;
  timestamp: string;
  errorType: SpeciesPredictionErrorType;
};

export type SpeciesPredictionTransportSnapshot = {
  requestUrl: string;
  requestTimestamp: string;
  responseTimestamp: string;
  requestId: string | null;
  httpStatus: number | null;
  responseBody: unknown;
  timeoutMs: number | null;
  abortedByClientTimeout: boolean;
  likelyReachedEdgeFunction: boolean;
  error: SpeciesPredictionTransportError | null;
  healthCheck: unknown | null;
};

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
  transport: SpeciesPredictionTransportSnapshot;
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
  transport: {
    requestUrl: '',
    requestTimestamp: '',
    responseTimestamp: '',
    requestId: null,
    httpStatus: null,
    responseBody: null,
    timeoutMs: null,
    abortedByClientTimeout: false,
    likelyReachedEdgeFunction: false,
    error: null,
    healthCheck: null,
  },
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

export function updateSpeciesPredictionTransport(patch: Partial<SpeciesPredictionTransportSnapshot>): void {
  Object.assign(state.transport, patch);
  emit();
}

export function setSpeciesPredictionTransportError(error: SpeciesPredictionTransportError | null): void {
  state.transport.error = error ?? null;
  emit();
}

export function setSpeciesPredictionHealthCheckResult(result: unknown): void {
  state.transport.healthCheck = result ?? null;
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
  state.transport.requestUrl = '';
  state.transport.requestTimestamp = '';
  state.transport.responseTimestamp = '';
  state.transport.requestId = null;
  state.transport.httpStatus = null;
  state.transport.responseBody = null;
  state.transport.timeoutMs = null;
  state.transport.abortedByClientTimeout = false;
  state.transport.likelyReachedEdgeFunction = false;
  state.transport.error = null;
  state.transport.healthCheck = null;
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
