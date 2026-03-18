import { LINNULIIGID_SCOPE, RARILIIN_SCOPE, type SpeciesScopeConfig, type SpeciesScopeId } from '@/lib/mapScope';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';

export type PredictionMode = 'broad_area' | 'hotspot' | 'precise_hotspot';
export type SummaryStyle = 'short' | 'analytical' | 'field_use';
export type PredictionRequestType = 'prediction' | 'insight' | 'prediction_and_insight';
export type PredictionRisk = 'low' | 'medium' | 'high';
export type PredictionLayerMode = 'legacy' | 'map_first';

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
  predictionLayerMode: PredictionLayerMode;
  horizonDays: number;
  showPredictionCone: boolean;
  useRegionalTargets: boolean;
  recentOnlyMapMarkers: boolean;
  snapToBestTarget: boolean;
  autoFeedEnabled: boolean;
  updatedAt: string;
};

export type SpeciesPredictionPointAge = 'recent' | 'historical';

export type SpeciesPredictionEstoniaHistoryPoint = {
  lat: number;
  lon: number;
  eventDate: string;
  daysAgo: number | null;
  ageClass: SpeciesPredictionPointAge;
  source: 'GBIF' | 'Elurikkus';
  occurrenceId?: string;
  locality?: string;
  municipality?: string;
  count?: number;
};

export type SpeciesPredictionEstoniaHistoryCluster = {
  id: string;
  lat: number;
  lon: number;
  count: number;
  recentCount: number;
  newestEventDate: string;
  oldestEventDate: string;
  locality?: string;
  municipality?: string;
  displayName?: string;
  representativeLat?: number;
  representativeLon?: number;
  representativePointMethod?: string;
  habitatCue?: string;
  habitatType?: string;
  habitatScore?: number;
  coastalDistanceKm?: number;
  source: 'GBIF' | 'Elurikkus' | 'mixed';
  sourceBreakdown?: Record<string, number>;
};

export type SpeciesPredictionForeignRecentPoint = {
  lat: number;
  lon: number;
  obsDt: string;
  locName: string;
  howMany: number | null;
  countryCode: string;
  countryName: string;
  regionCode?: string;
  regionName?: string;
  source: 'eBird';
  daysAgo: number;
  clusterId?: string;
  distanceToEstoniaKm?: number;
};

export type SpeciesPredictionForeignCluster = {
  id: string;
  lat: number;
  lon: number;
  pointCount: number;
  newestObsDt: string;
  oldestObsDt: string;
  freshestDaysAgo: number;
  averageDaysAgo: number;
  totalHowMany: number;
  countries: string[];
  countryCodes: string[];
  locNames: string[];
  nearestDistanceKm: number;
  isFreshest: boolean;
};

export type SpeciesPredictionWeather = {
  fetchedAt: string;
  windSpeedKph: number;
  windDirectionDeg: number;
  windDirectionLabel: string;
  precipitationMm?: number;
  temperatureC?: number;
  weatherAvailable?: boolean;
  weatherPartial?: boolean;
  wasWeatherUsedInRanking?: boolean;
  error?: string;
  source: 'Open-Meteo';
};

export type SpeciesPredictionVector = {
  id: string;
  kind: 'route' | 'cone' | 'target_link';
  sourceClusterId?: string;
  targetRank?: number;
  confidence: number;
  bearingDeg: number;
  distanceKm: number;
  points: Array<{ lat: number; lon: number }>;
};

export type SpeciesPredictionLayerToggles = {
  estoniaHistory: boolean;
  estoniaHistoryPoints?: boolean;
  estoniaHistoryClusters?: boolean;
  foreignEvidence: boolean;
  foreignRecentPoints?: boolean;
  foreignPressureClusters?: boolean;
  predictedLines: boolean;
  predictedCone: boolean;
  predictedTargets: boolean;
  diagnostics?: boolean;
  recentOnly: boolean;
};

