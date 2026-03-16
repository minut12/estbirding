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
  ebirdSpeciesCodeOverride?: string;
  enablePrediction: boolean;
  enableResearchInsights: boolean;
  refreshIntervalMinutes: number;
  outputCount: 3 | 5;
  useEbirdForeignSightings: boolean;
  useElurikkusHistory: boolean;
  useEstoniaRecentRecords: boolean;
  useWeatherWind: boolean;
  useLatvia: boolean;
  useLithuania: boolean;
  useBelarus: boolean;
  usePoland: boolean;
  useRussia: boolean;
  useFinlandContextOnly: boolean;
  foreignLookback1d: boolean;
  foreignLookback3d: boolean;
  foreignLookback7d: boolean;
  foreignLookback14d: boolean;
  estoniaRecentWindow7d: boolean;
  estoniaRecentWindow30d: boolean;
  foreignPressureWeight: number;
  elurikkusHistoryWeight: number;
  springTimingWeight: number;
  weatherWindWeight: number;
  hotspotHistoryWeight: number;
  predictionMode: PredictionMode;
  searchRadiusKm: number;
  hotspotRadiusKm: number;
  hotspotCount: number;
  mapShowSourceFlows: boolean;
  mapShowConfidenceRings: boolean;
  enableN8nResearch: boolean;
  enableOpenAISummary: boolean;
  summaryStyle: SummaryStyle;
  summaryMaxLength: number;
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

export type PredictionConsistencyChecks = {
  routeLooksPlausible: boolean;
  timingLooksPlausible: boolean;
  weatherLooksSupportive: boolean;
  foreignPressureMatchesNarrative: boolean;
};

export type SpeciesPredictionAnalysis = {
  analysisVersion: string;
  insightSummary: string;
  confidenceNote?: string;
  warnings?: string[];
  rerankedTopPredictedPoints?: PredictedPoint[];
  consistencyChecks: PredictionConsistencyChecks;
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
    finlandContextOnly?: number;
  };
  topPredictedPoints: PredictedPoint[];
  insightSummary?: string;
  analysisVersion?: string;
  analysisFallbackUsed?: boolean;
  confidenceNote?: string;
  warnings?: string[];
  rerankedTopPredictedPoints?: PredictedPoint[];
  consistencyChecks?: PredictionConsistencyChecks;
  openaiAnalysis?: SpeciesPredictionAnalysis;
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

