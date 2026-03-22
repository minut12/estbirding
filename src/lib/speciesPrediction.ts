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
  source: 'GBIF' | 'EELURIKKUS';
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
  source: 'GBIF' | 'EELURIKKUS' | 'mixed';
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
  observedAt?: string;
  windSpeedKph: number;
  windSpeedKmh?: number;
  windDirectionDeg: number;
  windDirectionLabel: string;
  precipitation?: number;
  precipitationMm?: number;
  temperatureC?: number;
  weatherAvailable?: boolean;
  weatherPartial?: boolean;
  wasWeatherUsedInRanking?: boolean;
  error?: string;
  source: string;
  [key: string]: unknown;
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

export type MigrationRouteWaypoint = {
  lat: number;
  lon: number;
  name: string;
  type: 'origin' | 'waypoint' | 'destination';
  cumulativeKm: number;
  estimatedDate: string;
  progressPct: number;
};

export type MigrationRoute = {
  route: MigrationRouteWaypoint[];
  totalDistanceKm: number;
  routeDistanceKm: number;
  currentProgressPct: number;
  currentEstimatedLat: number;
  currentEstimatedLon: number;
  currentWaypointIdx: number;
  hasArrived: boolean;
  daysSinceSighting: number;
  speciesType: string;
};

export type MigrationEta = {
  distanceKm: number;
  entryZone: string;
  entryLat: number;
  entryLon: number;
  speciesType: string;
  baseSpeedKmh: number;
  effectiveSpeedKmh: number;
  travelDays: number;
  stopoverDays: number;
  totalDaysEstimate: number;
  foreignSightingDate: string;
  earliestArrival: string;
  latestArrival: string;
  isPastDue: boolean;
  isImminent: boolean;
  etaText: string;
  foreignLocality?: string;
  foreignCountry?: string;
  migrationRoute?: MigrationRoute | null;
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
  migrationEta?: MigrationEta | null;
};

export type SpeciesPredictionEvidenceSummary = {
  dataSourcesUsed?: string[];
  availableSources?: string[];
  sourcesResponded?: string[];
  activeEvidenceUsed?: string[];
  attemptedButNotUsed?: string[];
  attemptedButUnavailable?: string[];
  attemptedButReturnedNoUsableEvidence?: string[];
  totalForeignRecentPoints?: number;
  primaryCountries?: string[];
  foreignEbirdAvailable?: boolean;
  weatherAvailable?: boolean;
  weatherPartial?: boolean;
  wasWeatherUsedInRanking?: boolean;
  rankingMode?: string;
  effectiveRankingMode?: string;
  summaryText?: string;
  freshestElurikkusDate?: string;
  freshestElurikkusLocality?: string;
  [key: string]: unknown;
};

export type SpeciesPredictionElurikkusRecentRecord = {
  id?: string;
  date?: string;
  locality?: string;
  hasCoords?: boolean;
  coordinates?: {
    lat: number | null;
    lon: number | null;
  };
  [key: string]: unknown;
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
  latestEstoniaLocality?: string;
  latestEstoniaSource?: string;
  freshestLocalities?: string[];
  sourceMix?: string[];
  alreadyPresent: boolean;
  alreadyPassed: boolean;
};

export type SpeciesPredictionSourceHealth = {
  primarySourceUsed: string;
  sourceWarnings: string[];
  elurikkusAvailable: boolean;
  ebirdAvailable: boolean;
  gbifAvailable?: boolean;
  gbifFallbackUsed: boolean;
  activeEvidenceUsed?: string[];
};

export type SpeciesPredictionEvidenceState =
  | 'recent_estonia'
  | 'estonia_history'
  | 'foreign_pressure'
  | 'mixed'
  | 'weather_only_insufficient'
  | 'insufficient'
  | 'already_present_recent_evidence'
  | 'weather_only'
  | 'insufficient_evidence'
  | 'unavailable'
  | (string & {});

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
    key?: string;
    name?: string;
    [key: string]: unknown;
  };
  sourceHealth?: SpeciesPredictionSourceHealth;
  evidenceSummary?: SpeciesPredictionEvidenceSummary;
  elurikkusRecentRecords?: SpeciesPredictionElurikkusRecentRecord[];
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
  rankingNotes?: string;
  warnings?: string[];
  rerankedTopPredictedPoints?: PredictedPoint[];
  consistencyChecks?: PredictionConsistencyChecks;
  openaiAnalysis?: SpeciesPredictionAnalysis;
  aiSummary?: string;
  edgeFunctionVersion?: string;
  timeoutMsUsed?: number;
  rawResearchPayload?: Record<string, unknown>;
  recoveredFromErrorEnvelope?: boolean;
  summarySourcePath?: string;
  normalizedPredictionShape?: string;
  rawTopLevelCode?: string;
  rawTopLevelStage?: string;
  hasAiSummaryObject?: boolean;
  hasNestedInsightSummary?: boolean;
  rankingNotesInputType?: string;
  warningsInputType?: string;
  evidenceState?: SpeciesPredictionEvidenceState;
  recentCount7d?: number;
  recentCount30d?: number;
  topTarget?: PredictedPoint;
  hasRecentEstoniaEvidence?: boolean;
  hasForeignPressure?: boolean;
  hasUsableRecentEstoniaEvidence?: boolean;
  hasUsableEstoniaHistory?: boolean;
  hasUsableForeignPressure?: boolean;
  hasUsablePredictedTargets?: boolean;
  hasOnlyWeather?: boolean;
  hasOnlySourceAvailabilityWithoutUsableEvidence?: boolean;
  activeEvidenceSources?: string[];
  availableSources?: string[];
  attemptedButUnavailable?: string[];
  attemptedButReturnedNoUsableEvidence?: string[];
  effectiveRankingMode?: string;
  summaryGuardrailApplied?: boolean;
  summaryGuardrailReason?: string;
  summaryOrigin?: string;
  backendBuild?: string;
  invokeRouteVersion?: string;
  responseProof?: string;
  payloadSourceState?: 'current_finalized_backend_output' | 'legacy_or_unverified_source' | 'n8n_v3_passthrough';
  globalMigrationEtas?: MigrationEta[];
  normalizedPrediction?: NormalizedPredictionPanelModel;
};

export type NormalizedPredictionPanelModel = {
  speciesName: string;
  evidenceState: string;
  confidenceValue: number | null;
  confidenceLabel: string;
  sourcesContacted: string[];
  rankingMode: string;
  activeEvidenceUsed: string[];
  latestEeCoords: string;
  latestEeLocality: string;
  recentCount7d: number;
  recentCount30d: number;
  predictedTargets: PredictedPoint[];
  weatherLabel: string;
  summaryText: string;
};

