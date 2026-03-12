import { LINNULIIGID_SCOPE, RARILIIN_SCOPE, type SpeciesScopeConfig, type SpeciesScopeId } from '@/lib/mapScope';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';

export type PredictionMode = 'broad_area' | 'hotspot' | 'precise_hotspot';
export type SummaryStyle = 'short' | 'analytical' | 'field_use';
export type PredictionRequestType = 'prediction' | 'insight' | 'prediction_and_insight';
export type PredictionRisk = 'low' | 'medium' | 'high';

export type SpeciesPredictionSettings = {
  speciesKey: string;
  speciesName: string;
  scope: SpeciesScopeId;
  enablePrediction: boolean;
  enableResearchInsights: boolean;
  refreshIntervalMinutes: number;
  outputCount: 3 | 5;
  sources: {
    ebirdForeign: boolean;
    elurikkusHistory: boolean;
    estoniaRecent: boolean;
    weatherWind: boolean;
  };
  countries: {
    latvia: boolean;
    lithuania: boolean;
    belarus: boolean;
    poland: boolean;
    russia: boolean;
    finlandContextOnly: boolean;
  };
  windows: {
    foreign1d: boolean;
    foreign3d: boolean;
    foreign7d: boolean;
    foreign14d: boolean;
    estonia7d: boolean;
    estonia30d: boolean;
  };
  weights: {
    foreignPressure: number;
    elurikkusHistory: number;
    springTiming: number;
    weatherWind: number;
    hotspotHistory: number;
  };
  precision: {
    mode: PredictionMode;
    searchRadiusKm: number;
    hotspotRadiusKm: number;
    hotspotCount: number;
    showSourceFlows: boolean;
    showConfidenceRings: boolean;
  };
  automation: {
    enableN8nResearch: boolean;
    n8nWebhookUrl: string;
    n8nAuthHeader: string;
    enableOpenAISummary: boolean;
    summaryStyle: SummaryStyle;
    summaryMaxLength: number;
  };
  updatedAt: string;
};

export type PredictedPoint = {
  rank: number;
  name: string;
  countyOrParish: string;
  lat: number;
  lon: number;
  confidence: number;
  eta: string;
  searchRadiusKm: number;
  habitatCue: string;
  reason: string;
};

export type SpeciesPredictionResult = {
  speciesKey: string;
  speciesName: string;
  scope: SpeciesScopeId;
  generatedAt: string;
  externalPressureScore: number;
  springFitScore: number;
  windSupportScore: number;
  routeVector: string;
  bestEntryZone: string;
  alreadyMissedRisk: PredictionRisk;
  countryScores: {
    latvia: number;
    lithuania: number;
    belarus: number;
    poland: number;
    russia: number;
    finlandContext?: number;
  };
  topPredictedPoints: PredictedPoint[];
  insightSummary?: string;
  rawResearchPayload?: Record<string, unknown>;
};

export type SpeciesPredictionRequestPayload = {
  requestType: PredictionRequestType;
  species: {
    key: string;
    name: string;
    latinName: string;
  };
  settings: SpeciesPredictionSettings;
};

export const SPECIES_PREDICTION_EVENT_TYPES = {
  selected: 'SPECIES_PREDICTION_SELECTED',
  context: 'SPECIES_PREDICTION_CONTEXT',
  run: 'SPECIES_PREDICTION_RUN',
  loading: 'SPECIES_PREDICTION_LOADING',
  result: 'SPECIES_PREDICTION_RESULT',
  error: 'SPECIES_PREDICTION_ERROR',
} as const;

export function getSpeciesScopeByMapId(mapId: string): SpeciesScopeConfig | null {
  if (mapId === LINNULIIGID_SCOPE.mapId) return LINNULIIGID_SCOPE;
  if (mapId === RARILIIN_SCOPE.mapId) return RARILIIN_SCOPE;
  return null;
}