export function isPredictionRequestType(value: unknown): value is PredictionRequestType {
  return value === 'prediction' || value === 'insight' || value === 'prediction_and_insight';
}

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
    ebirdSpeciesCodeOverride: undefined,
    enablePrediction: true,
    enableResearchInsights: true,
    refreshIntervalMinutes: 30,
    outputCount: 5,
    useEbirdForeignSightings: true,
    useElurikkusHistory: true,
    useEstoniaRecentRecords: true,
    useWeatherWind: true,
    useLatvia: true,
    useLithuania: true,
    useBelarus: true,
    usePoland: true,
    useRussia: true,
    useFinlandContextOnly: true,
    foreignLookback1d: true,
    foreignLookback3d: true,
    foreignLookback7d: true,
    foreignLookback14d: false,
    estoniaRecentWindow7d: true,
    estoniaRecentWindow30d: true,
    foreignPressureWeight: 35,
    elurikkusHistoryWeight: 20,
    springTimingWeight: 20,
    weatherWindWeight: 15,
    hotspotHistoryWeight: 10,
    predictionMode: 'precise_hotspot',
    searchRadiusKm: 35,
    hotspotRadiusKm: 5,
    hotspotCount: 5,
    mapShowSourceFlows: true,
    mapShowConfidenceRings: true,
    enableN8nResearch: false,
    enableOpenAISummary: true,
    summaryStyle: 'field_use',
    summaryMaxLength: 450,
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
  const inputAny = (input || {}) as Record<string, unknown>;
  const legacySources = asRecord(inputAny.sources);
  const legacyCountries = asRecord(inputAny.countries);
  const legacyWindows = asRecord(inputAny.windows);
  const legacyWeights = asRecord(inputAny.weights);
  const legacyPrecision = asRecord(inputAny.precision);
  const legacyAutomation = asRecord(inputAny.automation);
  const next: SpeciesPredictionSettings = {
    ...defaults,
    ...input,
    speciesName: normalizedName,
    speciesKey: normalizeSpeciesName(input?.speciesKey || normalizedName || defaults.speciesKey),
    scope,
    ...(normalizeUiText(input?.ebirdSpeciesCodeOverride || '') ? { ebirdSpeciesCodeOverride: normalizeUiText(input?.ebirdSpeciesCodeOverride || '') } : {}),
    useEbirdForeignSightings: coalesceBoolean(input?.useEbirdForeignSightings, legacySources.ebirdForeign, defaults.useEbirdForeignSightings),
    useElurikkusHistory: coalesceBoolean(input?.useElurikkusHistory, legacySources.elurikkusHistory, defaults.useElurikkusHistory),
    useEstoniaRecentRecords: coalesceBoolean(input?.useEstoniaRecentRecords, legacySources.estoniaRecent, defaults.useEstoniaRecentRecords),
    useWeatherWind: coalesceBoolean(input?.useWeatherWind, legacySources.weatherWind, defaults.useWeatherWind),
    useLatvia: coalesceBoolean(input?.useLatvia, legacyCountries.latvia, defaults.useLatvia),
    useLithuania: coalesceBoolean(input?.useLithuania, legacyCountries.lithuania, defaults.useLithuania),
    useBelarus: coalesceBoolean(input?.useBelarus, legacyCountries.belarus, defaults.useBelarus),
    usePoland: coalesceBoolean(input?.usePoland, legacyCountries.poland, defaults.usePoland),
    useRussia: coalesceBoolean(input?.useRussia, legacyCountries.russia, defaults.useRussia),
    useFinlandContextOnly: coalesceBoolean(input?.useFinlandContextOnly, legacyCountries.finlandContextOnly, defaults.useFinlandContextOnly),
    foreignLookback1d: coalesceBoolean(input?.foreignLookback1d, legacyWindows.foreign1d, defaults.foreignLookback1d),
    foreignLookback3d: coalesceBoolean(input?.foreignLookback3d, legacyWindows.foreign3d, defaults.foreignLookback3d),
    foreignLookback7d: coalesceBoolean(input?.foreignLookback7d, legacyWindows.foreign7d, defaults.foreignLookback7d),
    foreignLookback14d: coalesceBoolean(input?.foreignLookback14d, legacyWindows.foreign14d, defaults.foreignLookback14d),
    estoniaRecentWindow7d: coalesceBoolean(input?.estoniaRecentWindow7d, legacyWindows.estonia7d, defaults.estoniaRecentWindow7d),
    estoniaRecentWindow30d: coalesceBoolean(input?.estoniaRecentWindow30d, legacyWindows.estonia30d, defaults.estoniaRecentWindow30d),
    foreignPressureWeight: coalesceNumber(input?.foreignPressureWeight, legacyWeights.foreignPressure, defaults.foreignPressureWeight),
    elurikkusHistoryWeight: coalesceNumber(input?.elurikkusHistoryWeight, legacyWeights.elurikkusHistory, defaults.elurikkusHistoryWeight),
    springTimingWeight: coalesceNumber(input?.springTimingWeight, legacyWeights.springTiming, defaults.springTimingWeight),
    weatherWindWeight: coalesceNumber(input?.weatherWindWeight, legacyWeights.weatherWind, defaults.weatherWindWeight),
    hotspotHistoryWeight: coalesceNumber(input?.hotspotHistoryWeight, legacyWeights.hotspotHistory, defaults.hotspotHistoryWeight),
    predictionMode: isPredictionMode(input?.predictionMode) ? input.predictionMode : (isPredictionMode(legacyPrecision.mode) ? legacyPrecision.mode : defaults.predictionMode),
    searchRadiusKm: coalesceNumber(input?.searchRadiusKm, legacyPrecision.searchRadiusKm, defaults.searchRadiusKm),
    hotspotRadiusKm: coalesceNumber(input?.hotspotRadiusKm, legacyPrecision.hotspotRadiusKm, defaults.hotspotRadiusKm),
    hotspotCount: coalesceNumber(input?.hotspotCount, legacyPrecision.hotspotCount, defaults.hotspotCount),
    mapShowSourceFlows: coalesceBoolean(input?.mapShowSourceFlows, legacyPrecision.showSourceFlows, defaults.mapShowSourceFlows),
    mapShowConfidenceRings: coalesceBoolean(input?.mapShowConfidenceRings, legacyPrecision.showConfidenceRings, defaults.mapShowConfidenceRings),
    enableN8nResearch: coalesceBoolean(input?.enableN8nResearch, legacyAutomation.enableN8nResearch, defaults.enableN8nResearch),
    enableOpenAISummary: coalesceBoolean(input?.enableOpenAISummary, legacyAutomation.enableOpenAISummary, defaults.enableOpenAISummary),
    summaryStyle: isSummaryStyle(input?.summaryStyle) ? input.summaryStyle : (isSummaryStyle(legacyAutomation.summaryStyle) ? legacyAutomation.summaryStyle : defaults.summaryStyle),
    summaryMaxLength: coalesceNumber(input?.summaryMaxLength, legacyAutomation.summaryMaxLength, defaults.summaryMaxLength),
    updatedAt: normalizeUiText(input?.updatedAt || defaults.updatedAt) || new Date().toISOString(),
  };
  next.outputCount = next.outputCount === 3 ? 3 : 5;
  next.refreshIntervalMinutes = clampNumber(next.refreshIntervalMinutes, 5, 1440, defaults.refreshIntervalMinutes);
  next.foreignPressureWeight = clampNumber(next.foreignPressureWeight, 0, 100, defaults.foreignPressureWeight);
  next.elurikkusHistoryWeight = clampNumber(next.elurikkusHistoryWeight, 0, 100, defaults.elurikkusHistoryWeight);
  next.springTimingWeight = clampNumber(next.springTimingWeight, 0, 100, defaults.springTimingWeight);
  next.weatherWindWeight = clampNumber(next.weatherWindWeight, 0, 100, defaults.weatherWindWeight);
  next.hotspotHistoryWeight = clampNumber(next.hotspotHistoryWeight, 0, 100, defaults.hotspotHistoryWeight);
  next.searchRadiusKm = clampNumber(next.searchRadiusKm, 1, 300, defaults.searchRadiusKm);
  next.hotspotRadiusKm = clampNumber(next.hotspotRadiusKm, 1, 100, defaults.hotspotRadiusKm);
  next.hotspotCount = clampNumber(next.hotspotCount, 1, 20, defaults.hotspotCount);
  next.summaryMaxLength = clampNumber(next.summaryMaxLength, 100, 5000, defaults.summaryMaxLength);
  return next;
}