export type ResolvedSpeciesPredictionSource = {
  source: Record<string, unknown>;
  summarySourcePath: string;
  insightSummary: string;
  recoveredFromErrorEnvelope: boolean;
  normalizedPredictionShape: string;
  rawTopLevelCode: string;
  rawTopLevelStage: string;
  hasAiSummaryObject?: boolean;
  hasNestedInsightSummary?: boolean;
  rankingNotesInputType?: string;
  warningsInputType?: string;
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
  const normalizedInput = Array.isArray(input) ? (input[0] as Partial<SpeciesPredictionResult> | undefined) ?? null : input;
  const resolvedSource = resolveSpeciesPredictionSource(normalizedInput);
  const source = resolvedSource.source;
  const normalizedName = normalizeUiText(speciesName);
  const sourceSpecies = asRecord(source.species);
  const speciesKey = normalizeSpeciesName(
    readString(source, ['speciesKey', 'species_key'])
    || readString(sourceSpecies, ['speciesKey', 'species_key', 'key'])
    || normalizedName,
  );
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
  const aiSummaryRecord = readRecord(source, ['aiSummary']) ?? {};
  const warnings = normalizeWarningsInput(source.warnings).length
    ? normalizeWarningsInput(source.warnings)
    : normalizeWarningsInput(aiSummaryRecord.warnings).length
      ? normalizeWarningsInput(aiSummaryRecord.warnings)
      : normalizeWarningsInput(asRecord(source.openaiAnalysis).warnings);
  const canonicalCountryScoresSource = readRecord(source, ['countryScores']);
  const legacyCountryScoresSource = readRecord(source, ['country_scores', 'countryScoreMap', 'country_score_map']);
  const fallbackCountryScoresSource = readRecord(asRecord(asRecord(source.rawResearchPayload).openAIAnalysisInput), ['countryScores']);
  const countryScoresSource = canonicalCountryScoresSource
    ?? legacyCountryScoresSource
    ?? fallbackCountryScoresSource
    ?? {};
  const backendBuild = readString(source, ['backendBuild', 'backend_build']);
  const invokeRouteVersion = readString(source, ['invokeRouteVersion', 'invoke_route_version']);
  const responseProof = readString(source, ['responseProof', 'response_proof']);
  const summaryOrigin = readString(source, ['summaryOrigin', 'summary_origin']);
  const isCurrentFinalizedBackendOutput = Boolean(backendBuild && invokeRouteVersion && responseProof);
  const rawResearchPayload = source.rawResearchPayload ? asRecord(source.rawResearchPayload) : {};
  const normalizedSources = readRecord(rawResearchPayload, ['normalizedSources']) ?? {};
  const requestMeta = readRecord(rawResearchPayload, ['request']) ?? {};
  const consistencyChecksSource = readRecord(source, ['consistencyChecks'])
    ?? readRecord(source, ['consistency_checks'])
    ?? readRecord(asRecord(source.openaiAnalysis), ['consistencyChecks'])
    ?? null;
  const deriveSafeLegacySummary = () => {
    const safeRecentCount7d = clampNumber(readNumber(readRecord(source, ['estoniaEvidence']) ?? readRecord(rawResearchPayload, ['estoniaEvidence']) ?? {}, ['recentCount7d']), 0, 999999, 0);
    const safeEstoniaHistoryPoints = normalizeEstoniaHistoryPoints(
      readArray(source, ['estoniaHistoryPoints', 'estonia_history_points'])
        ?? readArray(rawResearchPayload, ['estoniaHistoryPoints', 'estonia_history_points']),
    );
    const safeEstoniaHistoryClusters = normalizeEstoniaHistoryClusters(
      readArray(source, ['estoniaHistoryClusters', 'estonia_history_clusters'])
        ?? readArray(rawResearchPayload, ['estoniaHistoryClusters', 'estonia_history_clusters']),
    );
    const safeForeignRecentPoints = normalizeForeignRecentPoints(
      readArray(source, ['foreignRecentPoints', 'foreign_recent_points'])
        ?? readArray(rawResearchPayload, ['foreignRecentPoints', 'foreign_recent_points']),
    );
    const safeForeignClusters = normalizeForeignClusters(
      readArray(source, ['foreignClusters', 'foreign_clusters'])
        ?? readArray(rawResearchPayload, ['foreignClusters', 'foreign_clusters']),
    );
    const legacyCandidateSummary =
      readString(source, ['insightSummary'])
      || readString(aiSummaryRecord, ['insightSummary', 'insight_summary', 'summary'])
      || readString(source, ['insight_summary', 'summary'])
      || readString(asRecord(source.openaiAnalysis), ['insightSummary', 'insight_summary', 'summary'])
      || readString(source, ['openAiResultValid']);
    const hasEmptyEvidence =
      safeRecentCount7d === 0
      && safeEstoniaHistoryPoints.length === 0
      && safeEstoniaHistoryClusters.length === 0
      && safeForeignRecentPoints.length === 0
      && safeForeignClusters.length === 0;
    const contradictsEvidence =
      (/ALREADY PRESENT/i.test(legacyCandidateSummary) && safeRecentCount7d === 0)
      || (/(Sääre|Ristna|Põõsaspea|Spithami|Tagaranna|Mikoszewo|Zatoka Pomorska|Helsinki|Kalmar|\bPL\b|\bSE\b|\bFI\b|Poland|Sweden|Finland)/i.test(legacyCandidateSummary) && hasEmptyEvidence);
    if (!legacyCandidateSummary) return '';
    if (!contradictsEvidence) return legacyCandidateSummary;
    if (safeRecentCount7d > 0) return `ALREADY PRESENT — ${safeRecentCount7d} records in 7 days.`;
    if (safeEstoniaHistoryPoints.length > 0 || safeEstoniaHistoryClusters.length > 0) return 'No recent Estonia records were confirmed in the last 7 days.';
    if (safeForeignRecentPoints.length === 0 && safeForeignClusters.length === 0) {
      return 'No recent Estonia records were confirmed in the last 7 days, and no coordinate-backed Estonia history or foreign pressure was available in this run. This output should be treated as incomplete evidence rather than an already-present signal.';
    }
    return 'No recent Estonia records were confirmed in the last 7 days.';
  };
  const insightSummary = isCurrentFinalizedBackendOutput
    ? (
      // Only the top-level authoritative fields. No legacy aliases, no openaiAnalysis fallback,
      // no rawResearchPayload.aiSummary. If both are absent, deriveSafeLegacySummary is not
      // appropriate here — caller should treat an empty string as missing summary.
      readString(source, ['insightSummary'])
      || readString(aiSummaryRecord, ['insightSummary'])
    )
    : deriveSafeLegacySummary();
  const confidenceNote = readString(source, ['confidenceNote'])
    || readString(aiSummaryRecord, ['confidenceNote', 'confidence_note'])
    || readString(source, ['confidence_note'])
    || readString(asRecord(source.openaiAnalysis), ['confidenceNote', 'confidence_note']);
  const rankingNotes = normalizeRankingNotes(source.rankingNotes)
    || normalizeRankingNotes(aiSummaryRecord.rankingNotes)
    || normalizeRankingNotes(aiSummaryRecord.ranking_notes)
    || readString(source, ['rankingNotes'])
    || readString(aiSummaryRecord, ['rankingNotes', 'ranking_notes'])
    || readString(source, ['ranking_notes']);
  const analysisVersion = readString(source, ['analysisVersion'])
    || readString(source, ['analysis_version'])
    || (resolvedSource.recoveredFromErrorEnvelope ? 'n8n_aiSummary_recovered' : '')
    || (insightSummary ? 'n8n_aiSummary_normalized' : '')
    || readString(asRecord(source.openaiAnalysis), ['analysisVersion', 'analysis_version']);
  const evidenceSpecies = {
    speciesKey,
    speciesName: normalizeUiText(
      readString(source, ['speciesName', 'species_name'])
      || readString(sourceSpecies, ['speciesName', 'species_name', 'name'])
      || normalizedName,
    ),
    latinName: normalizeUiText(readString(source, ['latinName', 'latin_name']) || readString(requestMeta, ['latinName', 'latin_name']) || ''),
    ebirdSpeciesCode: normalizeUiText(
      readString(source, ['ebirdSpeciesCode', 'ebird_species_code'])
      || readString(requestMeta, ['ebirdSpeciesCode', 'ebird_species_code'])
      || readString(sourceSpecies, ['ebirdSpeciesCode', 'ebird_species_code'])
      || '',
    ),
    key: normalizeUiText(readString(sourceSpecies, ['key']) || speciesKey),
    name: normalizeUiText(readString(sourceSpecies, ['name']) || readString(source, ['speciesName', 'species_name']) || normalizedName),
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
  // Two levels only: top-level payload field, then payload.estoniaEvidence.
  // The evidenceSummary fallback is removed — if the canonical fields are absent, return undefined.
  const sourceEstoniaEvidence = readRecord(source, ['estoniaEvidence']) ?? {};
  const recentCount7d = hasValue(source, ['recentCount7d', 'recent_count_7d'])
    ? clampNumber(readNumber(source, ['recentCount7d', 'recent_count_7d']), 0, 999999, 0)
    : hasValue(sourceEstoniaEvidence, ['recentCount7d', 'recent_count_7d'])
      ? clampNumber(readNumber(sourceEstoniaEvidence, ['recentCount7d', 'recent_count_7d']), 0, 999999, 0)
      : undefined;
  const recentCount30d = hasValue(source, ['recentCount30d', 'recent_count_30d'])
    ? clampNumber(readNumber(source, ['recentCount30d', 'recent_count_30d']), 0, 999999, 0)
    : hasValue(sourceEstoniaEvidence, ['recentCount30d', 'recent_count_30d'])
      ? clampNumber(readNumber(sourceEstoniaEvidence, ['recentCount30d', 'recent_count_30d']), 0, 999999, 0)
      : undefined;
  const elurikkusRecentRecords = normalizeElurikkusRecentRecords(
    readArray(source, ['elurikkusRecentRecords']) ?? readArray(rawResearchPayload, ['elurikkusRecentRecords']),
  );
  const hasElurikkusRecentRecords = hasValue(source, ['elurikkusRecentRecords']) || hasValue(rawResearchPayload, ['elurikkusRecentRecords']);
  // Top-level source fields only. rawResearchPayload fallbacks removed: if the canonical
  // arrays are absent, normalizers return [] — we do not dig into rawResearchPayload to
  // surface older data that would misrepresent the current run.
  const estoniaHistoryPoints = normalizeEstoniaHistoryPoints(
    readArray(source, ['estoniaHistoryPoints', 'estonia_history_points']),
  );
  const hasEstoniaHistoryPoints = hasValue(source, ['estoniaHistoryPoints', 'estonia_history_points']);
  const estoniaHistoryClusters = normalizeEstoniaHistoryClusters(
    readArray(source, ['estoniaHistoryClusters', 'estonia_history_clusters']),
  );
  const hasEstoniaHistoryClusters = hasValue(source, ['estoniaHistoryClusters', 'estonia_history_clusters']);
  const foreignRecentPoints = normalizeForeignRecentPoints(
    readArray(source, ['foreignRecentPoints', 'foreign_recent_points']),
  );
  const hasForeignRecentPoints = hasValue(source, ['foreignRecentPoints', 'foreign_recent_points']);
  const foreignClusters = normalizeForeignClusters(
    readArray(source, ['foreignClusters', 'foreign_clusters']),
  );
  const hasForeignClusters = hasValue(source, ['foreignClusters', 'foreign_clusters']);
  const weather = normalizeWeather(
    readRecord(source, ['weather']) ?? readRecord(rawResearchPayload, ['weather']),
  );
  const topTargetRecord = readRecord(source, ['topTarget']) ?? {};
  const topTarget = Object.keys(topTargetRecord).length
    ? normalizePredictedPoint(topTargetRecord, 0)
    : undefined;
  const evidenceState = readString(source, ['evidenceState', 'evidence_state']) as SpeciesPredictionEvidenceState | '';
  const hasRecentEstoniaEvidence = typeof source.hasRecentEstoniaEvidence === 'boolean' ? source.hasRecentEstoniaEvidence : undefined;
  const hasForeignPressure = typeof source.hasForeignPressure === 'boolean' ? source.hasForeignPressure : undefined;
  const hasUsableRecentEstoniaEvidence = typeof source.hasUsableRecentEstoniaEvidence === 'boolean' ? source.hasUsableRecentEstoniaEvidence : undefined;
  const hasUsableEstoniaHistory = typeof source.hasUsableEstoniaHistory === 'boolean' ? source.hasUsableEstoniaHistory : undefined;
  const hasUsableForeignPressure = typeof source.hasUsableForeignPressure === 'boolean' ? source.hasUsableForeignPressure : undefined;
  const hasUsablePredictedTargets = typeof source.hasUsablePredictedTargets === 'boolean' ? source.hasUsablePredictedTargets : undefined;
  const hasOnlyWeather = typeof source.hasOnlyWeather === 'boolean' ? source.hasOnlyWeather : undefined;
  const hasOnlySourceAvailabilityWithoutUsableEvidence = typeof source.hasOnlySourceAvailabilityWithoutUsableEvidence === 'boolean'
    ? source.hasOnlySourceAvailabilityWithoutUsableEvidence
    : undefined;
  const activeEvidenceSources = (readArray(source, ['activeEvidenceSources', 'active_evidence_sources']) ?? []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean);
  const availableSourceList = (readArray(source, ['availableSources', 'available_sources']) ?? []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean);
  const attemptedButUnavailable = (readArray(source, ['attemptedButUnavailable', 'attempted_but_unavailable']) ?? []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean);
  const attemptedButReturnedNoUsableEvidence = (readArray(source, ['attemptedButReturnedNoUsableEvidence', 'attempted_but_returned_no_usable_evidence']) ?? []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean);
  const effectiveRankingMode = readString(source, ['effectiveRankingMode', 'effective_ranking_mode']);
  const summaryGuardrailApplied = typeof source.summaryGuardrailApplied === 'boolean' ? source.summaryGuardrailApplied : undefined;
  const summaryGuardrailReason = readString(source, ['summaryGuardrailReason', 'summary_guardrail_reason']);
  const predictionVectors = normalizePredictionVectors(
    readArray(source, ['predictionVectors', 'prediction_vectors'])
      ?? readArray(rawResearchPayload, ['predictionVectors', 'prediction_vectors']),
  );
  const predictedTargets = Array.isArray(readArray(source, ['predictedTargets', 'predicted_targets']))
    ? (readArray(source, ['predictedTargets', 'predicted_targets']) as unknown[]).map((point, index) => normalizePredictedPoint(asRecord(point), index))
    : [];
  const hasPredictedTargets = hasValue(source, ['predictedTargets', 'predicted_targets']);
  const mapLayers = normalizeMapLayers(
    readRecord(source, ['mapLayers', 'map_layers'])
      ?? readRecord(source, ['mapLayersDefault', 'map_layers_default'])
      ?? readRecord(rawResearchPayload, ['mapLayers', 'map_layers']),
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
    ...((elurikkusRecentRecords.length || hasElurikkusRecentRecords) ? { elurikkusRecentRecords } : {}),
    ...((estoniaHistoryPoints.length || hasEstoniaHistoryPoints) ? { estoniaHistoryPoints } : {}),
    ...((estoniaHistoryClusters.length || hasEstoniaHistoryClusters) ? { estoniaHistoryClusters } : {}),
    ...((foreignRecentPoints.length || hasForeignRecentPoints) ? { foreignRecentPoints } : {}),
    ...((foreignClusters.length || hasForeignClusters) ? { foreignClusters } : {}),
    ...(weather ? { weather } : {}),
    ...(predictionVectors.length ? { predictionVectors } : {}),
    ...((predictedTargets.length || hasPredictedTargets) ? { predictedTargets } : {}),
    ...(mapLayers ? { mapLayers } : {}),
    ...(foreignEvidence.length ? { foreignEvidence } : {}),
    ...((estoniaEvidence || recentCount7d != null || recentCount30d != null) ? {
      estoniaEvidence: {
        recentCount7d: recentCount7d ?? estoniaEvidence?.recentCount7d ?? 0,
        recentCount30d: recentCount30d ?? estoniaEvidence?.recentCount30d ?? 0,
        latestEstoniaDate: estoniaEvidence?.latestEstoniaDate ?? '',
        latestEstoniaLat: estoniaEvidence?.latestEstoniaLat ?? null,
        latestEstoniaLon: estoniaEvidence?.latestEstoniaLon ?? null,
        ...(estoniaEvidence?.latestEstoniaLocality ? { latestEstoniaLocality: estoniaEvidence.latestEstoniaLocality } : {}),
        ...(estoniaEvidence?.latestEstoniaSource ? { latestEstoniaSource: estoniaEvidence.latestEstoniaSource } : {}),
        ...(estoniaEvidence?.freshestLocalities ? { freshestLocalities: estoniaEvidence.freshestLocalities } : {}),
        ...(estoniaEvidence?.sourceMix ? { sourceMix: estoniaEvidence.sourceMix } : {}),
        alreadyPresent: estoniaEvidence?.alreadyPresent === true,
        alreadyPassed: estoniaEvidence?.alreadyPassed === true,
      },
    } : {}),
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
    ...(readString(source, ['edgeFunctionVersion']) ? { edgeFunctionVersion: normalizeUiText(readString(source, ['edgeFunctionVersion'])) } : {}),
    ...(hasValue(source, ['timeoutMsUsed']) ? { timeoutMsUsed: clampNumber(readNumber(source, ['timeoutMsUsed']), 0, 9999999, 0) } : {}),
    ...(typeof source.analysisFallbackUsed === 'boolean' ? { analysisFallbackUsed: source.analysisFallbackUsed } : {}),
    ...(confidenceNote ? { confidenceNote: normalizeUiText(confidenceNote) } : {}),
    ...(rankingNotes ? { rankingNotes: normalizeUiText(rankingNotes) } : {}),
    ...(warnings.length ? { warnings } : {}),
    ...(evidenceState ? { evidenceState } : {}),
    ...(recentCount7d != null ? { recentCount7d } : {}),
    ...(recentCount30d != null ? { recentCount30d } : {}),
    ...(topTarget ? { topTarget } : {}),
    ...(typeof hasRecentEstoniaEvidence === 'boolean' ? { hasRecentEstoniaEvidence } : {}),
    ...(typeof hasForeignPressure === 'boolean' ? { hasForeignPressure } : {}),
    ...(typeof hasUsableRecentEstoniaEvidence === 'boolean' ? { hasUsableRecentEstoniaEvidence } : {}),
    ...(typeof hasUsableEstoniaHistory === 'boolean' ? { hasUsableEstoniaHistory } : {}),
    ...(typeof hasUsableForeignPressure === 'boolean' ? { hasUsableForeignPressure } : {}),
    ...(typeof hasUsablePredictedTargets === 'boolean' ? { hasUsablePredictedTargets } : {}),
    ...(typeof hasOnlyWeather === 'boolean' ? { hasOnlyWeather } : {}),
    ...(typeof hasOnlySourceAvailabilityWithoutUsableEvidence === 'boolean' ? { hasOnlySourceAvailabilityWithoutUsableEvidence } : {}),
    ...(activeEvidenceSources.length ? { activeEvidenceSources } : {}),
    ...(availableSourceList.length ? { availableSources: availableSourceList } : {}),
    ...(attemptedButUnavailable.length ? { attemptedButUnavailable } : {}),
    ...(attemptedButReturnedNoUsableEvidence.length ? { attemptedButReturnedNoUsableEvidence } : {}),
    ...(effectiveRankingMode ? { effectiveRankingMode: normalizeUiText(effectiveRankingMode) } : {}),
    ...(typeof summaryGuardrailApplied === 'boolean' ? { summaryGuardrailApplied } : {}),
    ...(summaryGuardrailReason ? { summaryGuardrailReason: normalizeUiText(summaryGuardrailReason) } : {}),
    ...(summaryOrigin ? { summaryOrigin: normalizeUiText(summaryOrigin) } : {}),
    ...(backendBuild ? { backendBuild: normalizeUiText(backendBuild) } : {}),
    ...(invokeRouteVersion ? { invokeRouteVersion: normalizeUiText(invokeRouteVersion) } : {}),
    ...(responseProof ? { responseProof: normalizeUiText(responseProof) } : {}),
    payloadSourceState: isCurrentFinalizedBackendOutput ? 'current_finalized_backend_output' : 'legacy_or_unverified_source',
    ...(consistencyChecksSource ? { consistencyChecks: normalizePredictionConsistencyChecks(consistencyChecksSource) } : {}),
    ...(source.openaiAnalysis ? { openaiAnalysis: source.openaiAnalysis as SpeciesPredictionAnalysis } : {}),
    ...(normalizeUiText(
      isCurrentFinalizedBackendOutput
        ? (insightSummary || readString(source, ['aiSummary', 'ai_summary']))
        : insightSummary
    )
      ? { aiSummary: normalizeUiText(
        isCurrentFinalizedBackendOutput
          ? (insightSummary || readString(source, ['aiSummary', 'ai_summary']))
          : insightSummary
      ) }
      : {}),
    ...(source.rawResearchPayload ? { rawResearchPayload: rawResearchPayload } : {}),
    ...(resolvedSource.recoveredFromErrorEnvelope ? {
      recoveredFromErrorEnvelope: true,
      summarySourcePath: resolvedSource.summarySourcePath,
      normalizedPredictionShape: resolvedSource.normalizedPredictionShape,
      rawTopLevelCode: resolvedSource.rawTopLevelCode,
      rawTopLevelStage: resolvedSource.rawTopLevelStage,
      hasAiSummaryObject: resolvedSource.hasAiSummaryObject === true,
      hasNestedInsightSummary: resolvedSource.hasNestedInsightSummary === true,
      ...(resolvedSource.rankingNotesInputType ? { rankingNotesInputType: resolvedSource.rankingNotesInputType } : {}),
      ...(resolvedSource.warningsInputType ? { warningsInputType: resolvedSource.warningsInputType } : {}),
    } : {}),
  };
}

export function normalizePrediction(raw: Partial<SpeciesPredictionResult> | SpeciesPredictionResult[] | null | undefined): NormalizedPredictionPanelModel {
  const root = Array.isArray(raw) ? (raw[0] as Partial<SpeciesPredictionResult> | undefined) ?? {} : (raw ?? {});
  const speciesRoot = asRecord((root as SpeciesPredictionResult).species);
  const sourceHealth = asRecord((root as SpeciesPredictionResult).sourceHealth);
  const evidenceSummary = asRecord((root as SpeciesPredictionResult).evidenceSummary);
  const weather = asRecord((root as SpeciesPredictionResult).weather);
  const predictedTargets = Array.isArray((root as SpeciesPredictionResult).predictedTargets)
    ? ((root as SpeciesPredictionResult).predictedTargets as PredictedPoint[])
    : [];
  const topTarget = asRecord((root as SpeciesPredictionResult).topTarget);
  const confidenceValueRaw = hasValue(topTarget, ['confidence']) ? readNumber(topTarget, ['confidence']) : null;
  const confidenceValue = Number.isFinite(Number(confidenceValueRaw)) ? Number(confidenceValueRaw) : null;
  const activeEvidenceUsed = Array.isArray(readArray(sourceHealth, ['activeEvidenceUsed', 'active_evidence_used']))
    ? (readArray(sourceHealth, ['activeEvidenceUsed', 'active_evidence_used']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean)
    : [];
  const recentCount7d = hasValue(root as Record<string, unknown>, ['recentCount7d'])
    ? clampNumber(readNumber(root as Record<string, unknown>, ['recentCount7d']), 0, 999999, 0)
    : hasValue(evidenceSummary, ['recentCount7d'])
      ? clampNumber(readNumber(evidenceSummary, ['recentCount7d']), 0, 999999, 0)
      : 0;
  const recentCount30d = hasValue(root as Record<string, unknown>, ['recentCount30d'])
    ? clampNumber(readNumber(root as Record<string, unknown>, ['recentCount30d']), 0, 999999, 0)
    : hasValue(evidenceSummary, ['recentCount30d'])
      ? clampNumber(readNumber(evidenceSummary, ['recentCount30d']), 0, 999999, 0)
      : 0;
  const elurikkusRecentRecords = Array.isArray((root as SpeciesPredictionResult).elurikkusRecentRecords)
    ? (root as SpeciesPredictionResult).elurikkusRecentRecords || []
    : [];
  const freshestRecordWithCoords = [...elurikkusRecentRecords]
    .filter((record) => {
      const coords = readRecentRecordCoords(record);
      return !!coords;
    })
    .sort((left, right) => readRecentRecordTimestamp(right) - readRecentRecordTimestamp(left))[0];
  const freshestCoords = readRecentRecordCoords(freshestRecordWithCoords);
  const sourcesContacted: string[] = [];
  if (
    elurikkusRecentRecords.length
    || recentCount7d > 0
    || recentCount30d > 0
    || (root as SpeciesPredictionResult).hasRecentEstoniaEvidence === true
    || sourceHealth.elurikkusAvailable === true
  ) sourcesContacted.push('eElurikkus recent records');
  if (
    (Array.isArray((root as SpeciesPredictionResult).estoniaHistoryPoints) && (root as SpeciesPredictionResult).estoniaHistoryPoints!.length)
    || (Array.isArray((root as SpeciesPredictionResult).estoniaHistoryClusters) && (root as SpeciesPredictionResult).estoniaHistoryClusters!.length)
    || (root as SpeciesPredictionResult).hasUsableEstoniaHistory === true
    || sourceHealth.gbifAvailable === true
  ) sourcesContacted.push('GBIF Estonia history');
  if (
    (Array.isArray((root as SpeciesPredictionResult).foreignRecentPoints) && (root as SpeciesPredictionResult).foreignRecentPoints!.length)
    || (Array.isArray((root as SpeciesPredictionResult).foreignClusters) && (root as SpeciesPredictionResult).foreignClusters!.length)
    || (root as SpeciesPredictionResult).hasForeignPressure === true
    || (root as SpeciesPredictionResult).hasUsableForeignPressure === true
    || sourceHealth.ebirdAvailable === true
  ) sourcesContacted.push('eBird foreign pressure');
  if (
    hasValue(weather, ['windSpeedKmh'])
    || hasValue(weather, ['windDirectionDeg'])
    || !!readString(weather, ['observedAt'])
    || !!readString(weather, ['source'])
  ) sourcesContacted.push('Open-Meteo weather');
  const rankingMode = activeEvidenceUsed.length ? activeEvidenceUsed.join(' + ') : (sourcesContacted.length ? sourcesContacted.join(' + ') : '—');
  return {
    speciesName: normalizeUiText(readString(root as Record<string, unknown>, ['speciesName']) || readString(speciesRoot, ['name']) || readString(root as Record<string, unknown>, ['speciesKey']) || ''),
    evidenceState: normalizeUiText(readString(root as Record<string, unknown>, ['evidenceState']) || ''),
    confidenceValue,
    confidenceLabel: confidenceValue != null ? `${Math.round(confidenceValue * 100)}%` : (normalizeUiText(readString(root as Record<string, unknown>, ['confidenceNote']) || '') || '—'),
    sourcesContacted,
    rankingMode,
    activeEvidenceUsed,
    latestEeCoords: freshestCoords ? `${String(freshestCoords.lat)}, ${String(freshestCoords.lon)}` : '—',
    latestEeLocality: normalizeUiText(String((freshestRecordWithCoords && ((freshestRecordWithCoords as Record<string, unknown>).locality || (freshestRecordWithCoords as Record<string, unknown>).locName)) || '')) || '—',
    recentCount7d,
    recentCount30d,
    predictedTargets,
    weatherLabel: formatPredictionWeatherLabel(weather),
    summaryText: normalizeUiText(readString(root as Record<string, unknown>, ['insightSummary']) || readString(asRecord((root as SpeciesPredictionResult).aiSummary), ['insightSummary']) || ''),
  };
}

function readRecentRecordTimestamp(record: SpeciesPredictionElurikkusRecentRecord | undefined): number {
  if (!record) return 0;
  const raw = String((record as Record<string, unknown>).event_datetime_point || record.date || (record as Record<string, unknown>).eventDate || '');
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function readRecentRecordCoords(record: SpeciesPredictionElurikkusRecentRecord | undefined): { lat: string; lon: string } | null {
  if (!record) return null;
  const source = record as Record<string, unknown>;
  const coords = asRecord(source.coordinates);
  const latRaw = coords.lat ?? source.latitude ?? source.lat;
  const lonRaw = coords.lon ?? source.longitude ?? source.lon ?? source.lng;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat: String(latRaw), lon: String(lonRaw) };
}

function formatPredictionWeatherLabel(weather: Record<string, unknown>): string {
  const speed = hasValue(weather, ['windSpeedKmh']) ? readNumber(weather, ['windSpeedKmh']) : null;
  const deg = hasValue(weather, ['windDirectionDeg']) ? readNumber(weather, ['windDirectionDeg']) : null;
  const observedAt = normalizeUiText(readString(weather, ['observedAt']) || '');
  if (!Number.isFinite(Number(speed)) && !Number.isFinite(Number(deg)) && !observedAt) return '—';
  const parts = [];
  const dir = weatherDirectionToCompass(Number(deg));
  if (dir) parts.push(dir);
  if (Number.isFinite(Number(speed))) parts.push(`${Math.round(Number(speed))} km/h`);
  if (observedAt) parts.push(observedAt);
  return parts.join(' | ') || '—';
}

function weatherDirectionToCompass(deg: number): string {
  if (!Number.isFinite(deg)) return '';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round((((deg % 360) + 360) % 360) / 45) % 8] || '';
}

export function hasUsableSpeciesPredictionResult(
  input: Partial<SpeciesPredictionResult> | null | undefined,
): boolean {
  if (!input || typeof input !== 'object') return false;
  // Try direct shape first
  if (hasUsableDirectShape(input)) return true;
  // Try recovering from error envelope
  const recovered = extractUsablePayloadFromErrorEnvelope(input as Record<string, unknown>);
  if (recovered) return true;
  return false;
}

function hasUsableDirectShape(input: Partial<SpeciesPredictionResult>): boolean {
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
    || hasValue(evidenceRecord, ['aiSummary'])
    || hasValue(evidenceRecord, ['insightSummary'])
  );
  return Boolean((speciesKey || speciesName) && (generatedAt || hasEvidencePayload) && hasEvidencePayload);
}

