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
  supportingCountries?: string[];
  nearestRelevantClusterKm?: number;
  latestRelevantForeignDate?: string;
  historicalMatch?: string;
  estoniaPresenceSignal?: string;
};

export type SpeciesPredictionEvidenceCluster = {
  lat: number;
  lon: number;
  lastDate: string;
  count7d: number;
  source: string;
  label?: string;
};

export type SpeciesPredictionForeignEvidenceGroup = {
  countryCode: string;
  countryName: string;
  recordCount7d: number;
  recordCount30d: number;
  nearestDistanceKm: number;
  latestDate: string;
  clusterCount: number;
  topClusters: SpeciesPredictionEvidenceCluster[];
};

export type SpeciesPredictionHistoricalEvidence = {
  springWindow: string;
  topHistoricalHotspots: PredictedPoint[];
  habitatHints: string[];
};

export type SpeciesPredictionEstoniaEvidence = {
  recentCount7d: number;
  recentCount30d: number;
  latestEstoniaDate: string;
  latestEstoniaLat: number | null;
  latestEstoniaLon: number | null;
  alreadyPresent: boolean;
  alreadyPassed: boolean;
};

export type SpeciesPredictionSourceHealth = {
  primarySourceUsed: string;
  sourceWarnings: string[];
  elurikkusAvailable: boolean;
  ebirdAvailable: boolean;
  gbifFallbackUsed: boolean;
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
  species?: {
    speciesKey: string;
    speciesName: string;
    latinName: string;
    ebirdSpeciesCode: string;
  };
  sourceHealth?: SpeciesPredictionSourceHealth;
  foreignEvidence?: SpeciesPredictionForeignEvidenceGroup[];
  estoniaEvidence?: SpeciesPredictionEstoniaEvidence;
  historicalEvidence?: SpeciesPredictionHistoricalEvidence;
  rawLinks?: {
    elurikkusSearchUrl: string;
    countrySourceUrls?: Record<string, string>;
  };
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
  const source = resolvePredictionSource(input);
  const normalizedName = normalizeUiText(speciesName);
  const speciesKey = normalizeSpeciesName(readString(source, ['speciesKey', 'species_key']) || normalizedName);
  const canonicalTopPredictedPointsSource = readArray(source, ['topPredictedPoints']);
  const legacyTopPredictedPointsSource = readArray(source, ['top_predicted_points', 'points', 'candidates']);
  const rerankedTopPredictedPointsSource = readArray(source, ['rerankedTopPredictedPoints'])
    ?? readArray(asRecord(source.openaiAnalysis), ['rerankedTopPredictedPoints']);
  const topPredictedPointsSource = canonicalTopPredictedPointsSource
    ?? legacyTopPredictedPointsSource
    ?? rerankedTopPredictedPointsSource;
  const topPredictedPoints = Array.isArray(topPredictedPointsSource)
    ? topPredictedPointsSource
      .map((point, index) => normalizePredictedPoint(point, index))
      .filter((point) => point.name || point.countyOrParish || (point.lat !== 0 || point.lon !== 0))
    : [];
  const warningsSource = readArray(source, ['warnings'])
    ?? readArray(asRecord(source.openaiAnalysis), ['warnings']);
  const warnings = Array.isArray(warningsSource)
    ? warningsSource.map((warning) => normalizeUiText(String(warning || ''))).filter(Boolean)
    : [];
  const canonicalCountryScoresSource = readRecord(source, ['countryScores']);
  const legacyCountryScoresSource = readRecord(source, ['country_scores', 'countryScoreMap', 'country_score_map']);
  const fallbackCountryScoresSource = readRecord(asRecord(asRecord(source.rawResearchPayload).openAIAnalysisInput), ['countryScores']);
  const countryScoresSource = canonicalCountryScoresSource
    ?? legacyCountryScoresSource
    ?? fallbackCountryScoresSource
    ?? {};
  const consistencyChecksSource = readRecord(source, ['consistencyChecks'])
    ?? readRecord(source, ['consistency_checks'])
    ?? readRecord(asRecord(source.openaiAnalysis), ['consistencyChecks'])
    ?? null;
  const insightSummary = readString(source, ['insightSummary'])
    || readString(source, ['insight_summary', 'summary'])
    || readString(asRecord(source.openaiAnalysis), ['insightSummary', 'insight_summary', 'summary']);
  const confidenceNote = readString(source, ['confidenceNote'])
    || readString(source, ['confidence_note'])
    || readString(asRecord(source.openaiAnalysis), ['confidenceNote', 'confidence_note']);
  const analysisVersion = readString(source, ['analysisVersion'])
    || readString(source, ['analysis_version'])
    || readString(asRecord(source.openaiAnalysis), ['analysisVersion', 'analysis_version']);
  const rawResearchPayload = source.rawResearchPayload ? asRecord(source.rawResearchPayload) : {};
  const normalizedSources = readRecord(rawResearchPayload, ['normalizedSources']) ?? {};
  const requestMeta = readRecord(rawResearchPayload, ['request']) ?? {};
  const evidenceSpecies = {
    speciesKey,
    speciesName: normalizeUiText(readString(source, ['speciesName', 'species_name']) || normalizedName),
    latinName: normalizeUiText(readString(source, ['latinName', 'latin_name']) || readString(requestMeta, ['latinName', 'latin_name']) || ''),
    ebirdSpeciesCode: normalizeUiText(
      readString(source, ['ebirdSpeciesCode', 'ebird_species_code'])
      || readString(requestMeta, ['ebirdSpeciesCode', 'ebird_species_code'])
      || readString(asRecord(source.species), ['ebirdSpeciesCode', 'ebird_species_code'])
      || '',
    ),
  };
  const foreignEvidence = normalizeForeignEvidence(
    readArray(source, ['foreignEvidence']) ?? readArray(rawResearchPayload, ['foreignEvidence']),
  );
  const estoniaEvidence = normalizeEstoniaEvidence(
    readRecord(source, ['estoniaEvidence']) ?? readRecord(rawResearchPayload, ['estoniaEvidence']) ?? readRecord(normalizedSources, ['estoniaRecent']),
  );
  const historicalEvidence = normalizeHistoricalEvidence(
    readRecord(source, ['historicalEvidence']) ?? readRecord(rawResearchPayload, ['historicalEvidence']) ?? readRecord(normalizedSources, ['elurikkusHistory']),
  );
  const sourceHealth = normalizeSourceHealth(
    readRecord(source, ['sourceHealth']) ?? readRecord(rawResearchPayload, ['sourceHealth']),
  );
  const rawLinks = normalizeRawLinks(
    readRecord(source, ['rawLinks']) ?? readRecord(rawResearchPayload, ['rawLinks']),
    evidenceSpecies,
    foreignEvidence,
  );
  return {
    speciesKey,
    speciesName: evidenceSpecies.speciesName,
    scope,
    generatedAt: normalizeUiText(readString(source, ['generatedAt', 'generated_at']) || new Date().toISOString()),
    species: evidenceSpecies,
    ...(sourceHealth ? { sourceHealth } : {}),
    ...(foreignEvidence.length ? { foreignEvidence } : {}),
    ...(estoniaEvidence ? { estoniaEvidence } : {}),
    ...(historicalEvidence ? { historicalEvidence } : {}),
    ...(rawLinks ? { rawLinks } : {}),
    externalPressureScore: readNumber(source, ['externalPressureScore', 'external_pressure_score', 'pressureScore', 'pressure_score']),
    springFitScore: readNumber(source, ['springFitScore', 'spring_fit_score']),
    windSupportScore: readNumber(source, ['windSupportScore', 'wind_support_score']),
    routeVector: normalizeUiText(readString(source, ['routeVector', 'route_vector']) || ''),
    bestEntryZone: normalizeUiText(readString(source, ['bestEntryZone', 'best_entry_zone']) || ''),
    alreadyMissedRisk: resolvePredictionRisk(readString(source, ['alreadyMissedRisk', 'already_missed_risk'])),
    countryScores: {
      latvia: readNumber(countryScoresSource, ['latvia']),
      lithuania: readNumber(countryScoresSource, ['lithuania']),
      belarus: readNumber(countryScoresSource, ['belarus']),
      poland: readNumber(countryScoresSource, ['poland']),
      russia: readNumber(countryScoresSource, ['russia']),
      ...(hasValue(countryScoresSource, ['finlandContextOnly', 'finlandContext', 'finland_context_only', 'finland_context'])
        ? { finlandContextOnly: readNumber(countryScoresSource, ['finlandContextOnly', 'finlandContext', 'finland_context_only', 'finland_context']) }
        : {}),
    },
    topPredictedPoints,
    ...(insightSummary ? { insightSummary: normalizeUiText(insightSummary) } : {}),
    ...(analysisVersion ? { analysisVersion: normalizeUiText(analysisVersion) } : {}),
    ...(typeof source.analysisFallbackUsed === 'boolean' ? { analysisFallbackUsed: source.analysisFallbackUsed } : {}),
    ...(confidenceNote ? { confidenceNote: normalizeUiText(confidenceNote) } : {}),
    ...(warnings.length ? { warnings } : {}),
    ...(consistencyChecksSource ? { consistencyChecks: normalizePredictionConsistencyChecks(consistencyChecksSource) } : {}),
    ...(source.openaiAnalysis ? { openaiAnalysis: source.openaiAnalysis as SpeciesPredictionAnalysis } : {}),
    ...(source.rawResearchPayload ? { rawResearchPayload: rawResearchPayload } : {}),
  };
}