export type PredictedPoint = {
  rank: number;
  name: string;
  displayName?: string;
  displayNameSource?: string;
  countyOrParish: string;
  displayCountyOrParish?: string;
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
  derivedFromClusterId?: string;
  supportingEstoniaHistoryCount?: number;
  latestSupportingEstoniaDate?: string;
  windAdjusted?: boolean;
  sourceType?: string;
  representativePointMethod?: string;
  coordinateSource?: string;
  supportingPointCount?: number;
  usedForeignPressure?: boolean;
  habitatFilterAdjustedRanking?: boolean;
  vectorsSuppressed?: boolean;
  rankingMode?: string;
  rawClusterId?: string;
  habitatFitScore?: number;
  historySupportScore?: number;
  foreignSupportScore?: number;
  weatherSupportScore?: number;
  confidenceBeforeCap?: number;
  confidenceAfterCap?: number;
};

export type SpeciesPredictionEvidenceSummary = {
  dataSourcesUsed?: string[];
  activeEvidenceUsed?: string[];
  attemptedButNotUsed?: string[];
  foreignEbirdAvailable?: boolean;
  weatherAvailable?: boolean;
  weatherPartial?: boolean;
  wasWeatherUsedInRanking?: boolean;
  rankingMode?: string;
  summaryText?: string;
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
  evidenceSummary?: SpeciesPredictionEvidenceSummary;
  estoniaHistoryPoints?: SpeciesPredictionEstoniaHistoryPoint[];
  estoniaHistoryClusters?: SpeciesPredictionEstoniaHistoryCluster[];
  foreignRecentPoints?: SpeciesPredictionForeignRecentPoint[];
  foreignClusters?: SpeciesPredictionForeignCluster[];
  weather?: SpeciesPredictionWeather;
  predictionVectors?: SpeciesPredictionVector[];
  predictedTargets?: PredictedPoint[];
  mapLayers?: SpeciesPredictionLayerToggles;
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
  aiSummary?: string;
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
    predictionLayerMode: 'map_first',
    horizonDays: 7,
    showPredictionCone: true,
    useRegionalTargets: true,
    recentOnlyMapMarkers: false,
    snapToBestTarget: true,
    autoFeedEnabled: false,
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
    predictionLayerMode: isPredictionLayerMode(input?.predictionLayerMode) ? input.predictionLayerMode : defaults.predictionLayerMode,
    horizonDays: coalesceNumber(input?.horizonDays, legacyAutomation.horizonDays, defaults.horizonDays),
    showPredictionCone: coalesceBoolean(input?.showPredictionCone, legacyAutomation.showPredictionCone, defaults.showPredictionCone),
    useRegionalTargets: coalesceBoolean(input?.useRegionalTargets, legacyAutomation.useRegionalTargets, defaults.useRegionalTargets),
    recentOnlyMapMarkers: coalesceBoolean(input?.recentOnlyMapMarkers, legacyAutomation.recentOnlyMapMarkers, defaults.recentOnlyMapMarkers),
    snapToBestTarget: coalesceBoolean(input?.snapToBestTarget, legacyAutomation.snapToBestTarget, defaults.snapToBestTarget),
    autoFeedEnabled: coalesceBoolean(input?.autoFeedEnabled, legacyAutomation.autoFeedEnabled, defaults.autoFeedEnabled),
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
  next.horizonDays = clampNumber(next.horizonDays, 1, 30, defaults.horizonDays);
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
  const evidenceSummary = normalizeEvidenceSummary(
    readRecord(source, ['evidenceSummary']) ?? readRecord(rawResearchPayload, ['evidenceSummary']),
  );
  const estoniaHistoryPoints = normalizeEstoniaHistoryPoints(
    readArray(source, ['estoniaHistoryPoints', 'estonia_history_points'])
      ?? readArray(rawResearchPayload, ['estoniaHistoryPoints', 'estonia_history_points']),
  );
  const estoniaHistoryClusters = normalizeEstoniaHistoryClusters(
    readArray(source, ['estoniaHistoryClusters', 'estonia_history_clusters'])
      ?? readArray(rawResearchPayload, ['estoniaHistoryClusters', 'estonia_history_clusters']),
  );
  const foreignRecentPoints = normalizeForeignRecentPoints(
    readArray(source, ['foreignRecentPoints', 'foreign_recent_points'])
      ?? readArray(rawResearchPayload, ['foreignRecentPoints', 'foreign_recent_points']),
  );
  const foreignClusters = normalizeForeignClusters(
    readArray(source, ['foreignClusters', 'foreign_clusters'])
      ?? readArray(rawResearchPayload, ['foreignClusters', 'foreign_clusters']),
  );
  const weather = normalizeWeather(
    readRecord(source, ['weather']) ?? readRecord(rawResearchPayload, ['weather']),
  );
  const predictionVectors = normalizePredictionVectors(
    readArray(source, ['predictionVectors', 'prediction_vectors'])
      ?? readArray(rawResearchPayload, ['predictionVectors', 'prediction_vectors']),
  );
  const predictedTargets = Array.isArray(readArray(source, ['predictedTargets', 'predicted_targets']))
    ? (readArray(source, ['predictedTargets', 'predicted_targets']) as unknown[]).map((point, index) => normalizePredictedPoint(asRecord(point), index))
    : [];
  const mapLayers = normalizeMapLayers(
    readRecord(source, ['mapLayers', 'map_layers']) ?? readRecord(rawResearchPayload, ['mapLayers', 'map_layers']),
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
    ...(evidenceSummary ? { evidenceSummary } : {}),
    ...(estoniaHistoryPoints.length ? { estoniaHistoryPoints } : {}),
    ...(estoniaHistoryClusters.length ? { estoniaHistoryClusters } : {}),
    ...(foreignRecentPoints.length ? { foreignRecentPoints } : {}),
    ...(foreignClusters.length ? { foreignClusters } : {}),
    ...(weather ? { weather } : {}),
    ...(predictionVectors.length ? { predictionVectors } : {}),
    ...(predictedTargets.length ? { predictedTargets } : {}),
    ...(mapLayers ? { mapLayers } : {}),
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
    ...(predictedTargets.length && !topPredictedPoints.length ? { topPredictedPoints: predictedTargets } : {}),
    ...(insightSummary ? { insightSummary: normalizeUiText(insightSummary) } : {}),
    ...(analysisVersion ? { analysisVersion: normalizeUiText(analysisVersion) } : {}),
    ...(typeof source.analysisFallbackUsed === 'boolean' ? { analysisFallbackUsed: source.analysisFallbackUsed } : {}),
    ...(confidenceNote ? { confidenceNote: normalizeUiText(confidenceNote) } : {}),
    ...(warnings.length ? { warnings } : {}),
    ...(consistencyChecksSource ? { consistencyChecks: normalizePredictionConsistencyChecks(consistencyChecksSource) } : {}),
    ...(source.openaiAnalysis ? { openaiAnalysis: source.openaiAnalysis as SpeciesPredictionAnalysis } : {}),
    ...(normalizeUiText(readString(source, ['aiSummary', 'ai_summary']) || readString(asRecord(source.openaiAnalysis), ['insightSummary']))
      ? { aiSummary: normalizeUiText(readString(source, ['aiSummary', 'ai_summary']) || readString(asRecord(source.openaiAnalysis), ['insightSummary'])) }
      : {}),
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
    || hasValue(evidenceRecord, ['topPredictedPoints'])
    || hasValue(evidenceRecord, ['predictedTargets'])
    || hasValue(evidenceRecord, ['estoniaHistoryPoints'])
    || hasValue(evidenceRecord, ['estoniaHistoryClusters'])
    || hasValue(evidenceRecord, ['foreignRecentPoints'])
    || hasValue(evidenceRecord, ['foreignClusters'])
    || hasValue(evidenceRecord, ['predictionVectors'])
    || hasValue(evidenceRecord, ['weather'])
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
    || hasValue(record, ['topPredictedPoints'])
    || hasValue(record, ['foreignEvidence'])
    || hasValue(record, ['estoniaEvidence'])
    || hasValue(record, ['historicalEvidence'])
    || hasValue(record, ['sourceHealth'])
    || hasValue(record, ['predictedTargets'])
    || hasValue(record, ['estoniaHistoryPoints'])
    || hasValue(record, ['estoniaHistoryClusters'])
    || hasValue(record, ['foreignRecentPoints'])
    || hasValue(record, ['foreignClusters'])
    || hasValue(record, ['predictionVectors'])
    || hasValue(record, ['weather'])
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

function isPredictionLayerMode(value: unknown): value is PredictionLayerMode {
  return value === 'legacy' || value === 'map_first';
}

function normalizePredictedPoint(point: Partial<PredictedPoint> | null | undefined, index: number): PredictedPoint {
  const source = asRecord(point);
  const rankValue = hasValue(source, ['rank']) ? readNumber(source, ['rank']) : index + 1;
  return {
    rank: clampNumber(rankValue, 1, 99, index + 1),
    name: normalizeUiText(readString(source, ['name']) || ''),
    ...(readString(source, ['displayName', 'display_name']) ? { displayName: normalizeUiText(readString(source, ['displayName', 'display_name'])) } : {}),
    ...(readString(source, ['displayNameSource', 'display_name_source']) ? { displayNameSource: normalizeUiText(readString(source, ['displayNameSource', 'display_name_source'])) } : {}),
    countyOrParish: normalizeUiText(readString(source, ['countyOrParish', 'county_or_parish', 'county', 'parish']) || ''),
    ...(readString(source, ['displayCountyOrParish', 'display_county_or_parish']) ? { displayCountyOrParish: normalizeUiText(readString(source, ['displayCountyOrParish', 'display_county_or_parish'])) } : {}),
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
    ...(readString(source, ['derivedFromClusterId', 'derived_from_cluster_id'])
      ? { derivedFromClusterId: normalizeUiText(readString(source, ['derivedFromClusterId', 'derived_from_cluster_id'])) }
      : {}),
    ...(hasValue(source, ['supportingEstoniaHistoryCount', 'supporting_estonia_history_count'])
      ? { supportingEstoniaHistoryCount: clampNumber(readNumber(source, ['supportingEstoniaHistoryCount', 'supporting_estonia_history_count']), 0, 999999, 0) }
      : {}),
    ...(readString(source, ['latestSupportingEstoniaDate', 'latest_supporting_estonia_date'])
      ? { latestSupportingEstoniaDate: normalizeUiText(readString(source, ['latestSupportingEstoniaDate', 'latest_supporting_estonia_date'])) }
      : {}),
    ...(typeof source.windAdjusted === 'boolean'
      ? { windAdjusted: source.windAdjusted === true }
      : {}),
    ...(readString(source, ['sourceType', 'source_type']) ? { sourceType: normalizeUiText(readString(source, ['sourceType', 'source_type'])) } : {}),
    ...(readString(source, ['representativePointMethod', 'representative_point_method']) ? { representativePointMethod: normalizeUiText(readString(source, ['representativePointMethod', 'representative_point_method'])) } : {}),
    ...(readString(source, ['coordinateSource', 'coordinate_source']) ? { coordinateSource: normalizeUiText(readString(source, ['coordinateSource', 'coordinate_source'])) } : {}),
    ...(hasValue(source, ['supportingPointCount', 'supporting_point_count'])
      ? { supportingPointCount: clampNumber(readNumber(source, ['supportingPointCount', 'supporting_point_count']), 0, 999999, 0) }
      : {}),
    ...(typeof source.usedForeignPressure === 'boolean' ? { usedForeignPressure: source.usedForeignPressure === true } : {}),
    ...(typeof source.habitatFilterAdjustedRanking === 'boolean' ? { habitatFilterAdjustedRanking: source.habitatFilterAdjustedRanking === true } : {}),
    ...(typeof source.vectorsSuppressed === 'boolean' ? { vectorsSuppressed: source.vectorsSuppressed === true } : {}),
    ...(readString(source, ['rankingMode', 'ranking_mode']) ? { rankingMode: normalizeUiText(readString(source, ['rankingMode', 'ranking_mode'])) } : {}),
    ...(readString(source, ['rawClusterId', 'raw_cluster_id']) ? { rawClusterId: normalizeUiText(readString(source, ['rawClusterId', 'raw_cluster_id'])) } : {}),
    ...(hasValue(source, ['habitatFitScore', 'habitat_fit_score']) ? { habitatFitScore: clampFloat(readNumber(source, ['habitatFitScore', 'habitat_fit_score']), -999999, 999999, 0) } : {}),
    ...(hasValue(source, ['historySupportScore', 'history_support_score']) ? { historySupportScore: clampFloat(readNumber(source, ['historySupportScore', 'history_support_score']), -999999, 999999, 0) } : {}),
    ...(hasValue(source, ['foreignSupportScore', 'foreign_support_score']) ? { foreignSupportScore: clampFloat(readNumber(source, ['foreignSupportScore', 'foreign_support_score']), -999999, 999999, 0) } : {}),
    ...(hasValue(source, ['weatherSupportScore', 'weather_support_score']) ? { weatherSupportScore: clampFloat(readNumber(source, ['weatherSupportScore', 'weather_support_score']), -999999, 999999, 0) } : {}),
    ...(hasValue(source, ['confidenceBeforeCap', 'confidence_before_cap']) ? { confidenceBeforeCap: clampFloat(readNumber(source, ['confidenceBeforeCap', 'confidence_before_cap']), -999999, 999999, 0) } : {}),
    ...(hasValue(source, ['confidenceAfterCap', 'confidence_after_cap']) ? { confidenceAfterCap: clampFloat(readNumber(source, ['confidenceAfterCap', 'confidence_after_cap']), -999999, 999999, 0) } : {}),
  };
}

function normalizeEvidenceSummary(input: Record<string, unknown> | null): SpeciesPredictionEvidenceSummary | undefined {
  if (!input || !Object.keys(input).length) return undefined;
  const dataSourcesUsed = (readArray(input, ['dataSourcesUsed', 'data_sources_used']) ?? [])
    .map((item) => normalizeUiText(String(item || '')))
    .filter(Boolean);
  return {
    ...(dataSourcesUsed.length ? { dataSourcesUsed } : {}),
    ...(Array.isArray(readArray(input, ['activeEvidenceUsed', 'active_evidence_used'])) ? { activeEvidenceUsed: (readArray(input, ['activeEvidenceUsed', 'active_evidence_used']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(Array.isArray(readArray(input, ['attemptedButNotUsed', 'attempted_but_not_used'])) ? { attemptedButNotUsed: (readArray(input, ['attemptedButNotUsed', 'attempted_but_not_used']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(typeof input.foreignEbirdAvailable === 'boolean' ? { foreignEbirdAvailable: input.foreignEbirdAvailable === true } : {}),
    ...(typeof input.weatherAvailable === 'boolean' ? { weatherAvailable: input.weatherAvailable === true } : {}),
    ...(typeof input.weatherPartial === 'boolean' ? { weatherPartial: input.weatherPartial === true } : {}),
    ...(typeof input.wasWeatherUsedInRanking === 'boolean' ? { wasWeatherUsedInRanking: input.wasWeatherUsedInRanking === true } : {}),
    ...(readString(input, ['rankingMode', 'ranking_mode']) ? { rankingMode: normalizeUiText(readString(input, ['rankingMode', 'ranking_mode'])) } : {}),
    ...(readString(input, ['summaryText', 'summary_text']) ? { summaryText: normalizeUiText(readString(input, ['summaryText', 'summary_text'])) } : {}),
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

function normalizeEstoniaHistoryPoints(input: unknown[] | null): SpeciesPredictionEstoniaHistoryPoint[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry) => {
    const source = asRecord(entry);
    const daysAgo = hasValue(source, ['daysAgo', 'days_ago']) ? clampNumber(readNumber(source, ['daysAgo', 'days_ago']), 0, 100000, 0) : null;
    return {
      lat: clampFloat(readNumber(source, ['lat', 'latitude']), -90, 90, 0),
      lon: clampFloat(readNumber(source, ['lon', 'lng', 'longitude']), -180, 180, 0),
      eventDate: normalizeUiText(readString(source, ['eventDate', 'event_date', 'obsDt']) || ''),
      daysAgo,
      ageClass: normalizeUiText(readString(source, ['ageClass', 'age_class']) || '') === 'recent' ? 'recent' : 'historical',
      source: normalizeUiText(readString(source, ['source']) || '') === 'Elurikkus' ? 'Elurikkus' : 'GBIF',
      ...(readString(source, ['occurrenceId', 'occurrence_id']) ? { occurrenceId: normalizeUiText(readString(source, ['occurrenceId', 'occurrence_id'])) } : {}),
      ...(readString(source, ['locality']) ? { locality: normalizeUiText(readString(source, ['locality'])) } : {}),
      ...(readString(source, ['municipality']) ? { municipality: normalizeUiText(readString(source, ['municipality'])) } : {}),
      ...(hasValue(source, ['count']) ? { count: clampNumber(readNumber(source, ['count']), 1, 999999, 1) } : {}),
    };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon) && (point.lat !== 0 || point.lon !== 0));
}

function normalizeForeignRecentPoints(input: unknown[] | null): SpeciesPredictionForeignRecentPoint[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry) => {
    const source = asRecord(entry);
    return {
      lat: clampFloat(readNumber(source, ['lat', 'latitude']), -90, 90, 0),
      lon: clampFloat(readNumber(source, ['lon', 'lng', 'longitude']), -180, 180, 0),
      obsDt: normalizeUiText(readString(source, ['obsDt', 'obs_dt', 'eventDate', 'event_date']) || ''),
      locName: normalizeUiText(readString(source, ['locName', 'loc_name', 'label']) || ''),
      howMany: hasValue(source, ['howMany', 'how_many']) ? clampNumber(readNumber(source, ['howMany', 'how_many']), 0, 999999, 0) : null,
      countryCode: normalizeUiText(readString(source, ['countryCode', 'country_code']) || '').toLowerCase(),
      countryName: normalizeUiText(readString(source, ['countryName', 'country_name']) || ''),
      ...(readString(source, ['regionCode', 'region_code']) ? { regionCode: normalizeUiText(readString(source, ['regionCode', 'region_code'])) } : {}),
      ...(readString(source, ['regionName', 'region_name']) ? { regionName: normalizeUiText(readString(source, ['regionName', 'region_name'])) } : {}),
      source: 'eBird',
      daysAgo: clampNumber(readNumber(source, ['daysAgo', 'days_ago']), 0, 100000, 0),
      ...(readString(source, ['clusterId', 'cluster_id']) ? { clusterId: normalizeUiText(readString(source, ['clusterId', 'cluster_id'])) } : {}),
      ...(hasValue(source, ['distanceToEstoniaKm', 'distance_to_estonia_km']) ? { distanceToEstoniaKm: clampFloat(readNumber(source, ['distanceToEstoniaKm', 'distance_to_estonia_km']), 0, 999999, 0) } : {}),
    };
  }).filter((point) => point.countryCode && (point.lat !== 0 || point.lon !== 0));
}

function normalizeEstoniaHistoryClusters(input: unknown[] | null): SpeciesPredictionEstoniaHistoryCluster[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry, index) => {
    const source = asRecord(entry);
    const sourceBreakdown = readRecord(source, ['sourceBreakdown', 'source_breakdown']) ?? {};
    return {
      id: normalizeUiText(readString(source, ['id']) || `ee-cluster-${index + 1}`),
      lat: clampFloat(readNumber(source, ['lat', 'latitude']), -90, 90, 0),
      lon: clampFloat(readNumber(source, ['lon', 'lng', 'longitude']), -180, 180, 0),
      count: clampNumber(readNumber(source, ['count']), 1, 999999, 1),
      recentCount: clampNumber(readNumber(source, ['recentCount', 'recent_count']), 0, 999999, 0),
      newestEventDate: normalizeUiText(readString(source, ['newestEventDate', 'newest_event_date']) || ''),
      oldestEventDate: normalizeUiText(readString(source, ['oldestEventDate', 'oldest_event_date']) || ''),
      ...(readString(source, ['locality']) ? { locality: normalizeUiText(readString(source, ['locality'])) } : {}),
      ...(readString(source, ['municipality']) ? { municipality: normalizeUiText(readString(source, ['municipality'])) } : {}),
      ...(readString(source, ['displayName', 'display_name']) ? { displayName: normalizeUiText(readString(source, ['displayName', 'display_name'])) } : {}),
      ...(hasValue(source, ['representativeLat', 'representative_lat']) ? { representativeLat: clampFloat(readNumber(source, ['representativeLat', 'representative_lat']), -90, 90, 0) } : {}),
      ...(hasValue(source, ['representativeLon', 'representative_lon']) ? { representativeLon: clampFloat(readNumber(source, ['representativeLon', 'representative_lon']), -180, 180, 0) } : {}),
      ...(readString(source, ['representativePointMethod', 'representative_point_method']) ? { representativePointMethod: normalizeUiText(readString(source, ['representativePointMethod', 'representative_point_method'])) } : {}),
      ...(readString(source, ['habitatCue', 'habitat_cue']) ? { habitatCue: normalizeUiText(readString(source, ['habitatCue', 'habitat_cue'])) } : {}),
      ...(readString(source, ['habitatType', 'habitat_type']) ? { habitatType: normalizeUiText(readString(source, ['habitatType', 'habitat_type'])) } : {}),
      ...(hasValue(source, ['habitatScore', 'habitat_score']) ? { habitatScore: clampFloat(readNumber(source, ['habitatScore', 'habitat_score']), -999999, 999999, 0) } : {}),
      ...(hasValue(source, ['coastalDistanceKm', 'coastal_distance_km']) ? { coastalDistanceKm: clampFloat(readNumber(source, ['coastalDistanceKm', 'coastal_distance_km']), 0, 999999, 0) } : {}),
      source: normalizeClusterSource(readString(source, ['source'])),
      ...(Object.keys(sourceBreakdown).length
        ? { sourceBreakdown: Object.fromEntries(Object.entries(sourceBreakdown).map(([key, value]) => [normalizeUiText(key), clampNumber(Number(value), 0, 999999, 0)])) }
        : {}),
    };
  }).filter((cluster) => cluster.id && (cluster.lat !== 0 || cluster.lon !== 0));
}

function normalizeForeignClusters(input: unknown[] | null): SpeciesPredictionForeignCluster[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry, index) => {
    const source = asRecord(entry);
    const countries = readArray(source, ['countries']) ?? [];
    const countryCodes = readArray(source, ['countryCodes', 'country_codes']) ?? [];
    const locNames = readArray(source, ['locNames', 'loc_names']) ?? [];
    return {
      id: normalizeUiText(readString(source, ['id']) || `cluster-${index + 1}`),
      lat: clampFloat(readNumber(source, ['lat', 'latitude']), -90, 90, 0),
      lon: clampFloat(readNumber(source, ['lon', 'lng', 'longitude']), -180, 180, 0),
      pointCount: clampNumber(readNumber(source, ['pointCount', 'point_count']), 1, 999999, 1),
      newestObsDt: normalizeUiText(readString(source, ['newestObsDt', 'newest_obs_dt']) || ''),
      oldestObsDt: normalizeUiText(readString(source, ['oldestObsDt', 'oldest_obs_dt']) || ''),
      freshestDaysAgo: clampNumber(readNumber(source, ['freshestDaysAgo', 'freshest_days_ago']), 0, 100000, 0),
      averageDaysAgo: clampFloat(readNumber(source, ['averageDaysAgo', 'average_days_ago']), 0, 100000, 0),
      totalHowMany: clampNumber(readNumber(source, ['totalHowMany', 'total_how_many']), 0, 999999, 0),
      countries: countries.map((item) => normalizeUiText(String(item || ''))).filter(Boolean),
      countryCodes: countryCodes.map((item) => normalizeUiText(String(item || '')).toLowerCase()).filter(Boolean),
      locNames: locNames.map((item) => normalizeUiText(String(item || ''))).filter(Boolean),
      nearestDistanceKm: clampFloat(readNumber(source, ['nearestDistanceKm', 'nearest_distance_km']), 0, 999999, 0),
      isFreshest: source.isFreshest === true,
    };
  }).filter((cluster) => cluster.id && (cluster.lat !== 0 || cluster.lon !== 0));
}

function normalizeWeather(input: Record<string, unknown> | null): SpeciesPredictionWeather | undefined {
  if (!input || !Object.keys(input).length) return undefined;
  return {
    fetchedAt: normalizeUiText(readString(input, ['fetchedAt', 'fetched_at']) || ''),
    windSpeedKph: clampFloat(readNumber(input, ['windSpeedKph', 'wind_speed_kph', 'windspeed']), 0, 500, 0),
    windDirectionDeg: clampFloat(readNumber(input, ['windDirectionDeg', 'wind_direction_deg', 'winddirection']), 0, 360, 0),
    windDirectionLabel: normalizeUiText(readString(input, ['windDirectionLabel', 'wind_direction_label']) || ''),
    ...(hasValue(input, ['precipitationMm', 'precipitation_mm']) ? { precipitationMm: clampFloat(readNumber(input, ['precipitationMm', 'precipitation_mm']), 0, 500, 0) } : {}),
    ...(hasValue(input, ['temperatureC', 'temperature_c']) ? { temperatureC: clampFloat(readNumber(input, ['temperatureC', 'temperature_c']), -80, 80, 0) } : {}),
    ...(typeof input.weatherAvailable === 'boolean' ? { weatherAvailable: input.weatherAvailable === true } : {}),
    ...(typeof input.weatherPartial === 'boolean' ? { weatherPartial: input.weatherPartial === true } : {}),
    ...(typeof input.wasWeatherUsedInRanking === 'boolean' ? { wasWeatherUsedInRanking: input.wasWeatherUsedInRanking === true } : {}),
    ...(readString(input, ['error']) ? { error: normalizeUiText(readString(input, ['error'])) } : {}),
    source: 'Open-Meteo',
  };
}

function normalizePredictionVectors(input: unknown[] | null): SpeciesPredictionVector[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry, index) => {
    const source = asRecord(entry);
    const pointsSource = readArray(source, ['points']) ?? [];
    return {
      id: normalizeUiText(readString(source, ['id']) || `vector-${index + 1}`),
      kind: normalizeVectorKind(readString(source, ['kind'])),
      ...(readString(source, ['sourceClusterId', 'source_cluster_id']) ? { sourceClusterId: normalizeUiText(readString(source, ['sourceClusterId', 'source_cluster_id'])) } : {}),
      ...(hasValue(source, ['targetRank', 'target_rank']) ? { targetRank: clampNumber(readNumber(source, ['targetRank', 'target_rank']), 1, 99, 1) } : {}),
      confidence: clampFloat(readNumber(source, ['confidence']), 0, 100, 0),
      bearingDeg: clampFloat(readNumber(source, ['bearingDeg', 'bearing_deg']), 0, 360, 0),
      distanceKm: clampFloat(readNumber(source, ['distanceKm', 'distance_km']), 0, 999999, 0),
      points: pointsSource.map((point) => {
        const pointSource = asRecord(point);
        return {
          lat: clampFloat(readNumber(pointSource, ['lat', 'latitude']), -90, 90, 0),
          lon: clampFloat(readNumber(pointSource, ['lon', 'lng', 'longitude']), -180, 180, 0),
        };
      }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)),
    };
  }).filter((vector) => vector.points.length >= 2);
}

function normalizeVectorKind(value: string): SpeciesPredictionVector['kind'] {
  if (value === 'cone' || value === 'target_link') return value;
  return 'route';
}

function normalizeClusterSource(value: string): SpeciesPredictionEstoniaHistoryCluster['source'] {
  if (value === 'Elurikkus' || value === 'elurikkus') return 'Elurikkus';
  if (value === 'mixed') return 'mixed';
  return 'GBIF';
}

function normalizeMapLayers(input: Record<string, unknown> | null): SpeciesPredictionLayerToggles | undefined {
  if (!input || !Object.keys(input).length) return undefined;
  return {
    estoniaHistory: input.estoniaHistory !== false,
    estoniaHistoryPoints: input.estoniaHistoryPoints !== false,
    estoniaHistoryClusters: input.estoniaHistoryClusters !== false,
    foreignEvidence: input.foreignEvidence !== false,
    foreignRecentPoints: input.foreignRecentPoints !== false,
    foreignPressureClusters: input.foreignPressureClusters !== false,
    predictedLines: input.predictedLines !== false,
    predictedCone: input.predictedCone !== false,
    predictedTargets: input.predictedTargets !== false,
    diagnostics: input.diagnostics === true,
    recentOnly: input.recentOnly === true,
  };
}