/**
 * Extracts a usable prediction payload from an error envelope.
 * Probes these paths in order:
 *   A) raw.aiSummary.insightSummary
 *   B) raw.responseBody.aiSummary.insightSummary
 *   C) raw.responseBody.upstreamBody.aiSummary.insightSummary
 *   D) raw.insightSummary
 *   E) raw.responseBody.insightSummary
 *   F) raw.responseBody.upstreamBody.insightSummary
 * Returns the best usable source object + path, or null.
 */
export function extractUsablePayloadFromErrorEnvelope(
  raw: Record<string, unknown> | null | undefined,
): ResolvedSpeciesPredictionSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rawTopLevelCode = readString(r, ['code']);
  const rawTopLevelStage = readString(r, ['stage']);
  const looksLikeEnvelope = Boolean(
    rawTopLevelCode
    || rawTopLevelStage
    || hasValue(r, ['body'])
    || hasValue(r, ['data'])
    || hasValue(r, ['result'])
    || hasValue(r, ['responseBody'])
    || hasValue(r, ['upstreamBody']),
  );
  if (!looksLikeEnvelope) return null;

  const candidates: Array<{ sourceObj: Record<string, unknown>; path: string }> = [];
  const queue: Array<{ sourceObj: Record<string, unknown>; path: string }> = [{ sourceObj: r, path: '' }];
  const seen = new Set<Record<string, unknown>>();

  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current.sourceObj)) continue;
    seen.add(current.sourceObj);
    candidates.push(current);
    for (const key of ['body', 'data', 'result', 'responseBody', 'upstreamBody']) {
      const next = asRecord(current.sourceObj[key]);
      if (!Object.keys(next).length) continue;
      queue.push({ sourceObj: next, path: current.path ? `${current.path}.${key}` : key });
    }
  }

  const probes = candidates.map((candidate) => ({
    obj: asRecord(candidate.sourceObj.aiSummary),
    aiPath: candidate.path ? `${candidate.path}.aiSummary` : 'aiSummary',
    sourceObj: candidate.sourceObj,
  }));

  // Check nested aiSummary objects first (A, B, C)
  for (const probe of probes) {
    const summary = typeof probe.obj.insightSummary === 'string' ? probe.obj.insightSummary.trim() : '';
    if (summary) {
      return {
        source: probe.sourceObj,
        summarySourcePath: probe.aiPath,
        insightSummary: summary,
        recoveredFromErrorEnvelope: true,
        normalizedPredictionShape: 'nested-aiSummary-error-envelope',
        rawTopLevelCode,
        rawTopLevelStage,
        hasAiSummaryObject: Object.keys(probe.obj).length > 0,
        hasNestedInsightSummary: true,
        rankingNotesInputType: typeof (probe.obj.rankingNotes ?? probe.obj.ranking_notes),
        warningsInputType: Array.isArray(probe.obj.warnings) ? 'array' : typeof probe.obj.warnings,
      };
    }
  }

  // Check direct insightSummary (D, E, F)
  const directProbes = candidates.map((candidate) => ({
    obj: candidate.sourceObj,
    path: candidate.path ? `${candidate.path}.insightSummary` : 'insightSummary',
  }));
  for (const probe of directProbes) {
    const summary = typeof probe.obj.insightSummary === 'string' ? probe.obj.insightSummary.trim() : '';
    if (summary) {
      return {
        source: probe.obj,
        summarySourcePath: probe.path,
        insightSummary: summary,
        recoveredFromErrorEnvelope: true,
        normalizedPredictionShape: 'flat-error-envelope',
        rawTopLevelCode,
        rawTopLevelStage,
        hasAiSummaryObject: Object.keys(asRecord(probe.obj.aiSummary)).length > 0,
        hasNestedInsightSummary: typeof asRecord(probe.obj.aiSummary).insightSummary === 'string' && asRecord(probe.obj.aiSummary).insightSummary.trim().length > 0,
        rankingNotesInputType: typeof (probe.obj.rankingNotes ?? probe.obj.ranking_notes),
        warningsInputType: Array.isArray(probe.obj.warnings) ? 'array' : typeof probe.obj.warnings,
      };
    }
  }

  return null;
}