export function normalizeSpeciesPredictionResult(
  input: Partial<SpeciesPredictionResult> | null | undefined,
  speciesName: string,
  scope: SpeciesScopeId,
): SpeciesPredictionResult {
  const normalizedName = normalizeUiText(speciesName);
  const speciesKey = normalizeSpeciesName(input?.speciesKey || normalizedName);
  const topPredictedPoints = Array.isArray(input?.topPredictedPoints)
    ? input.topPredictedPoints
      .map((point, index) => normalizePredictedPoint(point, index))
      .filter((point) => point.name || point.countyOrParish || (point.lat !== 0 || point.lon !== 0))
    : [];
  const warnings = Array.isArray(input?.warnings)
    ? input.warnings.map((warning) => normalizeUiText(String(warning || ''))).filter(Boolean)
    : [];
  return {
    speciesKey,
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
      ...(input?.countryScores?.finlandContextOnly != null
        ? { finlandContextOnly: toNumber(input.countryScores.finlandContextOnly) }
        : (() => { const cs = input?.countryScores as Record<string, unknown> | undefined; return cs?.finlandContext != null ? { finlandContextOnly: toNumber(cs.finlandContext) } : {}; })()),
    },
    topPredictedPoints,
    ...(input?.insightSummary ? { insightSummary: normalizeUiText(input.insightSummary) } : {}),
    ...(input?.analysisVersion ? { analysisVersion: normalizeUiText(input.analysisVersion) } : {}),
    ...(typeof input?.analysisFallbackUsed === 'boolean' ? { analysisFallbackUsed: input.analysisFallbackUsed } : {}),
    ...(input?.confidenceNote ? { confidenceNote: normalizeUiText(input.confidenceNote) } : {}),
    ...(warnings.length ? { warnings } : {}),
    ...(input?.consistencyChecks ? { consistencyChecks: normalizePredictionConsistencyChecks(input.consistencyChecks) } : {}),
    ...(input?.rawResearchPayload ? { rawResearchPayload: input.rawResearchPayload } : {}),
  };
}

export function hasUsableSpeciesPredictionResult(
  input: Partial<SpeciesPredictionResult> | null | undefined,
): boolean {
  if (!input || typeof input !== 'object') return false;
  const speciesKey = normalizeSpeciesName(input.speciesKey || '');
  const speciesName = normalizeUiText(input.speciesName || '');
  const generatedAt = normalizeUiText(input.generatedAt || '');
  return Boolean(speciesKey && speciesName && generatedAt);
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

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function coalesceBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return false;
}

function coalesceNumber(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function isPredictionMode(value: unknown): value is PredictionMode {
  return value === 'broad_area' || value === 'hotspot' || value === 'precise_hotspot';
}

function isSummaryStyle(value: unknown): value is SummaryStyle {
  return value === 'short' || value === 'analytical' || value === 'field_use';
}

function normalizePredictedPoint(point: Partial<PredictedPoint> | null | undefined, index: number): PredictedPoint {
  return {
    rank: clampNumber(point?.rank ?? index + 1, 1, 99, index + 1),
    name: normalizeUiText(point?.name || ''),
    countyOrParish: normalizeUiText(point?.countyOrParish || ''),
    lat: toNumber(point?.lat),
    lon: toNumber(point?.lon),
    confidence: clampFloat(point?.confidence, 0, 100, 0),
    eta: normalizeUiText(point?.eta || ''),
    searchRadiusKm: clampNumber(point?.searchRadiusKm, 0, 500, 0),
    habitatCue: normalizeUiText(point?.habitatCue || ''),
    reason: normalizeUiText(point?.reason || ''),
  };
}

function normalizePredictionConsistencyChecks(
  input: Partial<PredictionConsistencyChecks> | null | undefined,
): PredictionConsistencyChecks {
  return {
    routeLooksPlausible: input?.routeLooksPlausible === true,
    timingLooksPlausible: input?.timingLooksPlausible === true,
    weatherLooksSupportive: input?.weatherLooksSupportive === true,
    foreignPressureMatchesNarrative: input?.foreignPressureMatchesNarrative === true,
  };
}