export function hasUsableSpeciesPredictionResult(
  input: Partial<SpeciesPredictionResult> | null | undefined,
): boolean {
  if (!input || typeof input !== 'object') return false;
  const speciesKey = normalizeSpeciesName(input.speciesKey || '');
  const speciesName = normalizeUiText(input.speciesName || '');
  const generatedAt = normalizeUiText(input.generatedAt || '');
  const evidenceRecord = asRecord(input);
  const hasEvidencePayload = Boolean(
    hasValue(evidenceRecord, ['foreignEvidence'])
    || hasValue(evidenceRecord, ['estoniaEvidence'])
    || hasValue(evidenceRecord, ['historicalEvidence'])
    || hasValue(evidenceRecord, ['sourceHealth'])
    || hasValue(evidenceRecord, ['topPredictedPoints']),
  );
  return Boolean(speciesKey && speciesName && generatedAt && hasEvidencePayload);
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function resolvePredictionSource(input: Partial<SpeciesPredictionResult> | null | undefined): Record<string, unknown> {
  const source = asRecord(input);
  const nestedResult = asRecord(source.result);
  if (hasCanonicalPredictionFields(nestedResult)) return nestedResult;
  return source;
}

function hasCanonicalPredictionFields(record: Record<string, unknown>): boolean {
  return Boolean(
    readString(record, ['insightSummary'])
    || hasValue(record, ['confidenceNote'])
    || hasValue(record, ['warnings'])
    || hasValue(record, ['consistencyChecks'])
    || hasValue(record, ['externalPressureScore'])
    || hasValue(record, ['springFitScore'])
    || hasValue(record, ['windSupportScore'])
    || hasValue(record, ['routeVector'])
    || hasValue(record, ['bestEntryZone'])
    || hasValue(record, ['alreadyMissedRisk'])
    || hasValue(record, ['countryScores'])
    || hasValue(record, ['topPredictedPoints']),
    || hasValue(record, ['foreignEvidence'])
    || hasValue(record, ['estoniaEvidence'])
    || hasValue(record, ['historicalEvidence'])
    || hasValue(record, ['sourceHealth']),
  );
}

function readString(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  const source = asRecord(record);
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function readNumber(record: Record<string, unknown> | null | undefined, keys: string[]): number {
  const source = asRecord(record);
  for (const key of keys) {
    const value = source[key];
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function readRecord(record: Record<string, unknown> | null | undefined, keys: string[]): Record<string, unknown> | null {
  const source = asRecord(record);
  for (const key of keys) {
    const value = asRecord(source[key]);
    if (Object.keys(value).length) return value;
  }
  return null;
}

function readArray(record: Record<string, unknown> | null | undefined, keys: string[]): unknown[] | null {
  const source = asRecord(record);
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function hasValue(record: Record<string, unknown> | null | undefined, keys: string[]): boolean {
  const source = asRecord(record);
  return keys.some((key) => source[key] != null);
}

function resolvePredictionRisk(value: string): PredictionRisk {
  return value === 'high' || value === 'medium' ? value : 'low';
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
  const source = asRecord(point);
  const rankValue = hasValue(source, ['rank']) ? readNumber(source, ['rank']) : index + 1;
  return {
    rank: clampNumber(rankValue, 1, 99, index + 1),
    name: normalizeUiText(readString(source, ['name']) || ''),
    countyOrParish: normalizeUiText(readString(source, ['countyOrParish', 'county_or_parish', 'county', 'parish']) || ''),
    lat: readNumber(source, ['lat', 'latitude']),
    lon: readNumber(source, ['lon', 'lng', 'longitude']),
    confidence: clampFloat(readNumber(source, ['confidence', 'score']), 0, 100, 0),
    eta: normalizeUiText(readString(source, ['eta']) || ''),
    searchRadiusKm: clampNumber(readNumber(source, ['searchRadiusKm', 'search_radius_km', 'radiusKm', 'radius_km']), 0, 500, 0),
    habitatCue: normalizeUiText(readString(source, ['habitatCue', 'habitat_cue']) || ''),
    reason: normalizeUiText(readString(source, ['reason', 'explanation']) || ''),
    ...(Array.isArray(source.supportingCountries)
      ? { supportingCountries: source.supportingCountries.map((value) => normalizeUiText(String(value || ''))).filter(Boolean) }
      : {}),
    ...(hasValue(source, ['nearestRelevantClusterKm', 'nearest_relevant_cluster_km'])
      ? { nearestRelevantClusterKm: clampFloat(readNumber(source, ['nearestRelevantClusterKm', 'nearest_relevant_cluster_km']), 0, 5000, 0) }
      : {}),
    ...(readString(source, ['latestRelevantForeignDate', 'latest_relevant_foreign_date'])
      ? { latestRelevantForeignDate: normalizeUiText(readString(source, ['latestRelevantForeignDate', 'latest_relevant_foreign_date'])) }
      : {}),
    ...(readString(source, ['historicalMatch', 'historical_match'])
      ? { historicalMatch: normalizeUiText(readString(source, ['historicalMatch', 'historical_match'])) }
      : {}),
    ...(readString(source, ['estoniaPresenceSignal', 'estonia_presence_signal'])
      ? { estoniaPresenceSignal: normalizeUiText(readString(source, ['estoniaPresenceSignal', 'estonia_presence_signal'])) }
      : {}),
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

function normalizeForeignEvidence(input: unknown[] | null): SpeciesPredictionForeignEvidenceGroup[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry) => {
    const source = asRecord(entry);
    const topClustersSource = readArray(source, ['topClusters', 'top_clusters']) ?? [];
    return {
      countryCode: normalizeUiText(readString(source, ['countryCode', 'country_code']) || '').toLowerCase(),
      countryName: normalizeUiText(readString(source, ['countryName', 'country_name']) || ''),
      recordCount7d: clampNumber(readNumber(source, ['recordCount7d', 'record_count_7d']), 0, 999999, 0),
      recordCount30d: clampNumber(readNumber(source, ['recordCount30d', 'record_count_30d']), 0, 999999, 0),
      nearestDistanceKm: clampFloat(readNumber(source, ['nearestDistanceKm', 'nearest_distance_km']), 0, 999999, 0),
      latestDate: normalizeUiText(readString(source, ['latestDate', 'latest_date']) || ''),
      clusterCount: clampNumber(readNumber(source, ['clusterCount', 'cluster_count']), 0, 999999, 0),
      topClusters: topClustersSource.slice(0, 3).map((cluster) => {
        const clusterRecord = asRecord(cluster);
        return {
          lat: readNumber(clusterRecord, ['lat', 'latitude']),
          lon: readNumber(clusterRecord, ['lon', 'lng', 'longitude']),
          lastDate: normalizeUiText(readString(clusterRecord, ['lastDate', 'last_date']) || ''),
          count7d: clampNumber(readNumber(clusterRecord, ['count7d', 'count_7d']), 0, 999999, 0),
          source: normalizeUiText(readString(clusterRecord, ['source']) || ''),
          ...(readString(clusterRecord, ['label']) ? { label: normalizeUiText(readString(clusterRecord, ['label'])) } : {}),
        };
      }),
    };
  }).filter((entry) => entry.countryCode || entry.countryName);
}

function normalizeEstoniaEvidence(input: Record<string, unknown> | null): SpeciesPredictionEstoniaEvidence | undefined {
  if (!input || !Object.keys(input).length) return undefined;
  return {
    recentCount7d: clampNumber(readNumber(input, ['recentCount7d', 'recent_count_7d']), 0, 999999, 0),
    recentCount30d: clampNumber(readNumber(input, ['recentCount30d', 'recent_count_30d']), 0, 999999, 0),
    latestEstoniaDate: normalizeUiText(readString(input, ['latestEstoniaDate', 'latest_estonia_date', 'latestDate', 'latest_date']) || ''),
    latestEstoniaLat: hasValue(input, ['latestEstoniaLat', 'latest_estonia_lat', 'latestLat', 'latest_lat'])
      ? clampFloat(readNumber(input, ['latestEstoniaLat', 'latest_estonia_lat', 'latestLat', 'latest_lat']), -90, 90, 0)
      : null,
    latestEstoniaLon: hasValue(input, ['latestEstoniaLon', 'latest_estonia_lon', 'latestLon', 'latest_lon'])
      ? clampFloat(readNumber(input, ['latestEstoniaLon', 'latest_estonia_lon', 'latestLon', 'latest_lon']), -180, 180, 0)
      : null,
    alreadyPresent: input.alreadyPresent === true,
    alreadyPassed: input.alreadyPassed === true,
  };
}

function normalizeHistoricalEvidence(input: Record<string, unknown> | null): SpeciesPredictionHistoricalEvidence | undefined {
  if (!input || !Object.keys(input).length) return undefined;
  const topHistoricalHotspotsSource = readArray(input, ['topHistoricalHotspots', 'top_historical_hotspots', 'historicalHotspots', 'historical_hotspots']) ?? [];
  const habitatHintsSource = readArray(input, ['habitatHints', 'habitat_hints']) ?? [];
  return {
    springWindow: normalizeUiText(readString(input, ['springWindow', 'spring_window', 'arrivalWindow', 'arrival_window']) || ''),
    topHistoricalHotspots: topHistoricalHotspotsSource.map((point, index) => normalizePredictedPoint(asRecord(point), index)).filter((point) => point.name || point.reason),
    habitatHints: habitatHintsSource.map((hint) => normalizeUiText(String(hint || ''))).filter(Boolean),
  };
}

function normalizeSourceHealth(input: Record<string, unknown> | null): SpeciesPredictionSourceHealth | undefined {
  if (!input || !Object.keys(input).length) return undefined;
  const warnings = readArray(input, ['sourceWarnings', 'source_warnings']) ?? [];
  return {
    primarySourceUsed: normalizeUiText(readString(input, ['primarySourceUsed', 'primary_source_used']) || ''),
    sourceWarnings: warnings.map((warning) => normalizeUiText(String(warning || ''))).filter(Boolean),
    elurikkusAvailable: input.elurikkusAvailable === true,
    ebirdAvailable: input.ebirdAvailable === true,
    gbifFallbackUsed: input.gbifFallbackUsed === true,
  };
}

function normalizeRawLinks(
  input: Record<string, unknown> | null,
  species: { speciesName: string },
  foreignEvidence: SpeciesPredictionForeignEvidenceGroup[],
): SpeciesPredictionResult['rawLinks'] | undefined {
  const source = input ?? {};
  const elurikkusSearchUrl = normalizeUiText(readString(source, ['elurikkusSearchUrl', 'elurikkus_search_url']) || '')
    || (species.speciesName ? `https://elurikkus.ee/app/occurrences/search?text=${encodeURIComponent(species.speciesName)}` : '');
  const countrySourceUrls = readRecord(source, ['countrySourceUrls', 'country_source_urls']) ?? {};
  const normalizedCountryUrls = Object.fromEntries(
    Object.entries(countrySourceUrls)
      .map(([key, value]) => [key, normalizeUiText(String(value || ''))])
      .filter((entry) => entry[1]),
  );
  if (!elurikkusSearchUrl && !Object.keys(normalizedCountryUrls).length && !foreignEvidence.length) return undefined;
  return {
    elurikkusSearchUrl,
    ...(Object.keys(normalizedCountryUrls).length ? { countrySourceUrls: normalizedCountryUrls } : {}),
  };
}