export function resolveSpeciesPredictionSource(
  input: Partial<SpeciesPredictionResult> | null | undefined,
): ResolvedSpeciesPredictionSource {
  const inputRecord = asRecord(input);
  const source = resolvePredictionSource(input);
  const wrappedSuccessSource = resolveWrappedSuccessSource(inputRecord);
  if (wrappedSuccessSource) {
    return {
      source: wrappedSuccessSource,
      summarySourcePath: '',
      insightSummary: '',
      recoveredFromErrorEnvelope: false,
      normalizedPredictionShape: '',
      rawTopLevelCode: '',
      rawTopLevelStage: '',
    };
  }
  const recovered = extractUsablePayloadFromErrorEnvelope(asRecord(input));
  if (recovered) return recovered;
  const directSummary = readString(source, ['insightSummary'])
    || readString(readRecord(source, ['aiSummary']) ?? {}, ['insightSummary', 'insight_summary', 'summary'])
    || readString(source, ['insight_summary', 'summary'])
    || readString(asRecord(source.openaiAnalysis), ['insightSummary', 'insight_summary', 'summary']);
  return {
    source,
    summarySourcePath: directSummary ? readString(inputRecord, ['summarySourcePath']) || 'direct' : '',
    insightSummary: directSummary,
    recoveredFromErrorEnvelope: false,
    normalizedPredictionShape: directSummary ? readString(inputRecord, ['normalizedPredictionShape']) || 'direct-success' : '',
    rawTopLevelCode: readString(inputRecord, ['rawTopLevelCode']),
    rawTopLevelStage: readString(inputRecord, ['rawTopLevelStage']),
    hasAiSummaryObject: inputRecord.hasAiSummaryObject === true,
    hasNestedInsightSummary: inputRecord.hasNestedInsightSummary === true,
    rankingNotesInputType: readString(inputRecord, ['rankingNotesInputType']),
    warningsInputType: readString(inputRecord, ['warningsInputType']),
  };
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

function resolveWrappedSuccessSource(input: Record<string, unknown>): Record<string, unknown> | null {
  if (readString(input, ['code']) || readString(input, ['stage'])) return null;
  const queue: Record<string, unknown>[] = [input];
  const seen = new Set<Record<string, unknown>>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (hasCanonicalPredictionFields(current)) return current;
    for (const key of ['body', 'data', 'result', 'responseBody', 'upstreamBody']) {
      const next = asRecord(current[key]);
      if (!Object.keys(next).length) continue;
      queue.push(next);
    }
  }
  return null;
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

function normalizeRankingNotes(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item || '').trim()).filter(Boolean).join(' • ');
    return joined || '';
  }
  return '';
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