export function getSpeciesPredictionDefaults(speciesName = '', scope: SpeciesScopeId = 'linnuliigid'): SpeciesPredictionSettings {
  const normalizedName = normalizeUiText(speciesName);
  return {
    speciesKey: normalizeSpeciesName(normalizedName),
    speciesName: normalizedName,
    scope,
    enablePrediction: true,
    enableResearchInsights: true,
    refreshIntervalMinutes: 30,
    outputCount: 5,
    sources: {
      ebirdForeign: true,
      elurikkusHistory: true,
      estoniaRecent: true,
      weatherWind: true,
    },
    countries: {
      latvia: true,
      lithuania: true,
      belarus: true,
      poland: true,
      russia: true,
      finlandContextOnly: true,
    },
    windows: {
      foreign1d: true,
      foreign3d: true,
      foreign7d: true,
      foreign14d: false,
      estonia7d: true,
      estonia30d: true,
    },
    weights: {
      foreignPressure: 35,
      elurikkusHistory: 20,
      springTiming: 20,
      weatherWind: 15,
      hotspotHistory: 10,
    },
    precision: {
      mode: 'precise_hotspot',
      searchRadiusKm: 35,
      hotspotRadiusKm: 5,
      hotspotCount: 5,
      showSourceFlows: true,
      showConfidenceRings: true,
    },
    automation: {
      enableN8nResearch: false,
      n8nWebhookUrl: '',
      n8nAuthHeader: '',
      enableOpenAISummary: true,
      summaryStyle: 'field_use',
      summaryMaxLength: 450,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeSpeciesPredictionSettings(
  input: Partial<SpeciesPredictionSettings> | null | undefined,
  speciesName = '',
  scope: SpeciesScopeId = 'linnuliigid',
): SpeciesPredictionSettings {
  const defaults = getSpeciesPredictionDefaults(speciesName, scope);
  const normalizedName = normalizeUiText(input?.speciesName || speciesName || defaults.speciesName);
  const next: SpeciesPredictionSettings = {
    ...defaults,
    ...input,
    speciesName: normalizedName,
    speciesKey: normalizeSpeciesName(input?.speciesKey || normalizedName || defaults.speciesKey),
    scope,
    sources: { ...defaults.sources, ...(input?.sources || {}) },
    countries: { ...defaults.countries, ...(input?.countries || {}) },
    windows: { ...defaults.windows, ...(input?.windows || {}) },
    weights: { ...defaults.weights, ...(input?.weights || {}) },
    precision: { ...defaults.precision, ...(input?.precision || {}) },
    automation: {
      ...defaults.automation,
      ...(input?.automation || {}),
      n8nWebhookUrl: normalizeUiText(input?.automation?.n8nWebhookUrl || defaults.automation.n8nWebhookUrl),
      n8nAuthHeader: normalizeUiText(input?.automation?.n8nAuthHeader || defaults.automation.n8nAuthHeader),
    },
    updatedAt: normalizeUiText(input?.updatedAt || defaults.updatedAt) || new Date().toISOString(),
  };
  next.outputCount = next.outputCount === 3 ? 3 : 5;
  next.refreshIntervalMinutes = clampNumber(next.refreshIntervalMinutes, 5, 1440, defaults.refreshIntervalMinutes);
  next.weights.foreignPressure = clampNumber(next.weights.foreignPressure, 0, 100, defaults.weights.foreignPressure);
  next.weights.elurikkusHistory = clampNumber(next.weights.elurikkusHistory, 0, 100, defaults.weights.elurikkusHistory);
  next.weights.springTiming = clampNumber(next.weights.springTiming, 0, 100, defaults.weights.springTiming);
  next.weights.weatherWind = clampNumber(next.weights.weatherWind, 0, 100, defaults.weights.weatherWind);
  next.weights.hotspotHistory = clampNumber(next.weights.hotspotHistory, 0, 100, defaults.weights.hotspotHistory);
  next.precision.searchRadiusKm = clampNumber(next.precision.searchRadiusKm, 1, 300, defaults.precision.searchRadiusKm);
  next.precision.hotspotRadiusKm = clampNumber(next.precision.hotspotRadiusKm, 1, 100, defaults.precision.hotspotRadiusKm);
  next.precision.hotspotCount = clampNumber(next.precision.hotspotCount, 1, 20, defaults.precision.hotspotCount);
  next.automation.summaryMaxLength = clampNumber(next.automation.summaryMaxLength, 100, 5000, defaults.automation.summaryMaxLength);
  return next;
}

export function normalizeSpeciesPredictionResult(
  input: Partial<SpeciesPredictionResult> | null | undefined,
  speciesName: string,
  scope: SpeciesScopeId,
): SpeciesPredictionResult {
  const normalizedName = normalizeUiText(speciesName);
  return {
    speciesKey: normalizeSpeciesName(input?.speciesKey || normalizedName),
    speciesName: normalizeUiText(input?.speciesName || normalizedName),
    scope,
    generatedAt: normalizeUiText(input?.generatedAt || new Date().toISOString()),
    externalPressureScore: toNumber(input?.externalPressureScore),
    springFitScore: toNumber(input?.springFitScore),
    windSupportScore: toNumber(input?.windSupportScore),
    routeVector: normalizeUiText(input?.routeVector || ''),
    bestEntryZone: normalizeUiText(input?.bestEntryZone || ''),
    alreadyMissedRisk: input?.alreadyMissedRisk === 'high' || input?.alreadyMissedRisk === 'medium' ? input.alreadyMissedRisk : 'low',
    countryScores: {
      latvia: toNumber(input?.countryScores?.latvia),
      lithuania: toNumber(input?.countryScores?.lithuania),
      belarus: toNumber(input?.countryScores?.belarus),
      poland: toNumber(input?.countryScores?.poland),
      russia: toNumber(input?.countryScores?.russia),
      ...(input?.countryScores?.finlandContext != null ? { finlandContext: toNumber(input.countryScores.finlandContext) } : {}),
    },
    topPredictedPoints: Array.isArray(input?.topPredictedPoints)
      ? input.topPredictedPoints.map((point, index) => ({
        rank: clampNumber(point?.rank ?? index + 1, 1, 99, index + 1),
        name: normalizeUiText(point?.name || ''),
        countyOrParish: normalizeUiText(point?.countyOrParish || ''),
        lat: toNumber(point?.lat),
        lon: toNumber(point?.lon),
        confidence: clampNumber(point?.confidence, 0, 100, 0),
        eta: normalizeUiText(point?.eta || ''),
        searchRadiusKm: clampNumber(point?.searchRadiusKm, 0, 500, 0),
        habitatCue: normalizeUiText(point?.habitatCue || ''),
        reason: normalizeUiText(point?.reason || ''),
      }))
      : [],
    ...(input?.insightSummary ? { insightSummary: normalizeUiText(input.insightSummary) } : {}),
    ...(input?.rawResearchPayload ? { rawResearchPayload: input.rawResearchPayload } : {}),
  };
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