function normalizeWarningsInput(value: unknown): string[] {
  if (typeof value === 'string') {
    const normalized = normalizeUiText(value);
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((warning) => normalizeUiText(String(warning || '')))
    .filter(Boolean);
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
    ...input,
    ...(dataSourcesUsed.length ? { dataSourcesUsed } : {}),
    ...(Array.isArray(readArray(input, ['availableSources', 'available_sources'])) ? { availableSources: (readArray(input, ['availableSources', 'available_sources']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(Array.isArray(readArray(input, ['sourcesResponded', 'sources_responded'])) ? { sourcesResponded: (readArray(input, ['sourcesResponded', 'sources_responded']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(Array.isArray(readArray(input, ['activeEvidenceUsed', 'active_evidence_used'])) ? { activeEvidenceUsed: (readArray(input, ['activeEvidenceUsed', 'active_evidence_used']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(Array.isArray(readArray(input, ['attemptedButNotUsed', 'attempted_but_not_used'])) ? { attemptedButNotUsed: (readArray(input, ['attemptedButNotUsed', 'attempted_but_not_used']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(Array.isArray(readArray(input, ['attemptedButUnavailable', 'attempted_but_unavailable'])) ? { attemptedButUnavailable: (readArray(input, ['attemptedButUnavailable', 'attempted_but_unavailable']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(Array.isArray(readArray(input, ['attemptedButReturnedNoUsableEvidence', 'attempted_but_returned_no_usable_evidence'])) ? { attemptedButReturnedNoUsableEvidence: (readArray(input, ['attemptedButReturnedNoUsableEvidence', 'attempted_but_returned_no_usable_evidence']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(hasValue(input, ['totalForeignRecentPoints', 'total_foreign_recent_points']) ? { totalForeignRecentPoints: clampNumber(readNumber(input, ['totalForeignRecentPoints', 'total_foreign_recent_points']), 0, 999999, 0) } : {}),
    ...(Array.isArray(readArray(input, ['primaryCountries', 'primary_countries'])) ? { primaryCountries: (readArray(input, ['primaryCountries', 'primary_countries']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) } : {}),
    ...(typeof input.foreignEbirdAvailable === 'boolean' ? { foreignEbirdAvailable: input.foreignEbirdAvailable === true } : {}),
    ...(typeof input.weatherAvailable === 'boolean' ? { weatherAvailable: input.weatherAvailable === true } : {}),
    ...(typeof input.weatherPartial === 'boolean' ? { weatherPartial: input.weatherPartial === true } : {}),
    ...(typeof input.wasWeatherUsedInRanking === 'boolean' ? { wasWeatherUsedInRanking: input.wasWeatherUsedInRanking === true } : {}),
    ...(hasValue(input, ['recentCount7d', 'recent_count_7d']) ? { recentCount7d: clampNumber(readNumber(input, ['recentCount7d', 'recent_count_7d']), 0, 999999, 0) } : {}),
    ...(hasValue(input, ['recentCount30d', 'recent_count_30d']) ? { recentCount30d: clampNumber(readNumber(input, ['recentCount30d', 'recent_count_30d']), 0, 999999, 0) } : {}),
    ...(readString(input, ['rankingMode', 'ranking_mode']) ? { rankingMode: normalizeUiText(readString(input, ['rankingMode', 'ranking_mode'])) } : {}),
    ...(readString(input, ['effectiveRankingMode', 'effective_ranking_mode']) ? { effectiveRankingMode: normalizeUiText(readString(input, ['effectiveRankingMode', 'effective_ranking_mode'])) } : {}),
    ...(readString(input, ['summaryText', 'summary_text']) ? { summaryText: normalizeUiText(readString(input, ['summaryText', 'summary_text'])) } : {}),
    ...(readString(input, ['freshestElurikkusDate', 'freshest_elurikkus_date']) ? { freshestElurikkusDate: normalizeUiText(readString(input, ['freshestElurikkusDate', 'freshest_elurikkus_date'])) } : {}),
    ...(readString(input, ['freshestElurikkusLocality', 'freshest_elurikkus_locality']) ? { freshestElurikkusLocality: normalizeUiText(readString(input, ['freshestElurikkusLocality', 'freshest_elurikkus_locality'])) } : {}),
  };
}

function normalizeElurikkusRecentRecords(input: unknown[] | null): SpeciesPredictionElurikkusRecentRecord[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry, index) => {
    const source = asRecord(entry);
    const coordinatesSource = readRecord(source, ['coordinates']);
    const lat = hasValue(coordinatesSource, ['lat', 'latitude']) || hasValue(source, ['lat', 'latitude', 'decimalLatitude'])
      ? clampFloat(readNumber(coordinatesSource ?? source, ['lat', 'latitude', 'decimalLatitude']), -90, 90, 0)
      : null;
    const lon = hasValue(coordinatesSource, ['lon', 'lng', 'longitude', 'decimalLongitude']) || hasValue(source, ['lon', 'lng', 'longitude', 'decimalLongitude'])
      ? clampFloat(readNumber(coordinatesSource ?? source, ['lon', 'lng', 'longitude', 'decimalLongitude']), -180, 180, 0)
      : null;
    const hasCoords = typeof source.hasCoords === 'boolean'
      ? source.hasCoords === true
      : lat != null && lon != null;
    return {
      ...source,
      ...(readString(source, ['id']) ? { id: normalizeUiText(readString(source, ['id'])) } : { id: `elurikkus-record-${index + 1}` }),
      ...(readString(source, ['date', 'observedAt', 'eventDate']) ? { date: normalizeUiText(readString(source, ['date', 'observedAt', 'eventDate'])) } : {}),
      ...(readString(source, ['locality', 'locName']) ? { locality: normalizeUiText(readString(source, ['locality', 'locName'])) } : {}),
      hasCoords,
      coordinates: { lat, lon },
    };
  });
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
    ...(readString(input, ['latestEstoniaLocality', 'latest_estonia_locality']) ? { latestEstoniaLocality: normalizeUiText(readString(input, ['latestEstoniaLocality', 'latest_estonia_locality'])) } : {}),
    ...(readString(input, ['latestEstoniaSource', 'latest_estonia_source']) ? { latestEstoniaSource: normalizeUiText(readString(input, ['latestEstoniaSource', 'latest_estonia_source'])) } : {}),
    ...(Array.isArray(readArray(input, ['freshestLocalities', 'freshest_localities'])) ? { freshestLocalities: (readArray(input, ['freshestLocalities', 'freshest_localities']) || []).map((value) => normalizeUiText(String(value || ''))).filter(Boolean) } : {}),
    ...(Array.isArray(readArray(input, ['sourceMix', 'source_mix'])) ? { sourceMix: (readArray(input, ['sourceMix', 'source_mix']) || []).map((value) => normalizeUiText(String(value || ''))).filter(Boolean) } : {}),
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
    ...(typeof input.gbifAvailable === 'boolean' ? { gbifAvailable: input.gbifAvailable === true } : {}),
    gbifFallbackUsed: input.gbifFallbackUsed === true,
    ...(Array.isArray(readArray(input, ['activeEvidenceUsed', 'active_evidence_used']))
      ? { activeEvidenceUsed: (readArray(input, ['activeEvidenceUsed', 'active_evidence_used']) || []).map((item) => normalizeUiText(String(item || ''))).filter(Boolean) }
      : {}),
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
      ageClass: (normalizeUiText(readString(source, ['ageClass', 'age_class']) || '') === 'recent' ? 'recent' : 'historical') as SpeciesPredictionPointAge,
      source: (normalizeComparableSource(readString(source, ['source'])) === 'EELURIKKUS' ? 'EELURIKKUS' : 'GBIF') as SpeciesPredictionEstoniaHistoryPoint['source'],
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
      source: 'eBird' as const,
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
  const observedAt = normalizeUiText(readString(input, ['observedAt', 'observed_at']) || '');
  const fetchedAt = normalizeUiText(readString(input, ['fetchedAt', 'fetched_at']) || observedAt);
  const windSpeedKmh = hasValue(input, ['windSpeedKmh', 'wind_speed_kmh'])
    ? clampFloat(readNumber(input, ['windSpeedKmh', 'wind_speed_kmh']), 0, 500, 0)
    : clampFloat(readNumber(input, ['windSpeedKph', 'wind_speed_kph', 'windspeed']), 0, 500, 0);
  const windSpeedKph = hasValue(input, ['windSpeedKph', 'wind_speed_kph', 'windspeed'])
    ? clampFloat(readNumber(input, ['windSpeedKph', 'wind_speed_kph', 'windspeed']), 0, 500, 0)
    : windSpeedKmh;
  const derivedWeatherAvailable = Boolean(fetchedAt && (windSpeedKph > 0 || readNumber(input, ['windDirectionDeg', 'wind_direction_deg', 'winddirection']) > 0));
  const derivedWeatherPartial = !fetchedAt;
  return {
    ...input,
    fetchedAt,
    ...(observedAt ? { observedAt } : {}),
    windSpeedKph,
    ...(hasValue(input, ['windSpeedKmh', 'wind_speed_kmh']) || windSpeedKmh ? { windSpeedKmh } : {}),
    windDirectionDeg: clampFloat(readNumber(input, ['windDirectionDeg', 'wind_direction_deg', 'winddirection']), 0, 360, 0),
    windDirectionLabel: normalizeUiText(readString(input, ['windDirectionLabel', 'wind_direction_label']) || ''),
    ...(hasValue(input, ['precipitation']) ? { precipitation: clampFloat(readNumber(input, ['precipitation']), 0, 500, 0) } : {}),
    ...(hasValue(input, ['precipitationMm', 'precipitation_mm']) ? { precipitationMm: clampFloat(readNumber(input, ['precipitationMm', 'precipitation_mm']), 0, 500, 0) } : {}),
    ...(hasValue(input, ['temperatureC', 'temperature_c']) ? { temperatureC: clampFloat(readNumber(input, ['temperatureC', 'temperature_c']), -80, 80, 0) } : {}),
    weatherAvailable: typeof input.weatherAvailable === 'boolean' ? input.weatherAvailable === true : derivedWeatherAvailable,
    weatherPartial: typeof input.weatherPartial === 'boolean' ? input.weatherPartial === true : derivedWeatherPartial,
    ...(typeof input.wasWeatherUsedInRanking === 'boolean' ? { wasWeatherUsedInRanking: input.wasWeatherUsedInRanking === true } : {}),
    ...(readString(input, ['error']) ? { error: normalizeUiText(readString(input, ['error'])) } : {}),
    source: normalizeUiText(readString(input, ['source']) || 'Open-Meteo') || 'Open-Meteo',
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
  if (normalizeComparableSource(value) === 'EELURIKKUS') return 'EELURIKKUS';
  if (value === 'mixed') return 'mixed';
  return 'GBIF';
}

function normalizeComparableSource(value: string): 'GBIF' | 'EELURIKKUS' {
  const normalized = normalizeUiText(value || '').toUpperCase();
  if (normalized === 'ELURIKKUS' || normalized === 'EELURIKKUS') return 'EELURIKKUS';
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
