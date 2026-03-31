import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const EDGE_FUNCTION_VERSION = 'species-prediction-2026-03-17-async';
const DEFAULT_TIMEOUT_MS = 120000;
const WEBHOOK_ENV_KEY = 'SPECIES_PREDICTION_N8N_WEBHOOK_URL';
const AUTH_HEADER_ENV_KEY = 'SPECIES_PREDICTION_N8N_AUTH_HEADER';
const AUTH_VALUE_ENV_KEY = 'SPECIES_PREDICTION_N8N_AUTH_VALUE';
const TIMEOUT_ENV_KEY = 'SPECIES_PREDICTION_TIMEOUT_MS';
const LOG_PREFIX = '[species-prediction]';
const EXPECTED_PRODUCTION_WEBHOOK_PATH = 'species-prediction-evidence-first';
const SPECIES_PREDICTION_BACKEND_BUILD = '2026-03-23-v3-passthrough';
const INVOKE_ROUTE_VERSION = 'fix20';
const EDGE_FUNCTION_FILE = 'supabase/functions/species-prediction/index.ts';
const EDGE_FUNCTION_ENTRYPOINT = 'serve(async (req) => { ... })';
const EDGE_RESPONSE_PROOF = 'served by live species-prediction invoke route';
const EDGE_ROUTE_HEADER = 'live-post-invoke-fix18';
const WEBHOOK_CONFIG_SOURCE = `env:${WEBHOOK_ENV_KEY}`;
const STATUS_NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
  'Pragma': 'no-cache',
} as const;
const INVOCATION_DIAGNOSTICS_FRESHNESS_MS = 30 * 60 * 1000;
// If health/status reports an outdated webhook path, update the Supabase secret
// SPECIES_PREDICTION_N8N_WEBHOOK_URL to:
// https://estbirds.app.n8n.cloud/webhook/species-prediction-evidence-first

console.error(`SPECIES_PREDICTION_BOOT ${INVOKE_ROUTE_VERSION} ${EDGE_FUNCTION_FILE} ${EDGE_FUNCTION_ENTRYPOINT}`);

type WebhookValidationErrorCode =
  | 'MISSING_WEBHOOK_URL'
  | 'INVALID_WEBHOOK_URL'
  | 'INVALID_WEBHOOK_PATH';

type UpstreamErrorCode =
  | 'N8N_WEBHOOK_INACTIVE'
  | 'N8N_UPSTREAM_NON_2XX'
  | 'N8N_UPSTREAM_INVALID_RESPONSE';

type StatusCode =
  | 'NOT_CONFIGURED'
  | 'DEPLOYED_NOT_CONFIGURED'
  | 'CONFIGURED_AVAILABLE'
  | 'CONFIGURED_UNAVAILABLE'
  | 'RUNTIME_ERROR';

type WebhookTargetInfo = {
  envVarName: string;
  envPresent: boolean;
  envLength: number;
  configSource: string;
  rawWebhookPreview: string;
  parsedUrlOk: boolean;
  configuredPathname: string;
  normalizedConfiguredPath: string;
  expectedPath: string;
  fallbackUsed: boolean;
  fallbackValue: string;
  missingWebhookEnv: boolean;
  invalidWebhookUrl: boolean;
  webhookConfigured: boolean;
  valid: boolean;
  configuredWebhookUrl: string;
  configuredWebhookUrlPreview: string;
  configuredWebhookPath: string;
  expectedWebhookPath: string;
  hasOutdatedWebhook: boolean;
  deployed: true;
  available: boolean;
  expectedMethod: 'POST';
  looksLikeProductionWebhook: boolean;
  validationErrorCode: WebhookValidationErrorCode | null;
  validationMessage: string;
};

type SpeciesPredictionUpstreamError = {
  stage: 'missing_webhook_url' | 'n8n_upstream' | 'n8n_non_2xx' | 'invalid_upstream_json';
  code: WebhookValidationErrorCode | UpstreamErrorCode;
  message: string;
  upstreamStatus: number | null;
  upstreamStatusText?: string;
  upstreamMessage?: string;
  upstreamBody: unknown;
  resolvedWebhookUrl: string;
  resolvedWebhookPath: string;
  productionWebhookInactive: boolean;
  backendBuild: string;
  invokeRouteVersion: string;
  summaryShapeUsed: 'nested_aiSummary' | 'flat_legacy' | 'missing';
  summarySourcePath?: string;
  hasTopLevelInsightSummary: boolean;
  hasNestedAiSummaryObject: boolean;
  hasNestedAiSummaryInsight: boolean;
  hasAiSummaryObject?: boolean;
  hasNestedInsightSummary?: boolean;
  upstreamTopLevelKeys?: string[];
  topLevelKeys: string[];
  nestedAiSummaryKeys: string[];
  normalizedInsightLength?: number;
  normalizedWarningsCount?: number;
  normalizedRankingNotesType?: string;
  rankingNotesInputType?: string;
  warningsInputType?: string;
  normalizedPredictionShape?: string;
  errorProofBuild: string;
  entrypointFile?: string;
  entrypointFunction?: string;
  responseProof?: string;
  deployedProjectRef?: string;
  insightSummaryValuePreview?: string;
  nestedInsightSummaryType?: string;
  topLevelInsightSummaryType?: string;
  throwFile?: string;
  throwFunction?: string;
  throwBranch?: string;
};

type NormalizedUpstreamSummary = {
  insightSummary: string;
  confidenceNote: string;
  rankingNotes: string;
  warnings: string[];
  summaryShapeUsed: 'nested_aiSummary' | 'flat_legacy' | 'missing';
  summarySourcePath?: string;
  normalizedInsightLength: number;
  normalizedWarningsCount: number;
  normalizedRankingNotesType?: string;
  hasTopLevelInsightSummary: boolean;
  hasNestedAiSummaryObject: boolean;
  hasNestedAiSummaryInsight: boolean;
  hasAiSummaryObject?: boolean;
  hasNestedInsightSummary?: boolean;
  topLevelKeys: string[];
  nestedAiSummaryKeys: string[];
  rankingNotesInputType?: string;
  warningsInputType?: string;
  normalizedPredictionShape?: string;
};

type NormalizedUpstreamResponse = {
  ok: true;
  status: 'completed';
  error: null;
  speciesKey: string;
  speciesName: string;
  scope: string;
  insightSummary: string;
  confidenceNote: string;
  rankingNotes: string;
  warnings: string[];
  generatedAt: string;
  analysisVersion: string;
  sourceHealth: Record<string, unknown>;
  countryScores: Record<string, unknown>;
  estoniaEvidence: Record<string, unknown>;
  evidenceSummary: Record<string, unknown>;
  foreignClusters: unknown[];
  predictedTargets: unknown[];
  topTarget?: Record<string, unknown>;
  foreignRecentPoints: unknown[];
  estoniaHistoryPoints: unknown[];
  elurikkusRecentRecords: unknown[];
  estoniaHistoryClusters: unknown[];
  mapLayers: Record<string, unknown>;
  mapLayersDefault: Record<string, unknown>;
  species: Record<string, unknown>;
  weather: Record<string, unknown>;
  evidenceState: EvidenceState;
  hasUsableRecentEstoniaEvidence: boolean;
  hasUsableEstoniaHistory: boolean;
  hasUsableForeignPressure: boolean;
  hasUsablePredictedTargets: boolean;
  hasOnlyWeather: boolean;
  hasOnlySourceAvailabilityWithoutUsableEvidence: boolean;
  activeEvidenceSources: string[];
  availableSources: string[];
  attemptedButUnavailable: string[];
  attemptedButReturnedNoUsableEvidence: string[];
  effectiveRankingMode: string;
  summaryGuardrailApplied: boolean;
  summaryGuardrailReason: string;
  summaryOrigin?: SummaryOrigin;
  payloadSourceState?: string;
  summarySourcePath?: string;
  globalMigrationEtas?: unknown[];
  topPredictedPoints?: unknown[];
  aiSummary?: string;
  raw: Record<string, unknown>;
};

type SummaryOrigin =
  | 'normalized_upstream'
  | 'deterministic_structured'
  | 'regenerated_from_structured'
  | 'neutral_sanitizer_fallback';

type CanonicalPredictionRecord = {
  speciesKey: string;
  speciesName: string;
  scope: string;
  generatedAt: string;
  analysisVersion: string;
  externalPressureScore: number;
  species: Record<string, unknown>;
  sourceHealth: Record<string, unknown>;
  countryScores: Record<string, unknown>;
  estoniaEvidence: Record<string, unknown>;
  evidenceSummary: Record<string, unknown>;
  foreignClusters: unknown[];
  predictedTargets: unknown[];
  topTarget: Record<string, unknown> | null;
  foreignRecentPoints: unknown[];
  estoniaHistoryPoints: unknown[];
  elurikkusRecentRecords: unknown[];
  estoniaHistoryClusters: unknown[];
  mapLayers: Record<string, unknown>;
  mapLayersDefault: Record<string, unknown>;
  weather: Record<string, unknown>;
  evidenceState: EvidenceState;
  hasUsableRecentEstoniaEvidence: boolean;
  hasUsableEstoniaHistory: boolean;
  hasUsableForeignPressure: boolean;
  hasUsablePredictedTargets: boolean;
  hasOnlyWeather: boolean;
  hasOnlySourceAvailabilityWithoutUsableEvidence: boolean;
  activeEvidenceSources: string[];
  availableSources: string[];
  attemptedButUnavailable: string[];
  attemptedButReturnedNoUsableEvidence: string[];
  effectiveRankingMode: string;
  insightSummary: string;
  confidenceNote: string;
  rankingNotes: string;
  warnings: string[];
  summaryGuardrailApplied: boolean;
  summaryGuardrailReason: string;
  summaryOrigin: SummaryOrigin;
  consistencyChecks: {
    routeLooksPlausible: boolean;
    timingLooksPlausible: boolean;
    weatherLooksSupportive: boolean;
    foreignPressureMatchesNarrative: boolean;
  };
  summaryRegeneratedFromStructuredEvidence: boolean;
  globalMigrationEtas: unknown[];
};

type EvidenceState = 'recent_estonia' | 'estonia_history' | 'foreign_pressure' | 'mixed' | 'weather_only_insufficient' | 'insufficient';

type EvidenceStateSnapshot = {
  hasUsableRecentEstoniaEvidence: boolean;
  hasUsableEstoniaHistory: boolean;
  hasUsableForeignPressure: boolean;
  hasUsablePredictedTargets: boolean;
  hasOnlyWeather: boolean;
  hasOnlySourceAvailabilityWithoutUsableEvidence: boolean;
  activeEvidenceSources: string[];
  availableSources: string[];
  attemptedButUnavailable: string[];
  attemptedButReturnedNoUsableEvidence: string[];
  totalForeignRecentPoints: number;
  primaryCountries: string[];
  effectiveRankingMode: string;
  evidenceState: EvidenceState;
};

type SummaryGuardrailResult = {
  insightSummary: string;
  confidenceNote: string;
  rankingNotes: string;
  warnings: string[];
  summaryGuardrailApplied: boolean;
  summaryGuardrailReason: string;
  originalAiSummarySnippet: string;
  finalAiSummarySnippet: string;
};

const INSUFFICIENT_EVIDENCE_FALLBACK = {
  insightSummary: 'Usable prediction evidence is currently missing. No recent Estonia records, Estonia history clusters, foreign pressure points, or predicted targets were available in this result. Weather alone is not enough to support a meaningful arrival prediction.',
  confidenceNote: 'Confidence is limited because the result is driven by missing usable evidence rather than positive signals.',
  rankingNotes: 'Ranking was not supported by usable Estonia recent evidence, Estonia history, or foreign pressure. Weather was available but is insufficient on its own for ranking.',
  warnings: [
    'No usable recent Estonia evidence',
    'No usable Estonia history clusters',
    'No usable foreign pressure',
    'No predicted targets returned',
    'Weather alone is insufficient for prediction',
  ],
} as const;

type CleanPredictionContext = {
  speciesKey?: string;
  speciesName?: string;
  scope?: string;
};

type LastInvocationEvidence = {
  lastInvocationStatus: string;
  lastInvocationAt: string;
  lastInvocationErrorStage: string;
  lastInvocationMessage: string;
  diagnosticsAgeMs: number | null;
};

type StatusDecision = {
  configured: boolean;
  available: boolean;
  runtimeReachable: boolean | null;
  runtimeProbeUsed: boolean;
  runtimeProbeMethod: string;
  runtimeProbeReason: string;
  statusDecisionReason: string;
  statusCode: StatusCode;
  reasonCode: string | null;
  message: string;
};

function buildWebhookTargetInfo(input: Partial<WebhookTargetInfo>): WebhookTargetInfo {
  const normalizedConfiguredPath = input.normalizedConfiguredPath || '';
  const expectedWebhookPath = EXPECTED_PRODUCTION_WEBHOOK_PATH;
  const hasOutdatedWebhook = normalizedConfiguredPath === 'species-prediction';
  return {
    envVarName: WEBHOOK_ENV_KEY,
    envPresent: input.envPresent === true,
    envLength: input.envLength || 0,
    configSource: WEBHOOK_CONFIG_SOURCE,
    rawWebhookPreview: input.rawWebhookPreview || '',
    parsedUrlOk: input.parsedUrlOk === true,
    configuredPathname: input.configuredPathname || '',
    normalizedConfiguredPath,
    expectedPath: expectedWebhookPath,
    fallbackUsed: input.fallbackUsed === true,
    fallbackValue: input.fallbackValue || '',
    missingWebhookEnv: input.missingWebhookEnv === true,
    invalidWebhookUrl: input.invalidWebhookUrl === true,
    webhookConfigured: input.webhookConfigured === true,
    valid: input.valid === true,
    configuredWebhookUrl: input.configuredWebhookUrl || '',
    configuredWebhookUrlPreview: input.configuredWebhookUrlPreview || '',
    configuredWebhookPath: input.configuredWebhookPath || normalizedConfiguredPath,
    expectedWebhookPath,
    hasOutdatedWebhook,
    deployed: true,
    available: input.available === true,
    expectedMethod: 'POST',
    looksLikeProductionWebhook: input.looksLikeProductionWebhook === true,
    validationErrorCode: input.validationErrorCode || null,
    validationMessage: input.validationMessage || '',
  };
}

function redactWebhookUrlPreview(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw.replace(/[?#].*$/, '');
  }
}

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeWebhookPath(pathname: string): string {
  const trimmed = String(pathname || '').trim();
  const withoutSlashes = trimmed.replace(/^\/+|\/+$/g, '');
  const segments = withoutSlashes.split('/').filter(Boolean);
  const webhookIndex = segments.findIndex((segment) => segment === 'webhook' || segment === 'webhook-test');
  if (webhookIndex >= 0) {
    return segments.slice(webhookIndex + 1).join('/');
  }
  return segments.join('/');
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function getDeployedProjectRef(): string {
  const explicit = (Deno.env.get('SUPABASE_PROJECT_REF') || '').trim();
  if (explicit) return explicit;
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  if (!supabaseUrl) return '';
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

function buildEntrypointMarkers(): Record<string, unknown> {
  return {
    backendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
    invokeRouteVersion: INVOKE_ROUTE_VERSION,
    entrypointFile: EDGE_FUNCTION_FILE,
    entrypointFunction: EDGE_FUNCTION_ENTRYPOINT,
    responseProof: EDGE_RESPONSE_PROOF,
    ...(getDeployedProjectRef() ? { deployedProjectRef: getDeployedProjectRef() } : {}),
  };
}

async function getLastInvocationEvidence(admin: ReturnType<typeof getSupabaseAdmin>): Promise<LastInvocationEvidence> {
  try {
    const { data, error } = await admin
      .from('prediction_jobs')
      .select('status, updated_at, error_json')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      return {
        lastInvocationStatus: '',
        lastInvocationAt: '',
        lastInvocationErrorStage: '',
        lastInvocationMessage: '',
        diagnosticsAgeMs: null,
      };
    }
    const errorJson = data.error_json && typeof data.error_json === 'object' && !Array.isArray(data.error_json)
      ? data.error_json as Record<string, unknown>
      : {};
    const lastInvocationAt = typeof data.updated_at === 'string' ? data.updated_at : '';
    const parsedTime = lastInvocationAt ? new Date(lastInvocationAt).getTime() : Number.NaN;
    return {
      lastInvocationStatus: typeof data.status === 'string' ? data.status : '',
      lastInvocationAt,
      lastInvocationErrorStage: typeof errorJson.stage === 'string' ? errorJson.stage : '',
      lastInvocationMessage: typeof errorJson.message === 'string' ? errorJson.message : '',
      diagnosticsAgeMs: Number.isFinite(parsedTime) ? Math.max(0, Date.now() - parsedTime) : null,
    };
  } catch {
    return {
      lastInvocationStatus: '',
      lastInvocationAt: '',
      lastInvocationErrorStage: '',
      lastInvocationMessage: '',
      diagnosticsAgeMs: null,
    };
  }
}

function buildStatusDecision(webhookTarget: WebhookTargetInfo, lastInvocation: LastInvocationEvidence): StatusDecision {
  if (!webhookTarget.webhookConfigured || webhookTarget.missingWebhookEnv) {
    return {
      configured: false,
      available: false,
      runtimeReachable: null,
      runtimeProbeUsed: false,
      runtimeProbeMethod: 'none',
      runtimeProbeReason: 'no_runtime_probe_for_invalid_config',
      statusDecisionReason: 'missing_webhook_env',
      statusCode: 'NOT_CONFIGURED',
      reasonCode: webhookTarget.validationErrorCode || 'MISSING_WEBHOOK_URL',
      message: `Prediction backend is not configured yet because Supabase secret ${WEBHOOK_ENV_KEY} is missing.`,
    };
  }
  if (!webhookTarget.valid || webhookTarget.invalidWebhookUrl) {
    return {
      configured: false,
      available: false,
      runtimeReachable: null,
      runtimeProbeUsed: false,
      runtimeProbeMethod: 'none',
      runtimeProbeReason: 'no_runtime_probe_for_invalid_config',
      statusDecisionReason: 'invalid_webhook_url',
      statusCode: 'DEPLOYED_NOT_CONFIGURED',
      reasonCode: webhookTarget.validationErrorCode || 'INVALID_WEBHOOK_URL',
      message: `Prediction backend has an invalid n8n webhook configuration in ${WEBHOOK_ENV_KEY}.`,
    };
  }
  if (webhookTarget.hasOutdatedWebhook || !webhookTarget.looksLikeProductionWebhook) {
    return {
      configured: false,
      available: false,
      runtimeReachable: null,
      runtimeProbeUsed: false,
      runtimeProbeMethod: 'none',
      runtimeProbeReason: 'no_runtime_probe_for_invalid_config',
      statusDecisionReason: 'outdated_webhook_path',
      statusCode: 'DEPLOYED_NOT_CONFIGURED',
      reasonCode: 'INVALID_WEBHOOK_PATH',
      message: `Supabase secret ${WEBHOOK_ENV_KEY} is still configured with webhook path ${webhookTarget.configuredWebhookPath}, expected ${webhookTarget.expectedWebhookPath}`,
    };
  }

  const diagnosticsAreFresh = lastInvocation.diagnosticsAgeMs != null && lastInvocation.diagnosticsAgeMs <= INVOCATION_DIAGNOSTICS_FRESHNESS_MS;
  if (diagnosticsAreFresh && lastInvocation.lastInvocationStatus === 'failed') {
    return {
      configured: true,
      available: false,
      runtimeReachable: false,
      runtimeProbeUsed: false,
      runtimeProbeMethod: 'none',
      runtimeProbeReason: 'recent_real_invocation_evidence',
      statusDecisionReason: 'recent_real_invocation_failure',
      statusCode: 'CONFIGURED_UNAVAILABLE',
      reasonCode: 'RUNTIME_ERROR',
      message: lastInvocation.lastInvocationMessage || 'Prediction backend is configured but the latest real invocation failed.',
    };
  }
  if (diagnosticsAreFresh && lastInvocation.lastInvocationStatus === 'completed') {
    return {
      configured: true,
      available: true,
      runtimeReachable: true,
      runtimeProbeUsed: false,
      runtimeProbeMethod: 'none',
      runtimeProbeReason: 'recent_real_invocation_evidence',
      statusDecisionReason: 'recent_real_invocation_success',
      statusCode: 'CONFIGURED_AVAILABLE',
      reasonCode: null,
      message: 'Prediction backend is deployed, configured, and recently succeeded on a real invocation.',
    };
  }
  if (lastInvocation.lastInvocationStatus === 'failed' && lastInvocation.diagnosticsAgeMs != null && lastInvocation.diagnosticsAgeMs > INVOCATION_DIAGNOSTICS_FRESHNESS_MS) {
    return {
      configured: true,
      available: true,
      runtimeReachable: null,
      runtimeProbeUsed: false,
      runtimeProbeMethod: 'none',
      runtimeProbeReason: 'no_dedicated_runtime_probe_configured',
      statusDecisionReason: 'stale_invocation_failure_ignored',
      statusCode: 'CONFIGURED_AVAILABLE',
      reasonCode: null,
      message: 'Prediction backend is configured. Older invocation failures are outside the active diagnostics window.',
    };
  }
  return {
    configured: true,
    available: true,
    runtimeReachable: null,
    runtimeProbeUsed: false,
    runtimeProbeMethod: 'none',
    runtimeProbeReason: 'no_dedicated_runtime_probe_configured',
    statusDecisionReason: 'configured_valid_no_runtime_probe',
    statusCode: 'CONFIGURED_AVAILABLE',
    reasonCode: null,
    message: 'Prediction backend is configured and no dedicated runtime probe is required.',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'x-species-prediction-build': SPECIES_PREDICTION_BACKEND_BUILD,
        'x-species-prediction-route': EDGE_ROUTE_HEADER,
      },
    });
  }

  try {
    const url = new URL(req.url);
    const webhookTarget = resolveWebhookTarget();
    const webhookUrl = webhookTarget.configuredWebhookUrl;
    const webhookConfigured = webhookTarget.webhookConfigured;
    const timeoutMsUsed = resolveTimeoutMs();

    // ── GET ?mode=status ──
    if (req.method === 'GET' && url.searchParams.get('mode') === 'status') {
      const admin = getSupabaseAdmin();
      const lastInvocation = await getLastInvocationEvidence(admin);
      const statusDecision = buildStatusDecision(webhookTarget, lastInvocation);
      console.info(`${LOG_PREFIX} webhook_config`, {
        parsedEnvVariableName: WEBHOOK_ENV_KEY,
        parsedConfiguredPath: webhookTarget.configuredWebhookPath,
        expectedPath: webhookTarget.expectedWebhookPath,
        configSource: webhookTarget.configSource,
      });
      console.info(`${LOG_PREFIX} status check`, {
        webhookConfigured,
        webhookValid: webhookTarget.valid,
        statusCode: statusDecision.statusCode,
        reasonCode: statusDecision.reasonCode,
        expectedWebhookPath: webhookTarget.expectedWebhookPath,
        configuredWebhookPath: webhookTarget.configuredWebhookPath,
        hasOutdatedWebhook: webhookTarget.hasOutdatedWebhook,
        resolvedWebhookPath: webhookTarget.configuredWebhookPath,
        statusDecisionReason: statusDecision.statusDecisionReason,
        lastInvocationStatus: lastInvocation.lastInvocationStatus,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
        predictionBackendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
      });
      return json({
        ok: true,
        stage: 'status',
        predictionBackendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
        ...buildEntrypointMarkers(),
        summaryShapeUsed: 'missing',
        hasTopLevelInsightSummary: false,
        hasNestedAiSummaryObject: false,
        hasNestedAiSummaryInsight: false,
        topLevelKeys: [],
        nestedAiSummaryKeys: [],
        available: statusDecision.available,
        deployed: webhookTarget.deployed,
        configured: statusDecision.configured,
        webhookConfigured,
        webhookValid: webhookTarget.valid,
        runtimeAvailable: statusDecision.runtimeReachable === true,
        runtimeReachable: statusDecision.runtimeReachable,
        runtimeProbeUsed: statusDecision.runtimeProbeUsed,
        runtimeProbeMethod: statusDecision.runtimeProbeMethod,
        runtimeProbeReason: statusDecision.runtimeProbeReason,
        lastInvocationStatus: lastInvocation.lastInvocationStatus,
        lastInvocationAt: lastInvocation.lastInvocationAt,
        lastInvocationErrorStage: lastInvocation.lastInvocationErrorStage,
        lastInvocationMessage: lastInvocation.lastInvocationMessage,
        diagnosticsAgeMs: lastInvocation.diagnosticsAgeMs,
        statusDecisionReason: statusDecision.statusDecisionReason,
        statusCode: statusDecision.statusCode,
        reasonCode: statusDecision.reasonCode,
        expectedWebhookPath: webhookTarget.expectedWebhookPath,
        configuredWebhookPath: webhookTarget.configuredWebhookPath,
        configuredWebhookUrlPreview: webhookTarget.configuredWebhookUrlPreview,
        hasOutdatedWebhook: webhookTarget.hasOutdatedWebhook,
        envVarName: webhookTarget.envVarName,
        envPresent: webhookTarget.envPresent,
        envLength: webhookTarget.envLength,
        configSource: webhookTarget.configSource,
        rawWebhookPreview: webhookTarget.rawWebhookPreview,
        parsedUrlOk: webhookTarget.parsedUrlOk,
        configuredPathname: webhookTarget.configuredPathname,
        normalizedConfiguredPath: webhookTarget.normalizedConfiguredPath,
        expectedPath: webhookTarget.expectedPath,
        fallbackUsed: webhookTarget.fallbackUsed,
        fallbackValue: webhookTarget.fallbackValue,
        missingWebhookEnv: webhookTarget.missingWebhookEnv,
        invalidWebhookUrl: webhookTarget.invalidWebhookUrl,
        resolvedWebhookUrl: webhookTarget.configuredWebhookUrl,
        resolvedWebhookPath: webhookTarget.configuredWebhookPath,
        expectedMethod: webhookTarget.expectedMethod,
        looksLikeProductionWebhook: webhookTarget.looksLikeProductionWebhook,
        validationErrorCode: webhookTarget.validationErrorCode,
        validationMessage: webhookTarget.validationMessage,
        verificationAttempted: false,
        verificationSafeMode: true,
        productionWebhookReachable: null,
        productionWebhookInactive: false,
        upstreamStatus: null,
        upstreamStatusText: '',
        upstreamMessage: '',
        upstreamBody: null,
        timeoutMsUsed,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
        timestamp: new Date().toISOString(),
        message: statusDecision.message,
      }, 200, STATUS_NO_CACHE_HEADERS);
    }

    // ── GET ?mode=poll&requestId=X ──
    if (req.method === 'GET' && url.searchParams.get('mode') === 'poll') {
      const requestId = (url.searchParams.get('requestId') || '').trim();
      if (!requestId) {
        return json({ ok: false, message: 'Missing requestId parameter' }, 400);
      }
      console.info(`${LOG_PREFIX} poll`, { requestId });
      const admin = getSupabaseAdmin();
      const { data: job, error: jobError } = await admin
        .from('prediction_jobs')
        .select('*')
        .eq('request_id', requestId)
        .maybeSingle();

      if (jobError) {
        console.error(`${LOG_PREFIX} poll db error`, { requestId, error: String(jobError) });
        return json({ ok: false, message: 'Failed to retrieve job status' }, 500);
      }
      if (!job) {
        return json({ ok: false, message: `Job ${requestId} not found` }, 404);
      }

      const response: Record<string, unknown> = {
        ok: true,
        requestId: job.request_id,
        status: job.status,
        speciesKey: job.species_key,
        speciesName: job.species_name,
        scope: job.scope,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        generatedAt: job.generated_at,
        analysisVersion: job.analysis_version,
      };

      const normalizedStoredError = job.error_json && typeof job.error_json === 'object' && !Array.isArray(job.error_json)
        ? buildCleanPredictionResult(job.error_json as Record<string, unknown>, {
          speciesKey: typeof job.species_key === 'string' ? job.species_key : '',
          speciesName: typeof job.species_name === 'string' ? job.species_name : '',
          scope: typeof job.scope === 'string' ? job.scope : 'linnuliigid',
        })
        : null;

      if (job.status === 'completed' && job.result_json) {
        if (typeof job.result_json === 'object' && job.result_json && !Array.isArray(job.result_json)) {
          const storedResult = job.result_json as Record<string, unknown>;
          const needsDefensiveFinalization = stringOr(storedResult.backendBuild) !== SPECIES_PREDICTION_BACKEND_BUILD
            || stringOr(storedResult.invokeRouteVersion) !== INVOKE_ROUTE_VERSION
            || stringOr(storedResult.responseProof) !== EDGE_RESPONSE_PROOF
            || !stringOr(storedResult.summaryOrigin);
          logPredictionSummaryState('poll_read_result_json', 'poll_completed_result', storedResult, {
            polledObjectCameFromResultJsonUnchangedExceptMarkers: !needsDefensiveFinalization,
            needsDefensiveFinalization,
          });
          const polledResult = needsDefensiveFinalization
            ? finalizePredictionResponse(withEdgeResponseMarkers(storedResult), 'poll_completed_result_defensive')
            : storedResult;
          response.result = withEdgeResponseMarkers(polledResult);
        } else {
          response.result = job.result_json;
        }
      }
      if (job.status === 'failed' && job.error_json) {
        if (normalizedStoredError) {
          logPredictionSummaryState('poll_recovered_result', 'poll_failed_recovered_result', normalizedStoredError as unknown as Record<string, unknown>, {
            polledObjectCameFromResultJsonUnchangedExceptMarkers: false,
          });
          response.status = 'completed';
          response.generatedAt = typeof normalizedStoredError.generatedAt === 'string' ? normalizedStoredError.generatedAt : job.generated_at;
          response.analysisVersion = typeof normalizedStoredError.analysisVersion === 'string' ? normalizedStoredError.analysisVersion : job.analysis_version;
          response.result = withEdgeResponseMarkers(normalizedStoredError as Record<string, unknown>);
        } else {
          response.error = typeof job.error_json === 'object' && job.error_json && !Array.isArray(job.error_json)
            ? withEdgeResponseMarkers(job.error_json as Record<string, unknown>)
            : job.error_json;
        }
      }

      return json(response);
    }

    // ── POST: create async prediction job ──
    if (req.method !== 'POST') {
      return json({ ok: false, message: 'Method not allowed' }, 405);
    }

    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    console.info(`${LOG_PREFIX} request_received`, { requestId, edgeFunctionVersion: EDGE_FUNCTION_VERSION });

    let body: unknown;
    try {
      body = await req.json();
    } catch (err) {
      console.warn(`${LOG_PREFIX} invalid JSON body`, { requestId, error: String(err) });
      return json({
        ok: false,
        message: 'Invalid request body',
        requestId,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      }, 400);
    }

    const payload = body as Record<string, unknown> | null;
    const species = payload?.species as Record<string, unknown> | undefined;
    const settings = payload?.settings as Record<string, unknown> | undefined;
    const speciesKey = typeof species?.key === 'string' ? species.key.trim() : '';
    const speciesName = typeof species?.name === 'string' ? species.name.trim() : '';
    const scope = typeof payload?.scope === 'string' ? payload.scope.trim() : 'linnuliigid';

    if (!speciesKey || !speciesName) {
      return json({
        ok: false,
        message: 'Missing species information for prediction',
        requestId,
        stage: 'parse',
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      }, 400);
    }

    // Create job record
    const admin = getSupabaseAdmin();
    const { error: insertError } = await admin
      .from('prediction_jobs')
      .insert({
        request_id: requestId,
        species_key: speciesKey,
        species_name: speciesName,
        scope,
        status: 'running',
        settings: settings ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`${LOG_PREFIX} failed to create job`, { requestId, error: String(insertError) });
      return json({
        ok: false,
        message: 'Failed to create prediction job',
        requestId,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      }, 500);
    }

    console.info(`${LOG_PREFIX} job created, starting background n8n call`, {
      requestId,
      speciesKey,
      speciesName,
      timeoutMsUsed,
    });

    // Fire-and-forget background work
    const backgroundWork = executeN8nAndPersist({
      requestId,
      webhookUrl,
      webhookConfigured,
      webhookTarget,
      payload: payload ?? {},
      speciesKey,
      speciesName,
      timeoutMsUsed,
      admin,
    });

    // Keep background work alive via waitUntil if available
    try {
      const runtime = (globalThis as Record<string, unknown>).EdgeRuntime as
        | { waitUntil?: (p: Promise<unknown>) => void }
        | undefined;
      if (runtime?.waitUntil) {
        runtime.waitUntil(backgroundWork);
      }
    } catch {
      // waitUntil not available - background work may get killed
    }

    // Return immediately with 202 Accepted
    return json({
      ok: true,
      accepted: true,
      requestId,
      status: 'running',
      speciesKey,
      speciesName,
      scope,
      edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      message: 'Prediction job accepted and running',
    }, 202);

  } catch (err) {
    console.error(`${LOG_PREFIX} unexpected error`, { error: String(err) });
    return json({
      ok: false,
      message: 'Prediction service encountered an unexpected error',
      edgeFunctionVersion: EDGE_FUNCTION_VERSION,
    }, 500);
  }
});

// ── Background worker: call n8n and persist result ──
async function executeN8nAndPersist(opts: {
  requestId: string;
  webhookUrl: string;
  webhookConfigured: boolean;
  webhookTarget: WebhookTargetInfo;
  payload: Record<string, unknown>;
  speciesKey: string;
  speciesName: string;
  timeoutMsUsed: number;
  admin: ReturnType<typeof getSupabaseAdmin>;
}): Promise<void> {
  const { requestId, webhookUrl, webhookConfigured, webhookTarget, payload, speciesKey, speciesName, timeoutMsUsed, admin } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMsUsed);

  try {
    console.info(`${LOG_PREFIX} evidence_assembly_start`, { requestId, speciesKey });
    let resultObj = await buildMapFirstPredictionResult({
      payload,
      speciesKey,
      speciesName,
      webhookConfigured,
      webhookTarget,
      webhookUrl,
      signal: controller.signal,
    });
    if (stringOr(resultObj.payloadSourceState) !== 'n8n_v3_passthrough') {
      resultObj = finalizePredictionResponse(resultObj, 'persist_main_result');
    }
    const analysisVersion = typeof resultObj.analysisVersion === 'string' ? resultObj.analysisVersion : null;
    const generatedAt = typeof resultObj.generatedAt === 'string' ? resultObj.generatedAt : new Date().toISOString();

    console.info(`${LOG_PREFIX} evidence_assembly_success`, {
      requestId,
      speciesKey,
      analysisVersion,
      generatedAt,
    });
    logPredictionSummaryState('before_persist', 'persist_main_result', resultObj, {
      persistedObjectIsFinalizedObject: true,
    });

    await admin.from('prediction_jobs').update({
      status: 'completed',
      result_json: resultObj,
      analysis_version: analysisVersion,
      generated_at: generatedAt,
      updated_at: new Date().toISOString(),
    }).eq('request_id', requestId);

  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const upstreamError = normalizePredictionError(err, webhookTarget);
    let recoveredResult = upstreamError
      ? buildCleanPredictionResult(upstreamError.upstreamBody, {
        speciesKey,
        speciesName,
        scope: typeof payload.scope === 'string' ? payload.scope : 'linnuliigid',
      })
      : null;
    if (recoveredResult) recoveredResult = finalizePredictionResponse(recoveredResult as unknown as Record<string, unknown>, 'persist_recovered_result') as unknown as NormalizedUpstreamResponse;
    const errorMessage = isAbort
      ? 'Prediction request timed out'
      : (upstreamError?.message || 'Prediction service evidence assembly error');
    console.error(`${LOG_PREFIX} background_error`, { requestId, isAbort, error: String(err) });

    try {
      if (recoveredResult) {
        logPredictionSummaryState('before_persist', 'persist_recovered_result', recoveredResult as unknown as Record<string, unknown>, {
          persistedObjectIsFinalizedObject: true,
        });
      }
      await admin.from('prediction_jobs').update(recoveredResult ? {
        status: 'completed',
        result_json: recoveredResult,
        analysis_version: typeof recoveredResult.analysisVersion === 'string' ? recoveredResult.analysisVersion : null,
        generated_at: typeof recoveredResult.generatedAt === 'string' ? recoveredResult.generatedAt : new Date().toISOString(),
        error_json: null,
        updated_at: new Date().toISOString(),
      } : {
        status: 'failed',
        error_json: upstreamError ?? { message: errorMessage, detail: String(err) },
        updated_at: new Date().toISOString(),
      }).eq('request_id', requestId);
    } catch { /* ignore */ }
  } finally {
    clearTimeout(timer);
  }
}

function readWebhookUrl(): string {
  return (Deno.env.get(WEBHOOK_ENV_KEY) || '').trim();
}

function resolveTimeoutMs(): number {
  const value = Number(Deno.env.get(TIMEOUT_ENV_KEY) || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(180000, Math.max(5000, value));
}

function json(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(withEdgeResponseMarkers(body)), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'x-species-prediction-build': SPECIES_PREDICTION_BACKEND_BUILD,
      'x-species-prediction-route': EDGE_ROUTE_HEADER,
      ...extraHeaders,
    },
  });
}

function withEdgeResponseMarkers(body: Record<string, unknown>): Record<string, unknown> {
  const isErrorLike = body.ok === false
    || typeof body.error === 'string'
    || (typeof body.message === 'string' && String(body.message).toLowerCase().includes('error'));
  return {
    ...body,
    ...buildEntrypointMarkers(),
    backendBuild: typeof body.backendBuild === 'string' ? body.backendBuild : SPECIES_PREDICTION_BACKEND_BUILD,
    invokeRouteVersion: typeof body.invokeRouteVersion === 'string' ? body.invokeRouteVersion : INVOKE_ROUTE_VERSION,
    ...(isErrorLike ? {
      summaryShapeUsed: body.summaryShapeUsed === 'nested_aiSummary' || body.summaryShapeUsed === 'flat_legacy' || body.summaryShapeUsed === 'missing'
        ? body.summaryShapeUsed
        : 'missing',
      ...(typeof body.summarySourcePath === 'string' ? { summarySourcePath: body.summarySourcePath } : {}),
      hasTopLevelInsightSummary: body.hasTopLevelInsightSummary === true,
      hasNestedAiSummaryObject: body.hasNestedAiSummaryObject === true,
      hasNestedAiSummaryInsight: body.hasNestedAiSummaryInsight === true,
      ...(body.hasAiSummaryObject === true ? { hasAiSummaryObject: true } : {}),
      ...(body.hasNestedInsightSummary === true ? { hasNestedInsightSummary: true } : {}),
      ...(Array.isArray(body.upstreamTopLevelKeys) ? { upstreamTopLevelKeys: body.upstreamTopLevelKeys } : {}),
      topLevelKeys: Array.isArray(body.topLevelKeys) ? body.topLevelKeys : [],
      nestedAiSummaryKeys: Array.isArray(body.nestedAiSummaryKeys) ? body.nestedAiSummaryKeys : [],
      ...(typeof body.normalizedInsightLength === 'number' ? { normalizedInsightLength: body.normalizedInsightLength } : {}),
      ...(typeof body.normalizedWarningsCount === 'number' ? { normalizedWarningsCount: body.normalizedWarningsCount } : {}),
      ...(typeof body.normalizedRankingNotesType === 'string' ? { normalizedRankingNotesType: body.normalizedRankingNotesType } : {}),
      ...(typeof body.rankingNotesInputType === 'string' ? { rankingNotesInputType: body.rankingNotesInputType } : {}),
      ...(typeof body.warningsInputType === 'string' ? { warningsInputType: body.warningsInputType } : {}),
      ...(typeof body.normalizedPredictionShape === 'string' ? { normalizedPredictionShape: body.normalizedPredictionShape } : {}),
      ...(typeof body.summaryAcceptedBy === 'string' ? { summaryAcceptedBy: body.summaryAcceptedBy } : {}),
      ...(body.liveInvokeAcceptedNestedAiSummary === true ? { liveInvokeAcceptedNestedAiSummary: true } : {}),
      ...(typeof body.normalizationProof === 'string' ? { normalizationProof: body.normalizationProof } : {}),
    } : {}),
    ...(typeof body.entrypointFile === 'string' ? { entrypointFile: body.entrypointFile } : {}),
    ...(typeof body.entrypointFunction === 'string' ? { entrypointFunction: body.entrypointFunction } : {}),
    ...(typeof body.responseProof === 'string' ? { responseProof: body.responseProof } : {}),
    ...(typeof body.deployedProjectRef === 'string' && body.deployedProjectRef ? { deployedProjectRef: body.deployedProjectRef } : {}),
    ...(typeof body.insightSummaryValuePreview === 'string' ? { insightSummaryValuePreview: body.insightSummaryValuePreview } : {}),
    ...(typeof body.nestedInsightSummaryType === 'string' ? { nestedInsightSummaryType: body.nestedInsightSummaryType } : {}),
    ...(typeof body.topLevelInsightSummaryType === 'string' ? { topLevelInsightSummaryType: body.topLevelInsightSummaryType } : {}),
    ...(typeof body.throwFile === 'string' ? { throwFile: body.throwFile } : {}),
    ...(typeof body.throwFunction === 'string' ? { throwFunction: body.throwFunction } : {}),
    ...(typeof body.throwBranch === 'string' ? { throwBranch: body.throwBranch } : {}),
    ...(isErrorLike
      ? { errorProofBuild: typeof body.errorProofBuild === 'string' ? body.errorProofBuild : SPECIES_PREDICTION_BACKEND_BUILD }
      : {}),
  };
}

function buildSummaryShapeDiagnostics(data: unknown): {
  hasTopLevelInsightSummary: boolean;
  hasNestedAiSummaryObject: boolean;
  hasNestedAiSummaryInsight: boolean;
  topLevelKeys: string[];
  nestedAiSummaryKeys: string[];
  insightSummaryType: string;
} {
  const record = asRecord(data);
  const aiSummaryRecord = asRecord(record.aiSummary);
  const nestedInsight = aiSummaryRecord.insightSummary;
  return {
    hasTopLevelInsightSummary: typeof record.insightSummary === 'string' && record.insightSummary.trim().length > 0,
    hasNestedAiSummaryObject: Object.keys(aiSummaryRecord).length > 0,
    hasNestedAiSummaryInsight: typeof nestedInsight === 'string' && nestedInsight.trim().length > 0,
    topLevelKeys: Object.keys(record),
    nestedAiSummaryKeys: Object.keys(aiSummaryRecord),
    insightSummaryType: typeof nestedInsight,
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text?.slice(0, 500) || '';
  }
}

async function buildMapFirstPredictionResult(opts: {
  payload: Record<string, unknown>;
  speciesKey: string;
  speciesName: string;
  webhookConfigured: boolean;
  webhookTarget: WebhookTargetInfo;
  webhookUrl: string;
  signal: AbortSignal;
}): Promise<Record<string, unknown>> {
  const { payload, speciesKey, speciesName, webhookConfigured, webhookTarget, webhookUrl, signal } = opts;
  const payloadSpecies = asRecord(payload.species);
  const settings = asRecord(payload.settings);
  const latinName = stringOr(payloadSpecies.latinName);
  const ebirdSpeciesCode = stringOr(settings.ebirdSpeciesCodeOverride, payloadSpecies.ebirdSpeciesCode, payloadSpecies.ebirdSpeciesCodeOverride);
  const horizonDays = clampInt(toNumber(settings.horizonDays) || 7, 1, 30);

  const estoniaHistorySource = settings.useElurikkusHistory === false ? 'GBIF' : 'EELURIKKUS';
  const elurikkusHistoryPoints = settings.useElurikkusHistory === false ? [] : await fetchElurikkusEstoniaHistory(speciesName, signal);
  const gbifHistoryPoints = await fetchGbifEstoniaHistory(latinName || speciesName, signal);
  const mergedEstoniaHistoryPoints = elurikkusHistoryPoints.length
    ? [...elurikkusHistoryPoints, ...gbifHistoryPoints]
    : gbifHistoryPoints;
  const estoniaHistoryPoints = dedupeEstoniaHistoryPoints(mergedEstoniaHistoryPoints);
  const estoniaHistoryClusters = clusterEstoniaHistory(estoniaHistoryPoints);
  const foreignRecentPoints = ebirdSpeciesCode
    ? await fetchForeignRecentPoints(ebirdSpeciesCode, settings, signal)
    : [];
  const foreignClusters = clusterForeignRecentPoints(foreignRecentPoints);
  const weather = await fetchWeatherForPrediction(foreignClusters, signal);
  const estoniaEvidence = buildEstoniaEvidenceFromHistory(estoniaHistoryPoints);
  const historicalEvidence = buildHistoricalEvidenceFromHistory(estoniaHistoryClusters);
  const foreignEvidence = buildForeignEvidenceFromPointsAndClusters(foreignRecentPoints, foreignClusters);
  const predictedTargets = buildPredictedTargets({
    speciesName,
    estoniaHistoryClusters,
    foreignClusters,
    foreignRecentPoints,
    weather,
    estoniaEvidence,
    horizonDays,
  });
  const predictionVectors = buildPredictionVectors(foreignClusters, predictedTargets, weather, settings);
  const rawLinks = buildRawLinks(speciesName, foreignEvidence);
  const sourceHealth = buildSourceHealthMapFirst({
    estoniaHistoryPoints,
    estoniaHistoryClusters,
    foreignRecentPoints,
    foreignClusters,
    webhookConfigured,
    estoniaHistorySourceUsed: elurikkusHistoryPoints.length && gbifHistoryPoints.length
      ? 'mixed'
      : (elurikkusHistoryPoints.length ? 'EELURIKKUS' : (estoniaHistoryPoints.length ? 'GBIF' : estoniaHistorySource)),
  });
  const evidenceStateSnapshot = computeEvidenceState({
    estoniaEvidence,
    estoniaHistoryPoints,
    estoniaHistoryClusters,
    foreignRecentPoints,
    foreignClusters,
    foreignEvidence,
    sourceHealth,
    weather,
    predictedTargets,
    topPredictedPoints: predictedTargets,
  });
  const evidenceSummary = buildEvidenceSummary({
    weather,
    sourceHealth,
    evidenceStateSnapshot,
  });
  const warnings = Array.from(new Set(sourceHealth.sourceWarnings as string[]));
  const requiresN8nSummary = settings.enableOpenAISummary === true || settings.enableN8nResearch === true;
  const normalizedN8nResponse = requiresN8nSummary
    ? await maybeFetchSecondarySummary({
      webhookTarget,
      webhookUrl,
      payload,
      signal,
      foreignEvidence,
      predictedTargets,
      weather,
      sourceHealth,
      estoniaEvidence,
      estoniaHistoryPoints,
      estoniaHistoryClusters,
      foreignRecentPoints,
      foreignClusters,
      evidenceStateSnapshot,
    })
    : null;
  if ((normalizedN8nResponse as Record<string, unknown> | null)?.payloadSourceState === 'n8n_v3_passthrough') {
    return attachNormalizationMarkers(normalizedN8nResponse as unknown as Record<string, unknown>);
  }
  const countryScores = buildCountryScores(foreignEvidence);
  const topPredictedPoints = predictedTargets.slice(0, Math.min(5, clampInt(toNumber(settings.outputCount) || 5, 1, 5)));
  const latestCluster = foreignClusters[0] ?? null;
  const baseResult = {
    speciesKey,
    speciesName,
    generatedAt: new Date().toISOString(),
    analysisVersion: `${EDGE_FUNCTION_VERSION}|map-first`,
    species: {
      speciesKey,
      speciesName,
      latinName,
      ebirdSpeciesCode,
    },
    sourceHealth,
    evidenceSummary,
    estoniaHistoryPoints,
    estoniaHistoryClusters,
    foreignRecentPoints,
    foreignClusters,
    weather,
    predictionVectors,
    predictedTargets: topPredictedPoints,
    evidenceState: evidenceStateSnapshot.evidenceState,
    hasUsableRecentEstoniaEvidence: evidenceStateSnapshot.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: evidenceStateSnapshot.hasUsableEstoniaHistory,
    hasUsableForeignPressure: evidenceStateSnapshot.hasUsableForeignPressure,
    hasUsablePredictedTargets: evidenceStateSnapshot.hasUsablePredictedTargets,
    hasOnlyWeather: evidenceStateSnapshot.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: evidenceStateSnapshot.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: evidenceStateSnapshot.activeEvidenceSources,
    availableSources: evidenceStateSnapshot.availableSources,
    attemptedButUnavailable: evidenceStateSnapshot.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: evidenceStateSnapshot.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: evidenceStateSnapshot.effectiveRankingMode,
    summaryGuardrailApplied: false,
    summaryGuardrailReason: '',
    mapLayers: {
      estoniaHistory: true,
      estoniaHistoryPoints: true,
      estoniaHistoryClusters: false,
      foreignRecentPoints: false,
      foreignEvidence: foreignRecentPoints.length > 0 && foreignClusters.length > 0,
      foreignPressureClusters: false,
      predictedLines: settings.showPredictionCone !== false,
      predictedCone: settings.showPredictionCone !== false,
      predictedTargets: true,
      diagnostics: false,
      recentOnly: settings.recentOnlyMapMarkers === true,
    },
    foreignEvidence,
    estoniaEvidence,
    historicalEvidence,
    rawLinks,
    externalPressureScore: clampInt(Math.round(sum(foreignEvidence.map((entry) => toNumber(entry.recordCount7d) * 4))), 0, 100),
    springFitScore: clampInt(estoniaHistoryPoints.length ? 78 : 42, 0, 100),
    windSupportScore: evidenceSummary.wasWeatherUsedInRanking ? clampInt(Math.round(computeWindSupport(weather)), 0, 100) : 0,
    routeVector: latestCluster ? `${joinCountries(latestCluster.countryCodes)} -> Estonia` : 'Unavailable',
    bestEntryZone: topPredictedPoints[0]?.countyOrParish || topPredictedPoints[0]?.name || 'Unavailable',
    alreadyMissedRisk: estoniaEvidence.alreadyPresent ? 'medium' : 'low',
    countryScores,
    topPredictedPoints,
    warnings,
    consistencyChecks: {
      routeLooksPlausible: true,
      timingLooksPlausible: true,
      weatherLooksSupportive: true,
      foreignPressureMatchesNarrative: true,
    },
    rawResearchPayload: {
      request: {
        speciesKey,
        speciesName,
        latinName,
        ebirdSpeciesCode,
      },
      normalizedSources: {
        estoniaHistoryPoints,
        estoniaHistoryClusters,
        foreignRecentPoints,
        foreignClusters,
        weather,
      },
      evidenceSummary,
      sourceHealth,
      foreignEvidence,
      estoniaEvidence,
      historicalEvidence,
      predictionVectors,
      predictedTargets: topPredictedPoints,
      rawLinks,
      evidenceState: evidenceStateSnapshot,
      ...(normalizedN8nResponse ? { aiSummary: normalizedN8nResponse.insightSummary } : {}),
    },
  };
  const canonical = buildCanonicalPredictionRecord({
    base: baseResult,
    alternate: normalizedN8nResponse,
    preferredSummary: normalizedN8nResponse ? {
      insightSummary: normalizedN8nResponse.insightSummary,
      confidenceNote: normalizedN8nResponse.confidenceNote,
      rankingNotes: normalizedN8nResponse.rankingNotes,
      warnings: normalizedN8nResponse.warnings,
    } : null,
  });
  // Resolve payloadSourceState: v3 passthrough wins; otherwise mark as current pipeline output.
  const resolvedPayloadSourceState = (normalizedN8nResponse as Record<string, unknown> | null)?.payloadSourceState === 'n8n_v3_passthrough'
    ? 'n8n_v3_passthrough'
    : 'current_finalized_backend_output';
  let canonicalResponse = attachNormalizationMarkers({
    ...baseResult,
    ...(normalizedN8nResponse ? { ok: normalizedN8nResponse.ok, status: normalizedN8nResponse.status, error: normalizedN8nResponse.error } : {}),
    payloadSourceState: resolvedPayloadSourceState,
    speciesKey: canonical.speciesKey,
    speciesName: canonical.speciesName,
    generatedAt: canonical.generatedAt,
    analysisVersion: canonical.analysisVersion,
    species: canonical.species,
    sourceHealth: canonical.sourceHealth,
    evidenceSummary: canonical.evidenceSummary,
    estoniaHistoryPoints: canonical.estoniaHistoryPoints,
    estoniaHistoryClusters: canonical.estoniaHistoryClusters,
    foreignRecentPoints: canonical.foreignRecentPoints,
    foreignClusters: canonical.foreignClusters,
    weather: canonical.weather,
    predictedTargets: canonical.predictedTargets,
    topPredictedPoints: canonical.predictedTargets,
    topTarget: canonical.topTarget,
    evidenceState: canonical.evidenceState,
    hasUsableRecentEstoniaEvidence: canonical.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: canonical.hasUsableEstoniaHistory,
    hasUsableForeignPressure: canonical.hasUsableForeignPressure,
    hasUsablePredictedTargets: canonical.hasUsablePredictedTargets,
    hasOnlyWeather: canonical.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: canonical.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: canonical.activeEvidenceSources,
    availableSources: canonical.availableSources,
    attemptedButUnavailable: canonical.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: canonical.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: canonical.effectiveRankingMode,
    summaryGuardrailApplied: canonical.summaryGuardrailApplied,
    summaryGuardrailReason: canonical.summaryGuardrailReason,
    countryScores: canonical.countryScores,
    estoniaEvidence: canonical.estoniaEvidence,
    elurikkusRecentRecords: canonical.elurikkusRecentRecords,
    insightSummary: canonical.insightSummary,
    aiSummary: canonical.insightSummary,
    confidenceNote: canonical.confidenceNote,
    rankingNotes: canonical.rankingNotes,
    warnings: canonical.warnings,
    consistencyChecks: canonical.consistencyChecks,
    summaryOrigin: canonical.summaryOrigin,
    summaryRegeneratedFromStructuredEvidence: canonical.summaryRegeneratedFromStructuredEvidence,
    mapLayers: canonical.mapLayers,
    mapLayersDefault: canonical.mapLayersDefault,
    globalMigrationEtas: canonical.globalMigrationEtas,
    rawResearchPayload: (() => {
      // Safe carry-forwards from base: species metadata, URLs, vectors, historical structured data only.
      // No field from baseResult.rawResearchPayload survives unless listed explicitly here.
      const baseRaw = asRecord(baseResult.rawResearchPayload);
      return {
        request: asRecord(baseRaw.request),
        rawLinks: asRecord(baseRaw.rawLinks),
        historicalEvidence: asRecord(baseRaw.historicalEvidence),
        predictionVectors: Array.isArray(baseRaw.predictionVectors) ? baseRaw.predictionVectors as unknown[] : [],
        // All contested fields — canonical wins over deterministic base
        sourceHealth: canonical.sourceHealth,
        evidenceSummary: canonical.evidenceSummary,
        estoniaEvidence: canonical.estoniaEvidence,
        foreignEvidence: canonical.foreignRecentPoints,
        foreignRecentPoints: canonical.foreignRecentPoints,
        foreignClusters: canonical.foreignClusters,
        predictedTargets: canonical.predictedTargets,
        topTarget: canonical.topTarget,
        topPredictedPoints: canonical.predictedTargets,
        elurikkusRecentRecords: canonical.elurikkusRecentRecords,
        evidenceState: canonical.evidenceState,
        countryScores: canonical.countryScores,
        externalPressureScore: canonical.externalPressureScore ?? 0,
        // Narrative fields — always from canonical, never from base
        insightSummary: canonical.insightSummary,
        aiSummary: canonical.insightSummary,
        confidenceNote: canonical.confidenceNote,
        rankingNotes: canonical.rankingNotes,
        warnings: canonical.warnings,
        consistencyChecks: canonical.consistencyChecks,
        summaryOrigin: canonical.summaryOrigin,
        summaryRegeneratedFromStructuredEvidence: canonical.summaryRegeneratedFromStructuredEvidence,
        summaryGuardrailApplied: canonical.summaryGuardrailApplied,
        summaryGuardrailReason: canonical.summaryGuardrailReason,
        normalizedSources: {
          estoniaHistoryPoints: canonical.estoniaHistoryPoints,
          estoniaHistoryClusters: canonical.estoniaHistoryClusters,
          foreignRecentPoints: canonical.foreignRecentPoints,
          foreignClusters: canonical.foreignClusters,
          weather: canonical.weather,
        },
      };
    })(),
  });
  // Scrub rawResearchPayload narrative fields before finalization so finalizePredictionResponse
  // starts from a clean state rather than inheriting any stale narrative from the canonical merge.
  // Skip scrubbing for v3 passthrough payloads — their evidence is authoritative.
  if (resolvedPayloadSourceState !== 'n8n_v3_passthrough') {
    const preScrub = scrubStaleNarrativeFromStructuredEvidence(asRecord(canonicalResponse));
    const preRwp = asRecord(canonicalResponse.rawResearchPayload);
    preRwp.aiSummary = preScrub.safeSummary;
    preRwp.insightSummary = preScrub.safeSummary;
    if (preScrub.warning) {
      preRwp.warnings = Array.from(new Set([
        ...(Array.isArray(preRwp.warnings) ? preRwp.warnings.map((w) => String(w || '')) : []),
        preScrub.warning,
      ]));
    }
  }
  canonicalResponse = finalizePredictionResponse(canonicalResponse, 'main_buildMapFirstPredictionResult');
  console.info(`${LOG_PREFIX} canonical_response`, {
    species: canonicalResponse.speciesName,
    insightSummary: canonicalResponse.insightSummary,
    aiSummary: canonicalResponse.aiSummary,
    recentCount7d: asRecord(canonicalResponse.estoniaEvidence).recentCount7d,
    recentCount30d: asRecord(canonicalResponse.estoniaEvidence).recentCount30d,
    foreignRecentPointsCount: Array.isArray(canonicalResponse.foreignRecentPoints) ? canonicalResponse.foreignRecentPoints.length : 0,
    foreignClustersCount: Array.isArray(canonicalResponse.foreignClusters) ? canonicalResponse.foreignClusters.length : 0,
    predictedTargetsCount: Array.isArray(canonicalResponse.predictedTargets) ? canonicalResponse.predictedTargets.length : 0,
    ebirdAvailable: asRecord(canonicalResponse.sourceHealth).ebirdAvailable,
    consistencyChecks: canonicalResponse.consistencyChecks,
    activeEvidenceUsed: asRecord(canonicalResponse.evidenceSummary).activeEvidenceUsed,
    summaryRegeneratedFromStructuredEvidence: canonicalResponse.summaryRegeneratedFromStructuredEvidence,
  });
  return canonicalResponse;
}

async function fetchGbifEstoniaHistory(speciesName: string, signal: AbortSignal): Promise<Record<string, unknown>[]> {
  const url = `https://api.gbif.org/v1/occurrence/search?country=EE&limit=300&hasCoordinate=true&scientificName=${encodeURIComponent(speciesName)}`;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) return [];
    const data = await resp.json() as Record<string, unknown>;
    const rows = Array.isArray(data.results) ? data.results : [];
    const seen = new Set<string>();
    return rows.map((row) => {
      const item = asRecord(row);
      const lat = toNumber(item.decimalLatitude);
      const lon = toNumber(item.decimalLongitude);
      const eventDate = normalizeDateString(stringOr(item.eventDate, item.dateIdentified, item.modified));
      const key = `${roundCoord(lat, 3)}:${roundCoord(lon, 3)}:${eventDate.slice(0, 10)}`;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || seen.has(key)) return null;
      seen.add(key);
      const daysAgo = daysAgoFromIso(eventDate);
      return {
        lat,
        lon,
        eventDate,
        daysAgo,
        ageClass: daysAgo != null && daysAgo <= 7 ? 'recent' : 'historical',
        source: 'GBIF',
        occurrenceId: stringOr(item.key, item.gbifID),
        locality: stringOr(item.locality),
        municipality: stringOr(item.municipality, item.stateProvince),
        count: Math.max(1, Math.round(toNumber(item.individualCount) || 1)),
      };
    }).filter(Boolean) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

async function fetchElurikkusEstoniaHistory(speciesName: string, signal: AbortSignal): Promise<Record<string, unknown>[]> {
  const url = `https://elurikkus.ee/biocache-service/occurrences/search?q=${encodeURIComponent(speciesName)}&sort=eventDate&dir=desc&pageSize=200&fq=country:Estonia&_ts=${Date.now()}`;
  try {
    const resp = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; EstBirding/1.0)',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    if (!resp.ok) {
      console.warn(`${LOG_PREFIX} fetchElurikkusEstoniaHistory.http_error`, {
        status: resp.status,
        statusText: resp.statusText,
        url,
      });
      return [];
    }
    const data = await resp.json() as Record<string, unknown>;
    // Try multiple occurrence array paths: ALA biocache v1 uses 'occurrences',
    // some versions use 'results' or a top-level array.
    const rawOccurrences: unknown[] = Array.isArray(data.occurrences)
      ? data.occurrences
      : Array.isArray(data.results)
        ? data.results
        : Array.isArray(data)
          ? data as unknown[]
          : [];
    const topLevelKeys = Object.keys(data).slice(0, 12);
    const firstItemKeys = rawOccurrences.length > 0 ? Object.keys(asRecord(rawOccurrences[0])).slice(0, 20) : [];
    console.info(`${LOG_PREFIX} fetchElurikkusEstoniaHistory.parse`, {
      totalRecords: data.totalRecords ?? data.total ?? '?',
      occurrencesArrayLength: rawOccurrences.length,
      topLevelKeys,
      firstItemKeys,
    });
    let filteredByCoords = 0;
    const points = rawOccurrences.map((row) => {
      const item = asRecord(row);
      // Try multiple coordinate field name candidates in order of preference.
      // eElurikkus ALA biocache may use decimalLatitude (DwC standard) or
      // latitude/lat depending on API version and indexing configuration.
      const lat = hasNumber(item.decimalLatitude)
        ? toNumber(item.decimalLatitude)
        : hasNumber(item.latitude)
          ? toNumber(item.latitude)
          : hasNumber(item.lat)
            ? toNumber(item.lat)
            : (() => {
                // Last resort: parse "lat,lon" string from combined fields
                const latLng = stringOr(item.latLng, item.latlong, item.coordinates);
                const parts = latLng.split(',');
                return parts.length >= 1 ? toNumber(parts[0].trim()) : 0;
              })();
      const lon = hasNumber(item.decimalLongitude)
        ? toNumber(item.decimalLongitude)
        : hasNumber(item.longitude)
          ? toNumber(item.longitude)
          : hasNumber(item.lon)
            ? toNumber(item.lon)
            : hasNumber(item.lng)
              ? toNumber(item.lng)
              : (() => {
                  const latLng = stringOr(item.latLng, item.latlong, item.coordinates);
                  const parts = latLng.split(',');
                  return parts.length >= 2 ? toNumber(parts[1].trim()) : 0;
                })();
      const eventDate = normalizeDateString(stringOr(item.eventDate, item.occurrenceDate, item.observed_at, item.datetime));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isEstoniaCoords(lat, lon)) {
        filteredByCoords++;
        return null;
      }
      return {
        lat,
        lon,
        eventDate,
        daysAgo: daysAgoFromIso(eventDate),
        ageClass: (daysAgoFromIso(eventDate) ?? 9999) <= 7 ? 'recent' : 'historical',
        source: 'EELURIKKUS',
        occurrenceId: stringOr(item.uuid, item.id, item.occurrenceID),
        locality: stringOr(item.locality, item.locationRemarks),
        municipality: stringOr(item.municipality, item.stateProvince, item.county),
        count: Math.max(1, Math.round(toNumber(item.individualCount) || 1)),
      };
    }).filter(Boolean) as Record<string, unknown>[];
    console.info(`${LOG_PREFIX} fetchElurikkusEstoniaHistory.result`, {
      rawOccurrencesCount: rawOccurrences.length,
      filteredByCoords,
      pointsExtracted: points.length,
      recentCount7d: points.filter((p) => toNumber(p.daysAgo) <= 7).length,
    });
    return points;
  } catch (err) {
    console.warn(`${LOG_PREFIX} fetchElurikkusEstoniaHistory.error`, {
      error: err instanceof Error ? err.message : String(err),
      url,
    });
    return [];
  }
}

function dedupeEstoniaHistoryPoints(points: Record<string, unknown>[]): Record<string, unknown>[] {
  const bestByKey = new Map<string, Record<string, unknown>>();
  for (const point of points) {
    const lat = toNumber(point.lat);
    const lon = toNumber(point.lon);
    const eventDate = stringOr(point.eventDate).slice(0, 10);
    const locality = sanitizeDisplayLabel(stringOr(point.locality, point.municipality)) || 'unknown-locality';
    const key = `${roundCoord(lat, 2)}:${roundCoord(lon, 2)}:${eventDate}:${normalizeComparableText(locality)}`;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const current = bestByKey.get(key);
    if (!current) {
      bestByKey.set(key, point);
      continue;
    }
    const currentSource = stringOr(current.source).toUpperCase();
    const nextSource = stringOr(point.source).toUpperCase();
    const currentScore = (currentSource === 'EELURIKKUS' ? 3 : 0) + (sanitizeDisplayLabel(stringOr(current.locality)) ? 1 : 0) + (toNumber(current.count) || 0);
    const nextScore = (nextSource === 'EELURIKKUS' ? 3 : 0) + (sanitizeDisplayLabel(stringOr(point.locality)) ? 1 : 0) + (toNumber(point.count) || 0);
    if (nextScore > currentScore) bestByKey.set(key, point);
  }
  return Array.from(bestByKey.values())
    .sort((left, right) => Date.parse(String(right.eventDate || '')) - Date.parse(String(left.eventDate || '')));
}

async function fetchForeignRecentPoints(ebirdSpeciesCode: string, settings: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>[]> {
  const token = (Deno.env.get('EBIRD_API_TOKEN') || '').trim();
  if (!token) return [];
  const enabled = getEnabledForeignRegions(settings);
  const requests = enabled.map(async (entry) => {
    const url = `https://api.ebird.org/v2/data/obs/${encodeURIComponent(entry.regionCode)}/recent/${encodeURIComponent(ebirdSpeciesCode)}?back=30&maxResults=1000`;
    try {
      const resp = await fetch(url, {
        signal,
        headers: { 'X-eBirdApiToken': token, 'Accept': 'application/json' },
      });
      if (!resp.ok) {
        console.warn(`${LOG_PREFIX} fetchForeignRecentPoints.http_error`, {
          regionCode: entry.regionCode,
          status: resp.status,
          statusText: resp.statusText,
        });
        return [];
      }
      const rows = await resp.json() as unknown[];
      const points = (Array.isArray(rows) ? rows : []).map((row) => {
        const item = asRecord(row);
        const obsDt = normalizeDateString(stringOr(item.obsDt, item.obsTime));
        return {
          lat: toNumber(item.lat),
          lon: hasNumber(item.lng) ? toNumber(item.lng) : toNumber(item.lon),
          obsDt,
          locName: stringOr(item.locName),
          howMany: hasNumber(item.howMany) ? Math.round(toNumber(item.howMany)) : null,
          countryCode: entry.countryCode,
          countryName: entry.countryName,
          regionCode: entry.regionCode,
          regionName: entry.regionName,
          source: 'eBird',
          daysAgo: Math.max(0, daysAgoFromIso(obsDt) ?? 30),
          distanceToEstoniaKm: distanceToEstonia(toNumber(item.lat), hasNumber(item.lng) ? toNumber(item.lng) : toNumber(item.lon)),
        };
      }).filter((point) => Number.isFinite(toNumber(point.lat)) && Number.isFinite(toNumber(point.lon)));
      console.info(`${LOG_PREFIX} fetchForeignRecentPoints.region_result`, {
        regionCode: entry.regionCode,
        rawRows: Array.isArray(rows) ? rows.length : 0,
        pointsExtracted: points.length,
      });
      return points;
    } catch (err) {
      console.warn(`${LOG_PREFIX} fetchForeignRecentPoints.error`, {
        regionCode: entry.regionCode,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  });
  return (await Promise.all(requests)).flat().sort((left, right) => Number(left.daysAgo) - Number(right.daysAgo));
}

function clusterForeignRecentPoints(points: Record<string, unknown>[]): Record<string, unknown>[] {
  const clusters = new Map<string, { id: string; lat: number; lon: number; points: Record<string, unknown>[] }>();
  for (const point of points) {
    const lat = toNumber(point.lat);
    const lon = toNumber(point.lon);
    const bucket = `${roundCoord(lat, 1)}:${roundCoord(lon, 1)}`;
    if (!clusters.has(bucket)) {
      clusters.set(bucket, { id: `cluster-${clusters.size + 1}`, lat: roundCoord(lat, 2), lon: roundCoord(lon, 2), points: [] });
    }
    clusters.get(bucket)?.points.push(point);
  }
  const mapped = Array.from(clusters.values()).map((cluster) => {
    const dates = cluster.points.map((point) => stringOr(point.obsDt)).filter(Boolean).sort();
    const countries = Array.from(new Set(cluster.points.map((point) => resolveCountryName(stringOr(point.countryCode))).filter(Boolean)));
    const countryCodes = Array.from(new Set(cluster.points.map((point) => stringOr(point.countryCode).toLowerCase()).filter(Boolean)));
    const locNames = Array.from(new Set(cluster.points.map((point) => stringOr(point.locName)).filter(Boolean))).slice(0, 4);
    const averageDaysAgo = cluster.points.length ? sum(cluster.points.map((point) => toNumber(point.daysAgo))) / cluster.points.length : 30;
    const freshestDaysAgo = Math.min(...cluster.points.map((point) => toNumber(point.daysAgo)));
    const totalHowMany = sum(cluster.points.map((point) => Math.max(1, toNumber(point.howMany) || 1)));
    const nearestDistanceKm = Math.min(...cluster.points.map((point) => toNumber(point.distanceToEstoniaKm)).filter((distance) => distance > 0));
    cluster.points.forEach((point) => { point.clusterId = cluster.id; });
    return {
      id: cluster.id,
      lat: cluster.lat,
      lon: cluster.lon,
      pointCount: cluster.points.length,
      newestObsDt: dates[dates.length - 1] || '',
      oldestObsDt: dates[0] || '',
      freshestDaysAgo: Number.isFinite(freshestDaysAgo) ? freshestDaysAgo : 30,
      averageDaysAgo: Number.isFinite(averageDaysAgo) ? Number(averageDaysAgo.toFixed(1)) : 30,
      totalHowMany,
      countries,
      countryCodes,
      locNames,
      nearestDistanceKm: Number.isFinite(nearestDistanceKm) ? nearestDistanceKm : 0,
      isFreshest: false,
    };
  }).sort((left, right) => Number(left.freshestDaysAgo) - Number(right.freshestDaysAgo) || Number(right.pointCount) - Number(left.pointCount));
  if (mapped[0]) mapped[0].isFreshest = true;
  return mapped;
}

async function fetchWeatherForPrediction(foreignClusters: Record<string, unknown>[], signal: AbortSignal): Promise<Record<string, unknown>> {
  const anchor = foreignClusters[0];
  const lat = anchor ? toNumber(anchor.lat) : 58.7;
  const lon = anchor ? toNumber(anchor.lon) : 25.0;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}&current=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m`;
  try {
    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error('weather fetch failed');
    const data = await resp.json() as Record<string, unknown>;
    const current = asRecord(data.current);
    const windDirectionDeg = toNumber(current.wind_direction_10m);
    const fetchedAt = normalizeDateString(stringOr(current.time));
    const windSpeedKph = toNumber(current.wind_speed_10m);
    const precipitationMm = toNumber(current.precipitation);
    const weatherAvailable = Boolean(fetchedAt && (windSpeedKph > 0 || windDirectionDeg > 0));
    const weatherPartial = !fetchedAt || (!windSpeedKph && !windDirectionDeg);
    return {
      fetchedAt,
      windSpeedKph,
      windDirectionDeg,
      windDirectionLabel: bearingToCompass(windDirectionDeg),
      precipitationMm,
      temperatureC: toNumber(current.temperature_2m),
      weatherAvailable,
      weatherPartial,
      wasWeatherUsedInRanking: false,
      source: 'Open-Meteo',
    };
  } catch (error) {
    return {
      fetchedAt: '',
      windSpeedKph: 0,
      windDirectionDeg: 0,
      windDirectionLabel: '',
      precipitationMm: 0,
      weatherAvailable: false,
      weatherPartial: true,
      wasWeatherUsedInRanking: false,
      error: String(error || 'weather fetch failed'),
      source: 'Open-Meteo',
    };
  }
}

function buildEstoniaEvidenceFromHistory(points: Record<string, unknown>[]): Record<string, unknown> {
  const sorted = [...points].sort((left, right) => Date.parse(String(right.eventDate || '')) - Date.parse(String(left.eventDate || '')));
  const latest = sorted[0];
  const recentCount7d = points.filter((point) => toNumber(point.daysAgo) <= 7).length;
  const recentCount30d = points.filter((point) => toNumber(point.daysAgo) <= 30).length;
  const freshestLocalities = Array.from(new Set(
    sorted
      .map((point) => sanitizeDisplayLabel(stringOr(point.locality, point.municipality)))
      .filter(Boolean),
  )).slice(0, 5);
  const sourceMix = Array.from(new Set(points.map((point) => stringOr(point.source).toUpperCase()).filter(Boolean)));
  return {
    recentCount7d,
    recentCount30d,
    latestEstoniaDate: latest ? stringOr(latest.eventDate) : '',
    latestEstoniaLat: latest ? toNumber(latest.lat) : null,
    latestEstoniaLon: latest ? toNumber(latest.lon) : null,
    latestEstoniaLocality: latest ? sanitizeDisplayLabel(stringOr(latest.locality, latest.municipality)) : '',
    latestEstoniaSource: latest ? stringOr(latest.source).toUpperCase() : '',
    freshestLocalities,
    sourceMix,
    alreadyPresent: recentCount7d > 0,
    alreadyPassed: false,
  };
}

function buildHistoricalEvidenceFromHistory(clusters: Array<{
  id: string;
  lat: number;
  lon: number;
  count: number;
  recentCount: number;
  locality: string;
  municipality: string;
  displayName?: string;
  representativeLat?: number;
  representativeLon?: number;
  habitatCue?: string;
  newestEventDate: string;
}>): Record<string, unknown> {
  const hotspots = clusters
    .slice(0, 6)
    .map((cluster, index) => ({
      rank: index + 1,
      name: stringOr(cluster.displayName, cluster.locality, 'Estonia hotspot'),
      countyOrParish: cluster.municipality,
      lat: Number.isFinite(Number(cluster.representativeLat)) ? toNumber(cluster.representativeLat) : toNumber(cluster.lat),
      lon: Number.isFinite(Number(cluster.representativeLon)) ? toNumber(cluster.representativeLon) : toNumber(cluster.lon),
      confidence: clampInt(40 + cluster.count * 6, 0, 100),
      eta: 'Historical hotspot',
      searchRadiusKm: 12,
      habitatCue: stringOr(cluster.habitatCue, 'Historical occurrence density'),
      reason: `${cluster.count} historical records in Estonia`,
      derivedFromClusterId: cluster.id,
      supportingEstoniaHistoryCount: cluster.count,
      latestSupportingEstoniaDate: cluster.newestEventDate,
      windAdjusted: false,
    }));
  return {
    springWindow: clusters.some((cluster) => stringOr(cluster.newestEventDate)) ? 'Derived from Estonia occurrence clusters' : 'Historical Estonia context only',
    topHistoricalHotspots: hotspots,
    habitatHints: ['coastal movement', 'known Estonia occurrence density'],
  };
}

function buildForeignEvidenceFromPointsAndClusters(points: Record<string, unknown>[], clusters: Record<string, unknown>[]): Record<string, unknown>[] {
  const grouped = new Map<string, Record<string, unknown>>();
  for (const point of points) {
    const code = stringOr(point.countryCode).toLowerCase();
    if (!code) continue;
    if (!grouped.has(code)) {
      grouped.set(code, {
        countryCode: code,
        countryName: resolveCountryName(code),
        recordCount7d: 0,
        recordCount30d: 0,
        nearestDistanceKm: 0,
        latestDate: '',
        clusterCount: 0,
        topClusters: [],
      });
    }
    const group = grouped.get(code)!;
    if (toNumber(point.daysAgo) <= 7) group.recordCount7d = toNumber(group.recordCount7d) + 1;
    if (toNumber(point.daysAgo) <= 30) group.recordCount30d = toNumber(group.recordCount30d) + 1;
    const distance = toNumber(point.distanceToEstoniaKm);
    group.nearestDistanceKm = !toNumber(group.nearestDistanceKm) || (distance > 0 && distance < toNumber(group.nearestDistanceKm)) ? distance : toNumber(group.nearestDistanceKm);
    const obsDt = stringOr(point.obsDt);
    if (!stringOr(group.latestDate) || Date.parse(obsDt) > Date.parse(stringOr(group.latestDate))) {
      group.latestDate = obsDt;
    }
  }
  for (const cluster of clusters) {
    for (const code of (Array.isArray(cluster.countryCodes) ? cluster.countryCodes : [])) {
      const normalized = stringOr(code).toLowerCase();
      const group = grouped.get(normalized);
      if (!group) continue;
      group.clusterCount = toNumber(group.clusterCount) + 1;
      const topClusters = Array.isArray(group.topClusters) ? group.topClusters as Record<string, unknown>[] : [];
      topClusters.push({
        lat: toNumber(cluster.lat),
        lon: toNumber(cluster.lon),
        lastDate: stringOr(cluster.newestObsDt),
        count7d: toNumber(cluster.pointCount),
        source: 'eBird',
        label: (Array.isArray(cluster.locNames) ? cluster.locNames : []).join(', ') || `${resolveCountryName(normalized)} cluster`,
      });
      group.topClusters = topClusters.sort((left, right) => toNumber(right.count7d) - toNumber(left.count7d)).slice(0, 3);
    }
  }
  return Array.from(grouped.values()).sort((left, right) => toNumber(right.recordCount7d) - toNumber(left.recordCount7d));
}

function buildPredictedTargets(opts: {
  speciesName: string;
  estoniaHistoryClusters: Array<{
    id: string;
    lat: number;
    lon: number;
    count: number;
    recentCount: number;
    locality: string;
    municipality: string;
    displayName?: string;
    displayNameSource?: string;
    representativeLat?: number;
    representativeLon?: number;
    representativePointMethod?: string;
    representativeLocality?: string;
    latestSupportingLocality?: string;
    nearestNamedCoastalLocality?: string;
    supportingPoints?: Record<string, unknown>[];
    localityNames?: string[];
    localityAliases?: string[];
    habitatCue?: string;
    habitatType?: string;
    habitatScore?: number;
    coastalDistanceKm?: number;
    clusterTightnessKm?: number;
    newestEventDate: string;
    oldestEventDate: string;
    source: 'GBIF' | 'EELURIKKUS' | 'mixed';
    sourceBreakdown: Record<string, number>;
  }>;
  foreignClusters: Record<string, unknown>[];
  foreignRecentPoints: Record<string, unknown>[];
  weather: Record<string, unknown>;
  estoniaEvidence: Record<string, unknown>;
  horizonDays: number;
}): Record<string, unknown>[] {
  const { speciesName, estoniaHistoryClusters, foreignClusters, foreignRecentPoints, weather, estoniaEvidence, horizonDays } = opts;
  const ecology = classifySpeciesEcology(speciesName);
  const hasRecentForeignSupport = foreignRecentPoints.some((point) => toNumber(point.daysAgo) <= 14);
  const hasForeignPressure = foreignClusters.length > 0 && hasRecentForeignSupport;
  const hasWeatherSupport = weatherLooksAvailable(weather);
  const hasRecentEstoniaSupport = toNumber(estoniaEvidence.recentCount30d) > 0 || estoniaHistoryClusters.some((cluster) => cluster.recentCount > 0);
  const hasRecentCoastalEstoniaSupport = ecology.prefersCoast
    && estoniaHistoryClusters.some((cluster) => cluster.recentCount > 0 && isCoastalCluster(cluster));
  const rankingMode = determineRankingMode(hasForeignPressure, hasWeatherSupport);
  weather.wasWeatherUsedInRanking = rankingMode === 'estonia_history_plus_weather' || rankingMode === 'estonia_history_plus_foreign_plus_weather';
  const supportingCountries = hasForeignPressure
    ? Array.from(new Set(foreignClusters.flatMap((cluster) => Array.isArray(cluster.countries) ? cluster.countries.map(String) : []))).slice(0, 4)
    : [];
  const latestRelevantForeignDate = hasForeignPressure
    ? foreignClusters.map((cluster) => stringOr(cluster.newestObsDt)).filter(Boolean).sort().slice(-1)[0] || ''
    : '';
  const nearestRelevantClusterKm = hasForeignPressure
    ? Math.min(...foreignClusters.map((cluster) => toNumber(cluster.nearestDistanceKm)).filter((value) => value > 0))
    : null;
  const sourceOriginAnchor = hasForeignPressure
    ? selectStrongestForeignSourceAnchor(foreignClusters, foreignRecentPoints)
    : null;
  const foreignAnchoredRanking = hasForeignPressure
    && !hasRecentEstoniaSupport
    && sourceOriginAnchor
    && estoniaHistoryClusters.length > 0;
  const corridorAnchor = foreignAnchoredRanking && sourceOriginAnchor
    ? selectNearestPlausibleCorridorAnchor(sourceOriginAnchor, foreignClusters, foreignRecentPoints)
    : null;
  const estoniaEntryCorridor = foreignAnchoredRanking
    ? deriveEstoniaEntryCorridor(corridorAnchor ?? sourceOriginAnchor, estoniaHistoryClusters)
    : null;
  if (foreignAnchoredRanking && sourceOriginAnchor && estoniaEntryCorridor) {
    const anchored = estoniaHistoryClusters.map((cluster) => {
      const representativeLat = Number.isFinite(Number(cluster.representativeLat)) ? toNumber(cluster.representativeLat) : toNumber(cluster.lat);
      const representativeLon = Number.isFinite(Number(cluster.representativeLon)) ? toNumber(cluster.representativeLon) : toNumber(cluster.lon);
      const ecologyScore = scoreClusterEcology(cluster, ecology);
      const historyScore = historyScoreForDebug(cluster);
      const corridorBasis = corridorAnchor ?? sourceOriginAnchor;
      const routeAlignment = computeAlignmentScore(corridorBasis, { lat: representativeLat, lon: representativeLon }, weather);
      const entryDistanceKm = haversineKm(representativeLat, representativeLon, estoniaEntryCorridor.entryLat, estoniaEntryCorridor.entryLon);
      const corridorBearing = bearingBetween(corridorBasis.lat, corridorBasis.lon, representativeLat, representativeLon);
      const bearingDelta = Math.abs((((corridorBearing - estoniaEntryCorridor.bearingDeg) + 540) % 360) - 180);
      const corridorAlignmentBonus = clampInt(Math.round((180 - bearingDelta) / 3.2), 0, 36);
      const corridorDistancePenalty = clampInt(Math.round(entryDistanceKm / 8), 0, 28);
      const inlandPenalty = !isCoastalCluster(cluster) ? 22 : 0;
      const deepInlandPenalty = !isCoastalCluster(cluster) && toNumber(cluster.coastalDistanceKm) > 30 ? 18 : 0;
      const historyWeight = Math.min(historyScore, 18);
      const confidenceBeforeCap = 28
        + corridorAlignmentBonus
        + Math.min(routeAlignment, 20)
        + Math.max(0, ecologyScore.score)
        + historyWeight
        - corridorDistancePenalty
        - inlandPenalty
        - deepInlandPenalty
        - (toNumber(cluster.clusterTightnessKm) > 10 ? 8 : 0)
        - (ecologyScore.score < 0 ? Math.abs(ecologyScore.score) : 0);
      const confidence = Number(Math.max(0.2, Math.min(0.89, confidenceBeforeCap / 100)).toFixed(2));
      return {
        cluster,
        ecologyScore,
        historyScore,
        routeAlignment,
        confidence,
        confidenceBeforeCap,
        entryDistanceKm,
        corridorAlignmentBonus,
      };
    })
      .sort((left, right) =>
        sortPredictedConfidence(right.confidence) - sortPredictedConfidence(left.confidence)
        || left.entryDistanceKm - right.entryDistanceKm
        || right.routeAlignment - left.routeAlignment
        || right.historyScore - left.historyScore
      )
      .slice(0, 5);
    return anchored.map((entry, index) => {
      const cluster = entry.cluster;
      const representativeLat = Number.isFinite(Number(cluster.representativeLat)) ? toNumber(cluster.representativeLat) : toNumber(cluster.lat);
      const representativeLon = Number.isFinite(Number(cluster.representativeLon)) ? toNumber(cluster.representativeLon) : toNumber(cluster.lon);
      const corridorBasis = corridorAnchor ?? sourceOriginAnchor;
      const etaHours = Math.max(8, Math.round((entry.entryDistanceKm + haversineKm(corridorBasis.lat, corridorBasis.lon, estoniaEntryCorridor.entryLat, estoniaEntryCorridor.entryLon)) / Math.max(24, toNumber(weather.windSpeedKph) + 16)));
      const anchorCountries = Array.isArray(sourceOriginAnchor.countries) ? sourceOriginAnchor.countries.map(String).filter(Boolean) : [];
      const anchorCountryCodes = Array.isArray(sourceOriginAnchor.countryCodes) ? sourceOriginAnchor.countryCodes.map(String).filter(Boolean) : [];
      const anchorLocality = Array.isArray(sourceOriginAnchor.locNames) ? sourceOriginAnchor.locNames.map(String).filter(Boolean)[0] : stringOr(sourceOriginAnchor.locName, sourceOriginAnchor.id);
      const corridorLocality = corridorAnchor
        ? (Array.isArray(corridorAnchor.locNames) ? corridorAnchor.locNames.map(String).filter(Boolean)[0] : stringOr(corridorAnchor.locName, corridorAnchor.id))
        : '';
      const corridorReason = [
        `Anchored to fresh foreign pressure from ${anchorLocality || 'foreign eBird cluster'}${anchorCountries.length ? ` (${anchorCountries.join(', ')})` : ''}`,
        ...(corridorAnchor && !arePointsNear(sourceOriginAnchor.lat, sourceOriginAnchor.lon, corridorAnchor.lat, corridorAnchor.lon, 0.05)
          ? [`via downstream staging at ${corridorLocality || estoniaEntryCorridor.entryLabel}`]
          : []),
        `via the ${estoniaEntryCorridor.entryLabel} Estonia entry corridor`,
        `before ranking Estonia targets by corridor fit and supporting history.`,
      ].join(' ');
      const migrationEta = buildCanonicalMigrationEta({
        sourceOriginAnchor,
        corridorAnchor,
        estoniaEntryCorridor,
        target: {
          name: stringOr(cluster.displayName, 'Unnamed history cluster'),
          lat: representativeLat,
          lon: representativeLon,
          rank: index + 1,
        },
        weather,
      });
      return {
        rank: index + 1,
        name: stringOr(cluster.displayName, 'Unnamed history cluster'),
        displayName: stringOr(cluster.displayName, 'Unnamed history cluster'),
        countyOrParish: stringOr(cluster.municipality, estoniaEntryCorridor.entryLabel),
        displayCountyOrParish: stringOr(cluster.municipality, estoniaEntryCorridor.entryLabel),
        lat: representativeLat,
        lon: representativeLon,
        confidence: entry.confidence,
        eta: `${Math.min(horizonDays, Math.max(1, Math.ceil(etaHours / 24)))}d / ~${etaHours}h`,
        searchRadiusKm: clampInt(8 + cluster.count, 6, 30),
        radius: clampInt(8 + cluster.count, 6, 30),
        habitatCue: stringOr(cluster.habitatCue, entry.ecologyScore.habitatCue, 'Habitat uncertain'),
        reason: `${corridorReason} Entry corridor distance is about ${Math.round(entry.entryDistanceKm)} km from this hotspot and foreign-cluster distance to Estonia entry is about ${Math.round(estoniaEntryCorridor.distanceFromForeignKm)} km.`,
        supportingCountries: anchorCountries.length ? anchorCountries : supportingCountries.length ? supportingCountries : undefined,
        ...(nearestRelevantClusterKm != null ? { nearestRelevantClusterKm: Number(nearestRelevantClusterKm.toFixed(1)) } : {}),
        ...(latestRelevantForeignDate ? { latestRelevantForeignDate } : {}),
        derivedFromClusterId: cluster.id,
        rawClusterId: cluster.id,
        supportingEstoniaHistoryCount: cluster.count,
        latestSupportingEstoniaDate: cluster.newestEventDate,
        historicalMatch: `${cluster.count} Estonia history points nearby`,
        estoniaPresenceSignal: 'foreign_pressure_only',
        windAdjusted: hasWeatherSupport,
        rankingMode: 'foreign_anchor_entry_corridor',
        sourceType: 'estonia_history_cluster',
        representativePointMethod: stringOr(cluster.representativePointMethod, 'nearest_real_point'),
        coordinateSource: stringOr(cluster.representativePointMethod, 'nearest_real_point'),
        displayNameSource: stringOr(cluster.displayNameSource, 'fallback_label'),
        supportingPointCount: Array.isArray(cluster.supportingPoints) ? cluster.supportingPoints.length : cluster.count,
        usedForeignPressure: true,
        habitatFilterAdjustedRanking: entry.ecologyScore.adjustedRanking,
        vectorsSuppressed: false,
        habitatType: stringOr(cluster.habitatType, ecology.mode),
        habitatFitScore: entry.ecologyScore.score,
        historySupportScore: entry.historyScore,
        foreignSupportScore: entry.routeAlignment + entry.corridorAlignmentBonus,
        weatherSupportScore: hasWeatherSupport ? clampInt(Math.round(computeWindSupport(weather) / 10), 0, 8) : 0,
        confidenceBeforeCap: Number((Math.max(0, entry.confidenceBeforeCap) / 100).toFixed(2)),
        confidenceAfterCap: entry.confidence,
        entryCorridorLabel: estoniaEntryCorridor.entryLabel,
        entryCorridorLat: estoniaEntryCorridor.entryLat,
        entryCorridorLon: estoniaEntryCorridor.entryLon,
        foreignAnchorLocality: anchorLocality,
        foreignAnchorCountries: anchorCountries,
        foreignAnchorCountryCodes: anchorCountryCodes,
        ...(corridorLocality ? { corridorAnchorLocality: corridorLocality } : {}),
        ...(corridorAnchor ? { corridorAnchorCountryCodes: Array.isArray(corridorAnchor.countryCodes) ? corridorAnchor.countryCodes.map(String).filter(Boolean) : [] } : {}),
        migrationEta,
      };
    });
  }
  const scored = estoniaHistoryClusters.map((cluster) => {
    const routeAlignment = hasForeignPressure ? computeAlignmentScore(foreignClusters[0], cluster, weather) : 0;
    const ecologyScore = scoreClusterEcology(cluster, ecology);
    const historyScore = historyScoreForDebug(cluster);
    const clusterIsCoastal = isCoastalCluster(cluster);
    const foreignBoost = hasForeignPressure ? clampInt(routeAlignment, 0, 20) : 0;
    const weatherBoost = hasWeatherSupport ? clampInt(Math.round(computeWindSupport(weather) / 10), 0, 8) : 0;
    const recentCoastalBonus = hasRecentCoastalEstoniaSupport && clusterIsCoastal ? 18 : 0;
    const inlandRecentPenalty = hasRecentCoastalEstoniaSupport && !clusterIsCoastal ? 30 : 0;
    const noRecentEstoniaPenalty = cluster.recentCount > 0 ? 0 : (hasRecentEstoniaSupport ? 8 : 14);
    const looseClusterPenalty = toNumber(cluster.clusterTightnessKm) > 12 ? 8 : (toNumber(cluster.clusterTightnessKm) > 6 ? 4 : 0);
    const weakHabitatPenalty = ecologyScore.score < 0 ? Math.abs(ecologyScore.score) : (ecologyScore.adjustedRanking ? 6 : 0);
    const weatherPenalty = weather.weatherPartial === true || !stringOr(weather.fetchedAt) ? 6 : 0;
    const foreignPenalty = hasForeignPressure ? 0 : 10;
    const confidenceBeforeCap = historyScore + ecologyScore.score + foreignBoost + weatherBoost + recentCoastalBonus
      - inlandRecentPenalty - noRecentEstoniaPenalty - looseClusterPenalty - weakHabitatPenalty - weatherPenalty - foreignPenalty;
    const confidenceCap = hasForeignPressure ? getConfidenceCapForRankingMode(rankingMode) : 0.70;
    const normalizedConfidence = Math.max(0.18, Math.min(confidenceCap, confidenceBeforeCap / 100));
    const confidence = Number(normalizedConfidence.toFixed(2));
    const clusterDistanceKm = toNumber((cluster as Record<string, unknown>).nearestDistanceKm);
    const etaHours = hasForeignPressure
      ? Math.max(6, Math.round((clusterDistanceKm || 120) / Math.max(20, toNumber(weather.windSpeedKph) + 18)))
      : Math.max(12, Math.round(Math.max(20, clusterDistanceKm || 90) / 12));
    return {
      cluster,
      ecologyScore,
      confidence,
      confidenceBeforeCap,
      confidenceAfterCap: confidence,
      routeAlignment,
      etaHours,
      habitatFilterAdjustedRanking: ecologyScore.adjustedRanking,
      excluded: ecologyScore.excluded || Boolean(hasRecentCoastalEstoniaSupport && !clusterIsCoastal && ecology.prefersCoast && cluster.recentCount <= 0),
    };
  }).filter((entry) => !entry.excluded)
    .sort((left, right) =>
      sortPredictedConfidence(right.confidence) - sortPredictedConfidence(left.confidence)
      || right.ecologyScore.score - left.ecologyScore.score
      || right.cluster.count - left.cluster.count
      || Date.parse(right.cluster.newestEventDate || '') - Date.parse(left.cluster.newestEventDate || '')
    )
    .slice(0, 5);

  return scored.map((entry, index) => {
    const cluster = entry.cluster;
    const nearestForeignForTarget = hasForeignPressure
      ? foreignClusters
        .map((foreignCluster) => ({
          cluster: foreignCluster,
          distanceKm: haversineKm(
            toNumber(foreignCluster.lat),
            toNumber(foreignCluster.lon),
            Number.isFinite(Number(cluster.representativeLat)) ? toNumber(cluster.representativeLat) : toNumber(cluster.lat),
            Number.isFinite(Number(cluster.representativeLon)) ? toNumber(cluster.representativeLon) : toNumber(cluster.lon),
          ),
        }))
        .sort((left, right) => left.distanceKm - right.distanceKm)[0]
      : null;
    const reason = buildTargetReason({
      speciesName,
      hotspot: cluster,
      foreignCluster: nearestForeignForTarget?.cluster,
      weather,
      ecology,
      ecologyScore: entry.ecologyScore,
      hasForeignPressure,
      hasWeatherSupport,
    });
    return {
      rank: index + 1,
      name: stringOr(cluster.displayName, 'Unnamed history cluster'),
      displayName: stringOr(cluster.displayName, 'Unnamed history cluster'),
      countyOrParish: stringOr(cluster.municipality, 'Unavailable'),
      displayCountyOrParish: stringOr(cluster.municipality, 'Unavailable'),
      lat: Number.isFinite(Number(cluster.representativeLat)) ? toNumber(cluster.representativeLat) : toNumber(cluster.lat),
      lon: Number.isFinite(Number(cluster.representativeLon)) ? toNumber(cluster.representativeLon) : toNumber(cluster.lon),
      confidence: entry.confidence,
      eta: `${Math.min(horizonDays, Math.max(1, Math.ceil(entry.etaHours / 24)))}d / ~${entry.etaHours}h`,
      searchRadiusKm: clampInt(8 + cluster.count, 6, 30),
      radius: clampInt(8 + cluster.count, 6, 30),
      habitatCue: stringOr(cluster.habitatCue, entry.ecologyScore.habitatCue, 'Habitat uncertain'),
      reason,
      supportingCountries: supportingCountries.length ? supportingCountries : undefined,
      ...(nearestRelevantClusterKm != null && hasForeignPressure ? { nearestRelevantClusterKm: Number(nearestRelevantClusterKm.toFixed(1)) } : {}),
      ...(latestRelevantForeignDate && hasForeignPressure ? { latestRelevantForeignDate } : {}),
      derivedFromClusterId: cluster.id,
      rawClusterId: cluster.id,
      supportingEstoniaHistoryCount: cluster.count,
      latestSupportingEstoniaDate: cluster.newestEventDate,
      historicalMatch: `${cluster.count} Estonia history points nearby`,
      estoniaPresenceSignal: estoniaEvidence.alreadyPresent === true ? 'recent_estonia_records' : 'history_only',
      windAdjusted: hasWeatherSupport,
      rankingMode: rankingMode,
      sourceType: 'estonia_history_cluster',
      representativePointMethod: stringOr(cluster.representativePointMethod, 'nearest_real_point'),
      coordinateSource: stringOr(cluster.representativePointMethod, 'nearest_real_point'),
      displayNameSource: stringOr(cluster.displayNameSource, 'fallback_label'),
      supportingPointCount: Array.isArray(cluster.supportingPoints) ? cluster.supportingPoints.length : cluster.count,
      usedForeignPressure: hasForeignPressure,
      habitatFilterAdjustedRanking: entry.habitatFilterAdjustedRanking,
      vectorsSuppressed: !hasForeignPressure,
      habitatType: stringOr(cluster.habitatType, ecology.mode),
      habitatFitScore: entry.ecologyScore.score,
      historySupportScore: historyScoreForDebug(cluster),
      foreignSupportScore: hasForeignPressure ? entry.routeAlignment : 0,
      weatherSupportScore: hasWeatherSupport ? clampInt(Math.round(computeWindSupport(weather) / 10), 0, 8) : 0,
      confidenceBeforeCap: Number((Math.max(0, entry.confidenceBeforeCap) / 100).toFixed(2)),
      confidenceAfterCap: entry.confidenceAfterCap,
      debug: {
        rawClusterId: cluster.id,
        displayNameSource: stringOr(cluster.displayNameSource, 'fallback_label'),
        coordinateSource: stringOr(cluster.representativePointMethod, 'nearest_real_point'),
        renderedPredictedTargetSourceType: 'estonia_history_cluster',
        representativePointSelectionMethod: stringOr(cluster.representativePointMethod, 'nearest_real_point'),
        supportingPointCount: Array.isArray(cluster.supportingPoints) ? cluster.supportingPoints.length : cluster.count,
        habitatFilterChangedRanking: entry.habitatFilterAdjustedRanking,
        foreignPressureUsed: hasForeignPressure,
        rankingModeUsed: rankingMode,
        habitatFitScore: entry.ecologyScore.score,
        historySupportScore: historyScoreForDebug(cluster),
        foreignSupportScore: hasForeignPressure ? entry.routeAlignment : 0,
        weatherSupportScore: hasWeatherSupport ? clampInt(Math.round(computeWindSupport(weather) / 10), 0, 8) : 0,
        confidenceBeforeCap: Number((Math.max(0, entry.confidenceBeforeCap) / 100).toFixed(2)),
        confidenceAfterCap: entry.confidenceAfterCap,
        finalConfidenceComponents: {
          confidenceCap: entry.confidenceAfterCap,
          habitat: entry.ecologyScore.score,
          history: historyScoreForDebug(cluster),
          foreign: hasForeignPressure ? entry.routeAlignment : 0,
          weather: hasWeatherSupport ? clampInt(Math.round(computeWindSupport(weather) / 10), 0, 8) : 0,
        },
        vectorsSuppressedDueToMissingForeignData: !hasForeignPressure,
      },
    };
  });
}

function selectStrongestForeignSourceAnchor(
  foreignClusters: Record<string, unknown>[],
  foreignRecentPoints: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!foreignClusters.length) return null;
  const pointCountsByClusterId = new Map<string, number>();
  foreignRecentPoints.forEach((point) => {
    const clusterId = stringOr(point.clusterId);
    if (!clusterId) return;
    pointCountsByClusterId.set(clusterId, (pointCountsByClusterId.get(clusterId) || 0) + 1);
  });
  return [...foreignClusters]
    .map((cluster, index) => {
      const clusterId = stringOr(cluster.id);
      const freshestDaysAgo = hasFiniteNumber(cluster.freshestDaysAgo)
        ? toNumber(cluster.freshestDaysAgo)
        : daysAgoFromIso(stringOr(cluster.newestObsDt)) ?? 999;
      const nearestDistanceKm = hasFiniteNumber(cluster.nearestDistanceKm) && toNumber(cluster.nearestDistanceKm) > 0
        ? toNumber(cluster.nearestDistanceKm)
        : distanceToEstonia(toNumber(cluster.lat), toNumber(cluster.lon));
      const pointCount = hasFiniteNumber(cluster.pointCount) && toNumber(cluster.pointCount) > 0
        ? toNumber(cluster.pointCount)
        : Math.max(1, pointCountsByClusterId.get(clusterId) || 0);
      const totalHowMany = hasFiniteNumber(cluster.totalHowMany) ? toNumber(cluster.totalHowMany) : pointCount;
      const recentScore = hasFiniteNumber((cluster as Record<string, unknown>).recentScore) ? toNumber((cluster as Record<string, unknown>).recentScore) : 0;
      const freshnessScore = Math.max(0, 26 - freshestDaysAgo * 4);
      const volumeScore = Math.min(24, pointCount * 2 + Math.min(16, totalHowMany));
      const northwardScore = Math.max(0, Math.min(10, (toNumber(cluster.lat) - 49) * 1.2));
      const proximityTieBreaker = Math.max(0, 6 - nearestDistanceKm / 80);
      const freshnessBoost = cluster.isFreshest === true ? 8 : 0;
      const anchorScore = freshnessScore + volumeScore + recentScore + northwardScore + proximityTieBreaker + freshnessBoost;
      return {
        ...cluster,
        pointCount,
        totalHowMany,
        freshestDaysAgo,
        nearestDistanceKm,
        anchorScore,
        _inputIndex: index,
      };
    })
    .sort((left, right) =>
      toNumber(right.anchorScore) - toNumber(left.anchorScore)
      || toNumber(left.freshestDaysAgo) - toNumber(right.freshestDaysAgo)
      || toNumber(right.totalHowMany) - toNumber(left.totalHowMany)
      || toNumber(right.pointCount) - toNumber(left.pointCount)
      || toNumber(left.nearestDistanceKm) - toNumber(right.nearestDistanceKm)
      || toNumber(left._inputIndex) - toNumber(right._inputIndex)
    )[0] ?? null;
}

function selectNearestPlausibleCorridorAnchor(
  sourceOriginAnchor: Record<string, unknown>,
  foreignClusters: Record<string, unknown>[],
  foreignRecentPoints: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!sourceOriginAnchor || !foreignClusters.length) return null;
  const sourceLat = toNumber(sourceOriginAnchor.lat);
  const sourceLon = toNumber(sourceOriginAnchor.lon);
  const sourceDistanceToEstonia = hasFiniteNumber(sourceOriginAnchor.nearestDistanceKm) && toNumber(sourceOriginAnchor.nearestDistanceKm) > 0
    ? toNumber(sourceOriginAnchor.nearestDistanceKm)
    : distanceToEstonia(sourceLat, sourceLon);
  const candidates = foreignClusters
    .filter((cluster) => stringOr(cluster.id) !== stringOr(sourceOriginAnchor.id))
    .map((cluster, index) => {
      const clusterLat = toNumber(cluster.lat);
      const clusterLon = toNumber(cluster.lon);
      const clusterDistanceToEstonia = hasFiniteNumber(cluster.nearestDistanceKm) && toNumber(cluster.nearestDistanceKm) > 0
        ? toNumber(cluster.nearestDistanceKm)
        : distanceToEstonia(clusterLat, clusterLon);
      const freshness = hasFiniteNumber(cluster.freshestDaysAgo)
        ? toNumber(cluster.freshestDaysAgo)
        : daysAgoFromIso(stringOr(cluster.newestObsDt)) ?? 999;
      const betweenProgress = sourceDistanceToEstonia - clusterDistanceToEstonia;
      const distanceFromSourceKm = haversineKm(sourceLat, sourceLon, clusterLat, clusterLon);
      const plausibleDownstream = betweenProgress > 15 && clusterDistanceToEstonia < sourceDistanceToEstonia;
      const freshnessScore = Math.max(0, 12 - freshness * 2);
      const downstreamScore = Math.max(0, Math.min(18, betweenProgress / 12));
      const compactness = Math.max(0, 10 - distanceFromSourceKm / 25);
      const volumeScore = Math.min(8, (hasFiniteNumber(cluster.pointCount) ? toNumber(cluster.pointCount) : 0) + Math.min(4, hasFiniteNumber(cluster.totalHowMany) ? toNumber(cluster.totalHowMany) : 0));
      return {
        ...cluster,
        clusterDistanceToEstonia,
        freshness,
        distanceFromSourceKm,
        plausibleDownstream,
        corridorScore: (plausibleDownstream ? 15 : 0) + freshnessScore + downstreamScore + compactness + volumeScore,
        _inputIndex: index,
      };
    })
    .filter((cluster) => cluster.plausibleDownstream && cluster.freshness <= 10)
    .sort((left, right) =>
      toNumber(right.corridorScore) - toNumber(left.corridorScore)
      || toNumber(left.clusterDistanceToEstonia) - toNumber(right.clusterDistanceToEstonia)
      || toNumber(left.freshness) - toNumber(right.freshness)
      || toNumber(left._inputIndex) - toNumber(right._inputIndex)
    );
  return candidates[0] ?? null;
}

function buildCanonicalMigrationEta(input: {
  sourceOriginAnchor: Record<string, unknown>;
  corridorAnchor: Record<string, unknown> | null;
  estoniaEntryCorridor: { entryLabel: string; entryLat: number; entryLon: number; bearingDeg: number; distanceFromForeignKm: number };
  target: { name: string; lat: number; lon: number; rank: number };
  weather: Record<string, unknown>;
}): Record<string, unknown> {
  const sourceLocality = Array.isArray(input.sourceOriginAnchor.locNames)
    ? input.sourceOriginAnchor.locNames.map(String).filter(Boolean)[0]
    : stringOr(input.sourceOriginAnchor.locName, input.sourceOriginAnchor.id, 'Foreign source');
  const sourceCountry = Array.isArray(input.sourceOriginAnchor.countries)
    ? input.sourceOriginAnchor.countries.map(String).filter(Boolean)[0]
    : resolveCountryName(Array.isArray(input.sourceOriginAnchor.countryCodes) ? String(input.sourceOriginAnchor.countryCodes[0] || '') : '');
  const sourceCountryCode = Array.isArray(input.sourceOriginAnchor.countryCodes)
    ? String(input.sourceOriginAnchor.countryCodes[0] || '').toUpperCase()
    : '';
  const corridorLocality = input.corridorAnchor
    ? (Array.isArray(input.corridorAnchor.locNames) ? input.corridorAnchor.locNames.map(String).filter(Boolean)[0] : stringOr(input.corridorAnchor.locName, input.corridorAnchor.id))
    : '';
  const routePoints = dedupeMigrationRoutePoints([
    {
      lat: toNumber(input.sourceOriginAnchor.lat),
      lon: toNumber(input.sourceOriginAnchor.lon),
      name: sourceLocality || 'Foreign origin',
      type: 'origin',
    },
    ...(input.corridorAnchor ? [{
      lat: toNumber(input.corridorAnchor.lat),
      lon: toNumber(input.corridorAnchor.lon),
      name: corridorLocality || 'Downstream corridor',
      type: 'waypoint',
    }] : []),
    {
      lat: input.estoniaEntryCorridor.entryLat,
      lon: input.estoniaEntryCorridor.entryLon,
      name: input.estoniaEntryCorridor.entryLabel,
      type: 'waypoint',
    },
    {
      lat: input.target.lat,
      lon: input.target.lon,
      name: input.target.name,
      type: 'destination',
    },
  ]);
  const totalDistanceKm = computeRouteDistanceKm(routePoints);
  const route = routePoints.map((point, index) => ({
    lat: point.lat,
    lon: point.lon,
    name: point.name,
    type: point.type,
    cumulativeKm: Math.round(computeRouteDistanceKm(routePoints.slice(0, index + 1))),
    estimatedDate: new Date(Date.now() + index * 86400000).toISOString(),
    progressPct: routePoints.length > 1 ? Math.round((index / (routePoints.length - 1)) * 100) : 100,
  }));
  return {
    distanceKm: Math.round(haversineKm(toNumber(input.sourceOriginAnchor.lat), toNumber(input.sourceOriginAnchor.lon), input.estoniaEntryCorridor.entryLat, input.estoniaEntryCorridor.entryLon)),
    routeDistanceKm: totalDistanceKm,
    entryZone: input.estoniaEntryCorridor.entryLabel,
    entryLat: input.estoniaEntryCorridor.entryLat,
    entryLon: input.estoniaEntryCorridor.entryLon,
    speciesType: 'migrant',
    totalDaysEstimate: Math.max(1, Math.round(totalDistanceKm / Math.max(140, toNumber(input.weather.windSpeedKph) * 6 || 160))),
    foreignSightingDate: stringOr(input.sourceOriginAnchor.newestObsDt),
    earliestArrival: new Date(Date.now() + 86400000).toISOString(),
    latestArrival: new Date(Date.now() + 3 * 86400000).toISOString(),
    isPastDue: false,
    isImminent: true,
    etaText: `${Math.max(1, Math.round(totalDistanceKm / Math.max(140, toNumber(input.weather.windSpeedKph) * 6 || 160)))}d`,
    fromLocality: sourceLocality,
    fromCountry: sourceCountry || sourceCountryCode,
    foreignLocality: sourceLocality,
    foreignCountry: sourceCountry || sourceCountryCode,
    migrationRoute: {
      route,
      totalDistanceKm,
      routeDistanceKm: totalDistanceKm,
      currentProgressPct: 0,
      currentEstimatedLat: routePoints[0]?.lat ?? toNumber(input.sourceOriginAnchor.lat),
      currentEstimatedLon: routePoints[0]?.lon ?? toNumber(input.sourceOriginAnchor.lon),
      currentWaypointIdx: 0,
      hasArrived: false,
      daysSinceSighting: Math.max(0, hasFiniteNumber(input.sourceOriginAnchor.freshestDaysAgo) ? toNumber(input.sourceOriginAnchor.freshestDaysAgo) : 0),
      speciesType: 'migrant',
    },
  };
}

function dedupeMigrationRoutePoints(points: Array<{ lat: number; lon: number; name: string; type: string }>): Array<{ lat: number; lon: number; name: string; type: string }> {
  const deduped: Array<{ lat: number; lon: number; name: string; type: string }> = [];
  points.forEach((point) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
    const previous = deduped[deduped.length - 1];
    if (previous && arePointsNear(previous.lat, previous.lon, point.lat, point.lon, 0.05)) return;
    deduped.push(point);
  });
  return deduped;
}

function computeRouteDistanceKm(points: Array<{ lat: number; lon: number }>): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineKm(points[index - 1].lat, points[index - 1].lon, points[index].lat, points[index].lon);
  }
  return Math.round(total);
}

function arePointsNear(lat1: number, lon1: number, lat2: number, lon2: number, toleranceDeg: number): boolean {
  return Math.abs(lat1 - lat2) <= toleranceDeg && Math.abs(lon1 - lon2) <= toleranceDeg;
}

function deriveEstoniaEntryCorridor(
  foreignAnchor: Record<string, unknown>,
  estoniaHistoryClusters: Array<Record<string, unknown>>,
): { entryLabel: string; entryLat: number; entryLon: number; bearingDeg: number; distanceFromForeignKm: number } {
  const coastalCandidates = estoniaHistoryClusters
    .map((cluster) => ({
      cluster,
      lat: Number.isFinite(Number(cluster.representativeLat)) ? toNumber(cluster.representativeLat) : toNumber(cluster.lat),
      lon: Number.isFinite(Number(cluster.representativeLon)) ? toNumber(cluster.representativeLon) : toNumber(cluster.lon),
      coastalDistanceKm: toNumber(cluster.coastalDistanceKm),
      clusterCount: toNumber(cluster.count),
      locality: stringOr(cluster.displayName, cluster.municipality, cluster.locality, 'Estonia entry'),
    }))
    .filter((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon))
    .sort((left, right) =>
      left.coastalDistanceKm - right.coastalDistanceKm
      || haversineKm(foreignAnchor.lat as number, foreignAnchor.lon as number, left.lat, left.lon) - haversineKm(foreignAnchor.lat as number, foreignAnchor.lon as number, right.lat, right.lon)
      || right.clusterCount - left.clusterCount
    );
  const chosen = coastalCandidates[0];
  if (!chosen) {
    return {
      entryLabel: 'West Estonia entry',
      entryLat: 58.95,
      entryLon: 23.55,
      bearingDeg: bearingBetween(toNumber(foreignAnchor.lat), toNumber(foreignAnchor.lon), 58.95, 23.55),
      distanceFromForeignKm: haversineKm(toNumber(foreignAnchor.lat), toNumber(foreignAnchor.lon), 58.95, 23.55),
    };
  }
  return {
    entryLabel: chosen.locality,
    entryLat: chosen.lat,
    entryLon: chosen.lon,
    bearingDeg: bearingBetween(toNumber(foreignAnchor.lat), toNumber(foreignAnchor.lon), chosen.lat, chosen.lon),
    distanceFromForeignKm: haversineKm(toNumber(foreignAnchor.lat), toNumber(foreignAnchor.lon), chosen.lat, chosen.lon),
  };
}

function buildPredictionVectors(
  foreignClusters: Record<string, unknown>[],
  predictedTargets: Record<string, unknown>[],
  weather: Record<string, unknown>,
  settings: Record<string, unknown>,
): Record<string, unknown>[] {
  if (!foreignClusters.length || !predictedTargets.length) return [];
  const vectors: Record<string, unknown>[] = [];
  for (const cluster of foreignClusters.slice(0, 3)) {
    for (const target of predictedTargets.slice(0, 2)) {
      const bearing = bearingBetween(toNumber(cluster.lat), toNumber(cluster.lon), toNumber(target.lat), toNumber(target.lon));
      vectors.push({
        id: `${stringOr(cluster.id)}-to-${toNumber(target.rank)}`,
        kind: 'route',
        sourceClusterId: stringOr(cluster.id),
        targetRank: toNumber(target.rank),
        confidence: clampInt((toNumber(target.confidence) + clampInt(Math.round(computeWindSupport(weather)), 0, 100)) / 2, 0, 100),
        bearingDeg: bearing,
        distanceKm: haversineKm(toNumber(cluster.lat), toNumber(cluster.lon), toNumber(target.lat), toNumber(target.lon)),
        points: [
          { lat: toNumber(cluster.lat), lon: toNumber(cluster.lon) },
          { lat: toNumber(target.lat), lon: toNumber(target.lon) },
        ],
      });
      if (settings.showPredictionCone !== false && vectors.filter((vector) => vector.kind === 'cone').length < 2) {
        vectors.push(buildConeVector(cluster, target, weather));
      }
    }
  }
  return vectors;
}

function buildConeVector(cluster: Record<string, unknown>, target: Record<string, unknown>, weather: Record<string, unknown>): Record<string, unknown> {
  const startLat = toNumber(cluster.lat);
  const startLon = toNumber(cluster.lon);
  const bearing = bearingBetween(startLat, startLon, toNumber(target.lat), toNumber(target.lon));
  const distanceKm = haversineKm(startLat, startLon, toNumber(target.lat), toNumber(target.lon));
  const left = destinationPoint(startLat, startLon, distanceKm, bearing - 18);
  const right = destinationPoint(startLat, startLon, distanceKm, bearing + 18);
  return {
    id: `${stringOr(cluster.id)}-cone`,
    kind: 'cone',
    sourceClusterId: stringOr(cluster.id),
    confidence: clampInt(Math.round(computeWindSupport(weather)), 0, 100),
    bearingDeg: bearing,
    distanceKm,
    points: [
      { lat: startLat, lon: startLon },
      left,
      right,
      { lat: startLat, lon: startLon },
    ],
  };
}

async function maybeFetchSecondarySummary(opts: {
  webhookTarget: WebhookTargetInfo;
  webhookUrl: string;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  foreignEvidence: Record<string, unknown>[];
  predictedTargets: Record<string, unknown>[];
  weather: Record<string, unknown>;
  sourceHealth: Record<string, unknown>;
  estoniaEvidence: Record<string, unknown>;
  estoniaHistoryPoints: Record<string, unknown>[];
  estoniaHistoryClusters: Record<string, unknown>[];
  foreignRecentPoints: Record<string, unknown>[];
  foreignClusters: Record<string, unknown>[];
  evidenceStateSnapshot: EvidenceStateSnapshot;
}): Promise<NormalizedUpstreamResponse> {
  const {
    webhookTarget,
    webhookUrl,
    payload,
    signal,
    foreignEvidence,
    predictedTargets,
    weather,
    sourceHealth,
    estoniaEvidence,
    estoniaHistoryPoints,
    estoniaHistoryClusters,
    foreignRecentPoints,
    foreignClusters,
    evidenceStateSnapshot,
  } = opts;
  if (!webhookTarget.webhookConfigured || !webhookTarget.valid) {
    throw createWebhookConfigError(webhookTarget);
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = (Deno.env.get(AUTH_HEADER_ENV_KEY) || '').trim();
  const authValue = (Deno.env.get(AUTH_VALUE_ENV_KEY) || '').trim();
  if (authHeader && authValue) headers[authHeader] = authValue;
  const upstream = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...payload,
      evidenceSummary: {
        sourceHealth,
        foreignEvidence,
        predictedTargets,
        weather,
        estoniaEvidence,
        estoniaHistoryPoints,
        estoniaHistoryClusters,
        foreignRecentPoints,
        foreignClusters,
        evidenceState: evidenceStateSnapshot,
        hardRules: {
          distinguishNegativeEvidenceFromMissingData: true,
          doNotUseHighConfidenceAbsenceWhenSourcesUnavailable: true,
          weatherAloneIsWeakOrNeutral: true,
        },
      },
    }),
    signal,
  });
  const text = await upstream.text();
  let n8nParsed = safeJsonParse(text);
  if (Array.isArray(n8nParsed)) n8nParsed = n8nParsed[0];
  const n8nRecord = asRecord(n8nParsed);
  if (
    n8nParsed
    && n8nRecord.ok === true
    && typeof n8nRecord.analysisVersion === 'string'
    && n8nRecord.analysisVersion.startsWith('v3')
  ) {
    console.log('[species-prediction] V3 passthrough activated');
    const passthroughPredictedTargets = Array.isArray(n8nRecord.predictedTargets) ? n8nRecord.predictedTargets : [];
    const passthroughTopPredictedPoints = Array.isArray(n8nRecord.topPredictedPoints)
      ? n8nRecord.topPredictedPoints
      : passthroughPredictedTargets;
    const passthroughSummary = stringOr(
      n8nRecord.insightSummary,
      asRecord(n8nRecord.aiSummary).insightSummary,
      n8nRecord.aiSummary,
      '',
    );
    return {
      ...n8nRecord,
      ok: true,
      status: 'completed',
      error: null,
      speciesKey: stringOr(n8nRecord.speciesKey, asRecord(n8nRecord.species).speciesKey, asRecord(n8nRecord.species).key, asRecord(payload.species).key),
      speciesName: stringOr(n8nRecord.speciesName, asRecord(n8nRecord.species).speciesName, asRecord(n8nRecord.species).name, asRecord(payload.species).name),
      scope: stringOr(n8nRecord.scope, asRecord(payload.settings).scope) || 'linnuliigid',
      generatedAt: stringOr(n8nRecord.generatedAt) || new Date().toISOString(),
      analysisVersion: stringOr(n8nRecord.analysisVersion) || 'v3_passthrough',
      sourceHealth: asRecord(n8nRecord.sourceHealth),
      countryScores: asRecord(n8nRecord.countryScores),
      estoniaEvidence: asRecord(n8nRecord.estoniaEvidence),
      evidenceSummary: asRecord(n8nRecord.evidenceSummary),
      foreignClusters: Array.isArray(n8nRecord.foreignClusters) ? n8nRecord.foreignClusters : [],
      predictedTargets: passthroughPredictedTargets,
      topTarget: passthroughTopPredictedPoints.length ? asRecord(passthroughTopPredictedPoints[0]) : undefined,
      foreignRecentPoints: Array.isArray(n8nRecord.foreignRecentPoints) ? n8nRecord.foreignRecentPoints : [],
      estoniaHistoryPoints: Array.isArray(n8nRecord.estoniaHistoryPoints) ? n8nRecord.estoniaHistoryPoints : [],
      elurikkusRecentRecords: Array.isArray(n8nRecord.elurikkusRecentRecords) ? n8nRecord.elurikkusRecentRecords : [],
      estoniaHistoryClusters: Array.isArray(n8nRecord.estoniaHistoryClusters) ? n8nRecord.estoniaHistoryClusters : [],
      mapLayers: asRecord(n8nRecord.mapLayers),
      mapLayersDefault: asRecord(n8nRecord.mapLayersDefault),
      species: asRecord(n8nRecord.species),
      weather: asRecord(n8nRecord.weather),
      evidenceState: typeof n8nRecord.evidenceState === 'string' ? n8nRecord.evidenceState as EvidenceState : 'insufficient',
      hasUsableRecentEstoniaEvidence: n8nRecord.hasUsableRecentEstoniaEvidence === true,
      hasUsableEstoniaHistory: n8nRecord.hasUsableEstoniaHistory === true,
      hasUsableForeignPressure: n8nRecord.hasUsableForeignPressure === true,
      hasUsablePredictedTargets: n8nRecord.hasUsablePredictedTargets === true || passthroughTopPredictedPoints.length > 0,
      hasOnlyWeather: n8nRecord.hasOnlyWeather === true,
      hasOnlySourceAvailabilityWithoutUsableEvidence: n8nRecord.hasOnlySourceAvailabilityWithoutUsableEvidence === true,
      activeEvidenceSources: Array.isArray(n8nRecord.activeEvidenceSources) ? n8nRecord.activeEvidenceSources.map((item) => String(item ?? '')) : [],
      availableSources: Array.isArray(n8nRecord.availableSources) ? n8nRecord.availableSources.map((item) => String(item ?? '')) : [],
      attemptedButUnavailable: Array.isArray(n8nRecord.attemptedButUnavailable) ? n8nRecord.attemptedButUnavailable.map((item) => String(item ?? '')) : [],
      attemptedButReturnedNoUsableEvidence: Array.isArray(n8nRecord.attemptedButReturnedNoUsableEvidence) ? n8nRecord.attemptedButReturnedNoUsableEvidence.map((item) => String(item ?? '')) : [],
      effectiveRankingMode: stringOr(n8nRecord.effectiveRankingMode),
      summaryGuardrailApplied: false,
      summaryGuardrailReason: '',
      payloadSourceState: 'n8n_v3_passthrough',
      globalMigrationEtas: Array.isArray(n8nRecord.globalMigrationEtas) ? n8nRecord.globalMigrationEtas : [],
      topPredictedPoints: passthroughTopPredictedPoints,
      insightSummary: passthroughSummary,
      aiSummary: passthroughSummary,
      confidenceNote: stringOr(n8nRecord.confidenceNote, asRecord(n8nRecord.aiSummary).confidenceNote),
      rankingNotes: stringOr(n8nRecord.rankingNotes, asRecord(n8nRecord.aiSummary).rankingNotes),
      warnings: Array.isArray(n8nRecord.warnings)
        ? n8nRecord.warnings.map((item) => String(item ?? ''))
        : (Array.isArray(asRecord(n8nRecord.aiSummary).warnings)
          ? (asRecord(n8nRecord.aiSummary).warnings as unknown[]).map((item) => String(item ?? ''))
          : []),
      summarySourcePath: typeof n8nRecord.summarySourcePath === 'string' ? n8nRecord.summarySourcePath : undefined,
      raw: n8nRecord,
    } as NormalizedUpstreamResponse;
  }
  const data = n8nParsed;
  const effectiveData = n8nParsed;
  if (!upstream.ok) {
    throw createUpstreamError({
      stage: 'n8n_upstream',
      webhookTarget,
      upstreamStatus: upstream.status,
      upstreamStatusText: upstream.statusText,
      upstreamBody: data,
    });
  }
  const upstreamRecord = asRecord(effectiveData);
  const shapeDiagnostics = buildSummaryShapeDiagnostics(effectiveData);
  const extractedSummary = extractNormalizedAiSummary(effectiveData);
  const normalizedResponse = normalizeN8nPredictionSuccessPayload(effectiveData);
  console.info(`${LOG_PREFIX} upstream_normalization`, {
    branch: 'maybeFetchSecondarySummary.upstream_normalization',
    functionName: 'maybeFetchSecondarySummary',
    topLevelKeys: shapeDiagnostics.topLevelKeys,
    aiSummaryType: typeof upstreamRecord.aiSummary,
    nestedInsightSummaryType: typeof asRecord(upstreamRecord.aiSummary).insightSummary,
    topLevelInsightSummaryType: typeof upstreamRecord.insightSummary,
    summaryShapeUsed: extractedSummary?.summaryShapeUsed || 'missing',
    normalizedInsightLength: extractedSummary?.normalizedInsightLength || 0,
    normalizedWarningsCount: extractedSummary?.normalizedWarningsCount || 0,
    normalizedRankingNotesType: extractedSummary?.normalizedRankingNotesType || '',
    summarySourcePath: extractedSummary?.summarySourcePath || '',
    rankingNotesInputType: extractedSummary?.rankingNotesInputType || '',
    warningsInputType: extractedSummary?.warningsInputType || '',
    normalizedPredictionShape: extractedSummary?.normalizedPredictionShape || '',
    nestedAiSummaryKeys: shapeDiagnostics.nestedAiSummaryKeys,
    backendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
  });
  if (!normalizedResponse) {
    console.warn(`${LOG_PREFIX} upstream_normalization_failed`, {
      filePath: EDGE_FUNCTION_FILE,
      functionName: 'maybeFetchSecondarySummary',
      branchName: 'maybeFetchSecondarySummary.throw.invalid_upstream_json',
      hasTopLevelInsightSummary: shapeDiagnostics.hasTopLevelInsightSummary,
      hasNestedAiSummaryObject: shapeDiagnostics.hasNestedAiSummaryObject,
      hasNestedAiSummaryInsight: shapeDiagnostics.hasNestedAiSummaryInsight,
      topLevelKeys: shapeDiagnostics.topLevelKeys,
      nestedAiSummaryKeys: shapeDiagnostics.nestedAiSummaryKeys,
      insightSummaryType: shapeDiagnostics.insightSummaryType,
      normalizedInsightLength: extractedSummary?.normalizedInsightLength || 0,
      normalizedWarningsCount: extractedSummary?.normalizedWarningsCount || 0,
      normalizedRankingNotesType: extractedSummary?.normalizedRankingNotesType || '',
      summarySourcePath: extractedSummary?.summarySourcePath || '',
      hasAiSummaryObject: extractedSummary?.hasAiSummaryObject ?? shapeDiagnostics.hasNestedAiSummaryObject,
      hasNestedInsightSummary: extractedSummary?.hasNestedInsightSummary ?? shapeDiagnostics.hasNestedAiSummaryInsight,
      rankingNotesInputType: extractedSummary?.rankingNotesInputType || '',
      warningsInputType: extractedSummary?.warningsInputType || '',
      normalizedPredictionShape: extractedSummary?.normalizedPredictionShape || '',
      insightSummaryValuePreview: buildInsightSummaryPreview(effectiveData),
      aiSummaryType: typeof upstreamRecord.aiSummary,
      nestedInsightSummaryType: typeof asRecord(upstreamRecord.aiSummary).insightSummary,
      topLevelInsightSummaryType: typeof upstreamRecord.insightSummary,
      backendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
    });
    throw createUpstreamError({
      stage: 'invalid_upstream_json',
      webhookTarget,
      upstreamStatus: upstream.status,
      upstreamStatusText: upstream.statusText,
      upstreamBody: {
        ...asRecord(effectiveData),
        hasTopLevelInsightSummary: shapeDiagnostics.hasTopLevelInsightSummary,
        hasNestedAiSummaryObject: shapeDiagnostics.hasNestedAiSummaryObject,
        hasNestedAiSummaryInsight: shapeDiagnostics.hasNestedAiSummaryInsight,
        topLevelKeys: shapeDiagnostics.topLevelKeys,
        nestedAiSummaryKeys: shapeDiagnostics.nestedAiSummaryKeys,
        insightSummaryType: shapeDiagnostics.insightSummaryType,
        normalizedInsightLength: extractedSummary?.normalizedInsightLength || 0,
        normalizedWarningsCount: extractedSummary?.normalizedWarningsCount || 0,
        normalizedRankingNotesType: extractedSummary?.normalizedRankingNotesType || '',
        summarySourcePath: extractedSummary?.summarySourcePath || '',
        hasAiSummaryObject: extractedSummary?.hasAiSummaryObject ?? shapeDiagnostics.hasNestedAiSummaryObject,
        hasNestedInsightSummary: extractedSummary?.hasNestedInsightSummary ?? shapeDiagnostics.hasNestedAiSummaryInsight,
        rankingNotesInputType: extractedSummary?.rankingNotesInputType || '',
        warningsInputType: extractedSummary?.warningsInputType || '',
        normalizedPredictionShape: extractedSummary?.normalizedPredictionShape || '',
        insightSummaryValuePreview: buildInsightSummaryPreview(effectiveData),
        nestedInsightSummaryType: typeof asRecord(upstreamRecord.aiSummary).insightSummary,
        topLevelInsightSummaryType: typeof upstreamRecord.insightSummary,
        backendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
      },
      fallbackCode: 'N8N_UPSTREAM_INVALID_RESPONSE',
      fallbackMessage: 'n8n returned success but no AI summary payload was present',
      shapeDiagnostics,
    });
  }
  const guardedResponse = applyEvidenceStateSummaryGuardrails(normalizedResponse, evidenceStateSnapshot);
  console.info(`${LOG_PREFIX} summary_guardrails`, {
    evidenceState: guardedResponse.evidenceState,
    hasUsableRecentEstoniaEvidence: guardedResponse.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: guardedResponse.hasUsableEstoniaHistory,
    hasUsableForeignPressure: guardedResponse.hasUsableForeignPressure,
    hasUsablePredictedTargets: guardedResponse.hasUsablePredictedTargets,
    hasOnlyWeather: guardedResponse.hasOnlyWeather,
    summaryGuardrailApplied: guardedResponse.summaryGuardrailApplied,
    summaryGuardrailReason: guardedResponse.summaryGuardrailReason,
    originalAiSummarySnippet: buildInsightSummaryPreview(effectiveData),
    finalAiSummarySnippet: guardedResponse.insightSummary.slice(0, 160),
  });
  return guardedResponse;
}

function resolveWebhookTarget(): WebhookTargetInfo {
  const raw = readWebhookUrl();
  const envPresent = raw.length > 0;
  const normalizedRaw = stripTrailingSlashes(stripWrappingQuotes(raw.trim()));
  const rawWebhookPreview = redactWebhookUrlPreview(normalizedRaw);

  if (!normalizedRaw) {
    return buildWebhookTargetInfo({
      envPresent,
      envLength: raw.length,
      rawWebhookPreview,
      parsedUrlOk: false,
      configuredPathname: '',
      normalizedConfiguredPath: '',
      fallbackUsed: false,
      fallbackValue: '',
      missingWebhookEnv: true,
      invalidWebhookUrl: false,
      webhookConfigured: false,
      valid: false,
      configuredWebhookUrl: '',
      configuredWebhookUrlPreview: '',
      configuredWebhookPath: '',
      looksLikeProductionWebhook: false,
      available: false,
      validationErrorCode: 'MISSING_WEBHOOK_URL',
      validationMessage: `${WEBHOOK_ENV_KEY} is missing or empty.`,
    });
  }
  let parsed: URL;
  try {
    parsed = new URL(normalizedRaw);
  } catch {
    return buildWebhookTargetInfo({
      envPresent,
      envLength: raw.length,
      rawWebhookPreview,
      parsedUrlOk: false,
      configuredPathname: '',
      normalizedConfiguredPath: '',
      fallbackUsed: false,
      fallbackValue: '',
      missingWebhookEnv: false,
      invalidWebhookUrl: true,
      webhookConfigured: true,
      valid: false,
      configuredWebhookUrl: normalizedRaw,
      configuredWebhookUrlPreview: rawWebhookPreview,
      configuredWebhookPath: '',
      looksLikeProductionWebhook: false,
      available: false,
      validationErrorCode: 'INVALID_WEBHOOK_URL',
      validationMessage: `${WEBHOOK_ENV_KEY} is not a valid absolute URL.`,
    });
  }
  const configuredPathname = stripTrailingSlashes(parsed.pathname || '');
  const webhookPath = normalizeWebhookPath(configuredPathname);
  if (!webhookPath) {
    return buildWebhookTargetInfo({
      envPresent,
      envLength: raw.length,
      rawWebhookPreview,
      parsedUrlOk: true,
      configuredPathname,
      normalizedConfiguredPath: '',
      fallbackUsed: false,
      fallbackValue: '',
      missingWebhookEnv: false,
      invalidWebhookUrl: true,
      webhookConfigured: true,
      valid: false,
      configuredWebhookUrl: parsed.toString(),
      configuredWebhookUrlPreview: redactWebhookUrlPreview(parsed.toString()),
      configuredWebhookPath: '',
      looksLikeProductionWebhook: false,
      available: false,
      validationErrorCode: 'INVALID_WEBHOOK_PATH',
      validationMessage: `${WEBHOOK_ENV_KEY} must include a webhook path segment after /webhook/.`,
    });
  }
  const looksLikeProductionWebhook = webhookPath === EXPECTED_PRODUCTION_WEBHOOK_PATH;
  return buildWebhookTargetInfo({
    envPresent,
    envLength: raw.length,
    rawWebhookPreview,
    parsedUrlOk: true,
    configuredPathname,
    normalizedConfiguredPath: webhookPath,
    fallbackUsed: false,
    fallbackValue: '',
    missingWebhookEnv: false,
    invalidWebhookUrl: false,
    webhookConfigured: true,
    valid: true,
    configuredWebhookUrl: parsed.toString(),
    configuredWebhookUrlPreview: redactWebhookUrlPreview(parsed.toString()),
    configuredWebhookPath: webhookPath,
    looksLikeProductionWebhook,
    available: looksLikeProductionWebhook,
    validationErrorCode: null,
    validationMessage: '',
  });
}

function createWebhookConfigError(webhookTarget: WebhookTargetInfo): SpeciesPredictionUpstreamError {
  return {
    stage: 'missing_webhook_url',
    code: webhookTarget.validationErrorCode || 'INVALID_WEBHOOK_URL',
    message: webhookTarget.validationMessage || 'n8n webhook URL is invalid or missing.',
    upstreamStatus: null,
    upstreamBody: null,
    resolvedWebhookUrl: webhookTarget.configuredWebhookUrl,
    resolvedWebhookPath: webhookTarget.configuredWebhookPath,
    productionWebhookInactive: false,
    backendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
    invokeRouteVersion: INVOKE_ROUTE_VERSION,
    summaryShapeUsed: 'missing',
    hasTopLevelInsightSummary: false,
    hasNestedAiSummaryObject: false,
    hasNestedAiSummaryInsight: false,
    topLevelKeys: [],
    nestedAiSummaryKeys: [],
    errorProofBuild: SPECIES_PREDICTION_BACKEND_BUILD,
    entrypointFile: EDGE_FUNCTION_FILE,
    entrypointFunction: EDGE_FUNCTION_ENTRYPOINT,
    responseProof: EDGE_RESPONSE_PROOF,
    deployedProjectRef: getDeployedProjectRef(),
    throwFile: EDGE_FUNCTION_FILE,
    throwFunction: 'createWebhookConfigError',
    throwBranch: 'createWebhookConfigError',
  };
}

function createUpstreamError(input: {
  stage: SpeciesPredictionUpstreamError['stage'];
  webhookTarget: WebhookTargetInfo;
  upstreamStatus: number | null;
  upstreamStatusText?: string;
  upstreamBody: unknown;
  fallbackCode?: UpstreamErrorCode;
  fallbackMessage?: string;
  summary?: NormalizedUpstreamSummary | null;
  shapeDiagnostics?: ReturnType<typeof buildSummaryShapeDiagnostics>;
}): SpeciesPredictionUpstreamError {
  const upstreamMessage = extractUpstreamMessage(input.upstreamBody);
  const productionWebhookInactive = isInactiveWebhookMessage(upstreamMessage);
  const shapeDiagnostics = input.shapeDiagnostics || buildSummaryShapeDiagnostics(input.upstreamBody);
  return {
    stage: input.stage,
    code: productionWebhookInactive ? 'N8N_WEBHOOK_INACTIVE' : (input.fallbackCode || 'N8N_UPSTREAM_NON_2XX'),
    message: productionWebhookInactive
      ? 'Prediction backend is configured, but the n8n production webhook is not active or not registered.'
      : (input.fallbackMessage || upstreamMessage || 'n8n upstream request failed'),
    upstreamStatus: input.upstreamStatus,
    upstreamStatusText: input.upstreamStatusText,
    upstreamMessage,
    upstreamBody: input.upstreamBody,
    resolvedWebhookUrl: input.webhookTarget.configuredWebhookUrl,
    resolvedWebhookPath: input.webhookTarget.configuredWebhookPath,
    productionWebhookInactive,
    backendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
    invokeRouteVersion: INVOKE_ROUTE_VERSION,
    summaryShapeUsed: input.summary?.summaryShapeUsed || 'missing',
    hasTopLevelInsightSummary: shapeDiagnostics.hasTopLevelInsightSummary,
    hasNestedAiSummaryObject: shapeDiagnostics.hasNestedAiSummaryObject,
    hasNestedAiSummaryInsight: shapeDiagnostics.hasNestedAiSummaryInsight,
    topLevelKeys: shapeDiagnostics.topLevelKeys,
    upstreamTopLevelKeys: shapeDiagnostics.topLevelKeys,
    nestedAiSummaryKeys: shapeDiagnostics.nestedAiSummaryKeys,
    errorProofBuild: SPECIES_PREDICTION_BACKEND_BUILD,
    entrypointFile: EDGE_FUNCTION_FILE,
    entrypointFunction: EDGE_FUNCTION_ENTRYPOINT,
    responseProof: EDGE_RESPONSE_PROOF,
    deployedProjectRef: getDeployedProjectRef(),
    ...(input.stage === 'invalid_upstream_json'
      ? {
        summarySourcePath: typeof (input.upstreamBody as Record<string, unknown> | null)?.summarySourcePath === 'string'
          ? (input.upstreamBody as Record<string, unknown>).summarySourcePath
          : undefined,
        hasAiSummaryObject: (input.upstreamBody as Record<string, unknown> | null)?.hasAiSummaryObject === true,
        hasNestedInsightSummary: (input.upstreamBody as Record<string, unknown> | null)?.hasNestedInsightSummary === true,
        normalizedInsightLength: (input.upstreamBody as Record<string, unknown> | null)?.normalizedInsightLength,
        normalizedWarningsCount: (input.upstreamBody as Record<string, unknown> | null)?.normalizedWarningsCount,
        normalizedRankingNotesType: typeof (input.upstreamBody as Record<string, unknown> | null)?.normalizedRankingNotesType === 'string'
          ? (input.upstreamBody as Record<string, unknown>).normalizedRankingNotesType
          : undefined,
        rankingNotesInputType: typeof (input.upstreamBody as Record<string, unknown> | null)?.rankingNotesInputType === 'string'
          ? (input.upstreamBody as Record<string, unknown>).rankingNotesInputType
          : undefined,
        warningsInputType: typeof (input.upstreamBody as Record<string, unknown> | null)?.warningsInputType === 'string'
          ? (input.upstreamBody as Record<string, unknown>).warningsInputType
          : undefined,
        normalizedPredictionShape: typeof (input.upstreamBody as Record<string, unknown> | null)?.normalizedPredictionShape === 'string'
          ? (input.upstreamBody as Record<string, unknown>).normalizedPredictionShape
          : undefined,
        insightSummaryValuePreview: buildInsightSummaryPreview(input.upstreamBody),
        nestedInsightSummaryType: typeof asRecord(asRecord(input.upstreamBody).aiSummary).insightSummary,
        topLevelInsightSummaryType: typeof asRecord(input.upstreamBody).insightSummary,
      }
      : {}),
    ...(input.stage === 'invalid_upstream_json'
      ? {
        throwFile: EDGE_FUNCTION_FILE,
        throwFunction: 'maybeFetchSecondarySummary',
        throwBranch: 'maybeFetchSecondarySummary.throw.invalid_upstream_json',
      }
      : {}),
  };
}

function normalizePredictionError(error: unknown, webhookTarget: WebhookTargetInfo): SpeciesPredictionUpstreamError | null {
  if (isUpstreamErrorRecord(error)) return error;
  if (error instanceof Error && error.message) {
    return {
      stage: 'n8n_upstream',
      code: 'N8N_UPSTREAM_NON_2XX',
      message: error.message,
      upstreamStatus: null,
      upstreamBody: { detail: error.message },
      resolvedWebhookUrl: webhookTarget.configuredWebhookUrl,
      resolvedWebhookPath: webhookTarget.configuredWebhookPath,
      productionWebhookInactive: false,
      backendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
      invokeRouteVersion: INVOKE_ROUTE_VERSION,
      summaryShapeUsed: 'missing',
      hasTopLevelInsightSummary: false,
      hasNestedAiSummaryObject: false,
      hasNestedAiSummaryInsight: false,
      topLevelKeys: [],
      nestedAiSummaryKeys: [],
      errorProofBuild: SPECIES_PREDICTION_BACKEND_BUILD,
      entrypointFile: EDGE_FUNCTION_FILE,
      entrypointFunction: EDGE_FUNCTION_ENTRYPOINT,
      responseProof: EDGE_RESPONSE_PROOF,
      deployedProjectRef: getDeployedProjectRef(),
      throwFile: EDGE_FUNCTION_FILE,
      throwFunction: 'normalizePredictionError',
      throwBranch: 'normalizePredictionError',
    };
  }
  return null;
}

function isUpstreamErrorRecord(value: unknown): value is SpeciesPredictionUpstreamError {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.stage === 'string'
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.resolvedWebhookUrl === 'string'
    && typeof candidate.resolvedWebhookPath === 'string';
}

function extractUpstreamMessage(body: unknown): string {
  if (!body) return '';
  if (typeof body === 'string') return body.trim();
  if (typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const direct = stringOr(record.message, record.error, record.detail, record.reason);
    if (direct) return direct;
    if (record.data && typeof record.data === 'object') return extractUpstreamMessage(record.data);
  }
  return '';
}

function buildInsightSummaryPreview(body: unknown): string {
  const record = asRecord(body);
  const aiSummaryRec = asRecord(record.aiSummary);
  const nestedSummary = typeof aiSummaryRec.insightSummary === 'string'
    ? (aiSummaryRec.insightSummary as string).trim()
    : '';
  const topLevelSummary = typeof record.insightSummary === 'string'
    ? (record.insightSummary as string).trim()
    : '';
  return (nestedSummary || topLevelSummary).slice(0, 160);
}

function isPostOnlyWebhookMessage(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('not registered for get requests')
    || normalized.includes('did you mean to make a post request');
}

function isInactiveWebhookMessage(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  if (isPostOnlyWebhookMessage(normalized)) return false;
  return normalized.includes('workflow must be active')
    || (normalized.includes('webhook') && normalized.includes('not registered'));
}

function normalizeWarnings(value: unknown): string[] {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeRankingNotes(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join(' • ');
  }
  return '';
}

function buildWrappedPredictionCandidates(data: unknown): Array<{ source: Record<string, unknown>; path: string }> {
  const root = asRecord(data);
  const candidates: Array<{ source: Record<string, unknown>; path: string }> = [];
  const queue: Array<{ source: Record<string, unknown>; path: string }> = [{ source: root, path: '' }];
  const seen = new Set<Record<string, unknown>>();

  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current.source)) continue;
    seen.add(current.source);
    candidates.push(current);
    for (const key of ['body', 'data', 'result', 'responseBody', 'upstreamBody']) {
      const next = asRecord(current.source[key]);
      if (!Object.keys(next).length) continue;
      queue.push({ source: next, path: current.path ? `${current.path}.${key}` : key });
    }
  }

  return candidates;
}

function resolveUpstreamResponseSource(data: unknown): {
  source: Record<string, unknown>;
  summarySourcePath: string;
  insightSummary: string;
  summaryShapeUsed: 'nested_aiSummary' | 'flat_legacy' | 'missing';
  hasTopLevelInsightSummary: boolean;
  hasNestedAiSummaryObject: boolean;
  hasNestedAiSummaryInsight: boolean;
  topLevelKeys: string[];
  nestedAiSummaryKeys: string[];
  rankingNotesInputType: string;
  warningsInputType: string;
  normalizedPredictionShape: string;
} | null {
  const probes = buildWrappedPredictionCandidates(data).flatMap((candidate) => ([
    {
      source: candidate.source,
      summarySourcePath: candidate.path ? `${candidate.path}.aiSummary.insightSummary` : 'aiSummary.insightSummary',
      summaryShapeUsed: 'nested_aiSummary' as const,
    },
    {
      source: candidate.source,
      summarySourcePath: candidate.path ? `${candidate.path}.insightSummary` : 'insightSummary',
      summaryShapeUsed: 'flat_legacy' as const,
    },
  ]));

  for (const probe of probes) {
    const aiSummaryRecord = asRecord(probe.source.aiSummary);
    const summary = probe.summaryShapeUsed === 'nested_aiSummary'
      ? (typeof aiSummaryRecord.insightSummary === 'string' ? aiSummaryRecord.insightSummary.trim() : '')
      : (typeof probe.source.insightSummary === 'string' ? probe.source.insightSummary.trim() : '');
    if (!summary) continue;
    return {
      source: probe.source,
      summarySourcePath: probe.summarySourcePath,
      insightSummary: summary,
      summaryShapeUsed: probe.summaryShapeUsed,
      hasTopLevelInsightSummary: typeof probe.source.insightSummary === 'string' && probe.source.insightSummary.trim().length > 0,
      hasNestedAiSummaryObject: Object.keys(aiSummaryRecord).length > 0,
      hasNestedAiSummaryInsight: typeof aiSummaryRecord.insightSummary === 'string' && aiSummaryRecord.insightSummary.trim().length > 0,
      topLevelKeys: Object.keys(probe.source),
      nestedAiSummaryKeys: Object.keys(aiSummaryRecord),
      rankingNotesInputType: typeof (probe.summaryShapeUsed === 'nested_aiSummary' ? aiSummaryRecord.rankingNotes ?? aiSummaryRecord.ranking_notes : probe.source.rankingNotes ?? probe.source.ranking_notes),
      warningsInputType: Array.isArray(probe.summaryShapeUsed === 'nested_aiSummary' ? aiSummaryRecord.warnings : probe.source.warnings)
        ? 'array'
        : typeof (probe.summaryShapeUsed === 'nested_aiSummary' ? aiSummaryRecord.warnings : probe.source.warnings),
      normalizedPredictionShape: probe.summaryShapeUsed === 'nested_aiSummary'
        ? (probe.summarySourcePath === 'aiSummary.insightSummary' ? 'nested-aiSummary-direct' : 'nested-aiSummary-wrapped-envelope')
        : (probe.summarySourcePath === 'insightSummary' ? 'flat-direct' : 'flat-wrapped-envelope'),
    };
  }

  return null;
}

function extractNormalizedAiSummary(data: unknown): NormalizedUpstreamSummary | null {
  const resolvedSource = resolveUpstreamResponseSource(data);
  if (!resolvedSource) return null;
  const record = resolvedSource.source;
  const aiSummaryRecord = asRecord(record.aiSummary);
  const warnings = resolvedSource.summaryShapeUsed === 'nested_aiSummary'
    ? normalizeWarnings(aiSummaryRecord.warnings)
    : normalizeWarnings(record.warnings);
  const confidenceNote = resolvedSource.summaryShapeUsed === 'nested_aiSummary'
    ? stringOr(aiSummaryRecord.confidenceNote).trim()
    : stringOr(record.confidenceNote).trim();
  const rankingNotes = resolvedSource.summaryShapeUsed === 'nested_aiSummary'
    ? normalizeRankingNotes(aiSummaryRecord.rankingNotes ?? aiSummaryRecord.ranking_notes)
    : normalizeRankingNotes(record.rankingNotes ?? record.ranking_notes);
  return {
    insightSummary: resolvedSource.insightSummary,
    confidenceNote,
    rankingNotes,
    warnings,
    summaryShapeUsed: resolvedSource.summaryShapeUsed,
    normalizedInsightLength: resolvedSource.insightSummary.length,
    normalizedWarningsCount: warnings.length,
    normalizedRankingNotesType: rankingNotes ? 'string' : typeof (resolvedSource.summaryShapeUsed === 'nested_aiSummary'
      ? aiSummaryRecord.rankingNotes ?? aiSummaryRecord.ranking_notes
      : record.rankingNotes ?? record.ranking_notes),
    summarySourcePath: resolvedSource.summarySourcePath,
    hasTopLevelInsightSummary: resolvedSource.hasTopLevelInsightSummary,
    hasNestedAiSummaryObject: resolvedSource.hasNestedAiSummaryObject,
    hasNestedAiSummaryInsight: resolvedSource.hasNestedAiSummaryInsight,
    hasAiSummaryObject: resolvedSource.hasNestedAiSummaryObject,
    hasNestedInsightSummary: resolvedSource.hasNestedAiSummaryInsight,
    topLevelKeys: resolvedSource.topLevelKeys,
    nestedAiSummaryKeys: resolvedSource.nestedAiSummaryKeys,
    rankingNotesInputType: resolvedSource.rankingNotesInputType,
    warningsInputType: resolvedSource.warningsInputType,
    normalizedPredictionShape: resolvedSource.normalizedPredictionShape,
  };
}

function sanitizeSuccessfulPredictionPayload(body: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...body };
  for (const key of [
    'recoveredFromErrorEnvelope',
    'summarySourcePath',
    'normalizedPredictionShape',
    'rawTopLevelCode',
    'rawTopLevelStage',
    'hasAiSummaryObject',
    'hasNestedInsightSummary',
    'rankingNotesInputType',
    'warningsInputType',
    'summaryShapeUsed',
    'hasTopLevelInsightSummary',
    'hasNestedAiSummaryObject',
    'hasNestedAiSummaryInsight',
    'upstreamTopLevelKeys',
    'topLevelKeys',
    'nestedAiSummaryKeys',
    'normalizedInsightLength',
    'normalizedWarningsCount',
    'normalizedRankingNotesType',
    'summaryAcceptedBy',
    'liveInvokeAcceptedNestedAiSummary',
    'normalizationProof',
    'insightSummaryValuePreview',
    'nestedInsightSummaryType',
    'topLevelInsightSummaryType',
    'throwFile',
    'throwFunction',
    'throwBranch',
    'code',
    'stage',
    'message',
    'errorProofBuild',
  ]) {
    delete cleaned[key];
  }
  if (typeof cleaned.insightSummary === 'string' && cleaned.insightSummary.trim()) {
    cleaned.ok = true;
    cleaned.status = 'completed';
    cleaned.error = null;
  }
  return cleaned;
}

function buildCleanPredictionResult(
  data: unknown,
  context: CleanPredictionContext = {},
): NormalizedUpstreamResponse | null {
  const resolvedSource = resolveUpstreamResponseSource(data);
  const record = resolvedSource?.source ?? asRecord(data);
  const summary = extractNormalizedAiSummary(data);
  if (!summary) return null;
  const species = asRecord(record.species);
  const weather = asRecord(record.weather);
  const speciesKey = stringOr(record.speciesKey, species.speciesKey, species.key, context.speciesKey);
  const speciesName = stringOr(record.speciesName, species.speciesName, species.name, context.speciesName);
  const scope = stringOr(record.scope, context.scope) || 'linnuliigid';
  const sourceHealth = asRecord(record.sourceHealth);
  const estoniaEvidence = asRecord(record.estoniaEvidence);
  const evidenceSummary = asRecord(record.evidenceSummary);
  const foreignClusters = Array.isArray(record.foreignClusters) ? record.foreignClusters : [];
  const predictedTargets = Array.isArray(record.predictedTargets) ? record.predictedTargets : [];
  const foreignRecentPoints = Array.isArray(record.foreignRecentPoints) ? record.foreignRecentPoints : [];
  const estoniaHistoryPoints = Array.isArray(record.estoniaHistoryPoints) ? record.estoniaHistoryPoints : [];
  const elurikkusRecentRecords = Array.isArray(record.elurikkusRecentRecords) ? record.elurikkusRecentRecords : [];
  const estoniaHistoryClusters = Array.isArray(record.estoniaHistoryClusters) ? record.estoniaHistoryClusters : [];
  const topPredictedPoints = Array.isArray(record.topPredictedPoints) ? record.topPredictedPoints : predictedTargets;
  const evidenceStateSnapshot = computeEvidenceState({
    estoniaEvidence,
    estoniaHistoryPoints,
    estoniaHistoryClusters,
    foreignRecentPoints,
    foreignClusters,
    foreignEvidence: [],
    sourceHealth,
    weather,
    predictedTargets,
    topPredictedPoints,
  });
  const cleaned = sanitizeSuccessfulPredictionPayload({
    ok: true,
    status: 'completed',
    error: null,
    speciesKey,
    speciesName,
    scope,
    insightSummary: summary.insightSummary,
    confidenceNote: summary.confidenceNote,
    rankingNotes: summary.rankingNotes,
    warnings: summary.warnings,
    generatedAt: stringOr(record.generatedAt) || new Date().toISOString(),
    analysisVersion: stringOr(record.analysisVersion) || 'n8n_aiSummary_normalized',
    sourceHealth,
    countryScores: asRecord(record.countryScores),
    estoniaEvidence,
    evidenceSummary,
    foreignClusters,
    predictedTargets,
    foreignRecentPoints,
    estoniaHistoryPoints,
    elurikkusRecentRecords,
    estoniaHistoryClusters,
    mapLayers: asRecord(record.mapLayers),
    mapLayersDefault: asRecord(record.mapLayersDefault),
    species: {
      ...species,
      ...(stringOr(species.key) ? { key: stringOr(species.key) } : {}),
      ...(stringOr(species.name) ? { name: stringOr(species.name) } : {}),
      ...(speciesKey ? { speciesKey } : {}),
      ...(speciesName ? { speciesName } : {}),
      ...(stringOr(species.latinName) ? { latinName: stringOr(species.latinName) } : {}),
      ...(stringOr(species.ebirdSpeciesCode) ? { ebirdSpeciesCode: stringOr(species.ebirdSpeciesCode) } : {}),
    },
    weather: {
      ...weather,
      ...(stringOr(weather.source) ? { source: stringOr(weather.source) } : {}),
      ...(stringOr(weather.observedAt, weather.fetchedAt) ? {
        observedAt: stringOr(weather.observedAt, weather.fetchedAt),
        fetchedAt: stringOr(weather.fetchedAt, weather.observedAt),
      } : {}),
      ...(weather.windSpeedKmh != null || weather.windSpeedKph != null ? {
        windSpeedKmh: toNumber(weather.windSpeedKmh ?? weather.windSpeedKph),
        windSpeedKph: toNumber(weather.windSpeedKph ?? weather.windSpeedKmh),
      } : {}),
      ...(weather.windDirectionDeg != null ? { windDirectionDeg: toNumber(weather.windDirectionDeg) } : {}),
    },
    evidenceState: evidenceStateSnapshot.evidenceState,
    hasUsableRecentEstoniaEvidence: evidenceStateSnapshot.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: evidenceStateSnapshot.hasUsableEstoniaHistory,
    hasUsableForeignPressure: evidenceStateSnapshot.hasUsableForeignPressure,
    hasUsablePredictedTargets: evidenceStateSnapshot.hasUsablePredictedTargets,
    hasOnlyWeather: evidenceStateSnapshot.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: evidenceStateSnapshot.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: evidenceStateSnapshot.activeEvidenceSources,
    availableSources: evidenceStateSnapshot.availableSources,
    attemptedButUnavailable: evidenceStateSnapshot.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: evidenceStateSnapshot.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: evidenceStateSnapshot.effectiveRankingMode,
    summaryGuardrailApplied: false,
    summaryGuardrailReason: '',
    raw: record,
  }) as NormalizedUpstreamResponse;
  const guarded = applyEvidenceStateSummaryGuardrails(cleaned, evidenceStateSnapshot);
  const canonical = buildCanonicalPredictionRecord({
    base: guarded as unknown as Record<string, unknown>,
    preferredSummary: {
      insightSummary: guarded.insightSummary,
      confidenceNote: guarded.confidenceNote,
      rankingNotes: guarded.rankingNotes,
      warnings: guarded.warnings,
    },
  });
  console.info(`${LOG_PREFIX} recovered_summary_guardrails`, {
    evidenceState: canonical.evidenceState,
    hasUsableRecentEstoniaEvidence: canonical.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: canonical.hasUsableEstoniaHistory,
    hasUsableForeignPressure: canonical.hasUsableForeignPressure,
    hasUsablePredictedTargets: canonical.hasUsablePredictedTargets,
    hasOnlyWeather: canonical.hasOnlyWeather,
    summaryGuardrailApplied: canonical.summaryGuardrailApplied,
    summaryGuardrailReason: canonical.summaryGuardrailReason,
    originalAiSummarySnippet: buildInsightSummaryPreview(data),
    finalAiSummarySnippet: canonical.insightSummary.slice(0, 160),
  });
  let canonicalResponse: Record<string, unknown> = {
    ...guarded,
    speciesKey: canonical.speciesKey,
    speciesName: canonical.speciesName,
    scope: canonical.scope,
    generatedAt: canonical.generatedAt,
    analysisVersion: canonical.analysisVersion,
    species: canonical.species,
    sourceHealth: canonical.sourceHealth,
    countryScores: canonical.countryScores,
    estoniaEvidence: canonical.estoniaEvidence,
    evidenceSummary: canonical.evidenceSummary,
    foreignClusters: canonical.foreignClusters,
    predictedTargets: canonical.predictedTargets,
    topTarget: canonical.topTarget || undefined,
    foreignRecentPoints: canonical.foreignRecentPoints,
    estoniaHistoryPoints: canonical.estoniaHistoryPoints,
    elurikkusRecentRecords: canonical.elurikkusRecentRecords,
    estoniaHistoryClusters: canonical.estoniaHistoryClusters,
    mapLayers: canonical.mapLayers,
    mapLayersDefault: canonical.mapLayersDefault,
    globalMigrationEtas: canonical.globalMigrationEtas,
    weather: canonical.weather,
    evidenceState: canonical.evidenceState,
    hasUsableRecentEstoniaEvidence: canonical.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: canonical.hasUsableEstoniaHistory,
    hasUsableForeignPressure: canonical.hasUsableForeignPressure,
    hasUsablePredictedTargets: canonical.hasUsablePredictedTargets,
    hasOnlyWeather: canonical.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: canonical.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: canonical.activeEvidenceSources,
    availableSources: canonical.availableSources,
    attemptedButUnavailable: canonical.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: canonical.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: canonical.effectiveRankingMode,
    insightSummary: canonical.insightSummary,
    aiSummary: canonical.insightSummary,
    confidenceNote: canonical.confidenceNote,
    rankingNotes: canonical.rankingNotes,
    warnings: canonical.warnings,
    summaryGuardrailApplied: canonical.summaryGuardrailApplied,
    summaryGuardrailReason: canonical.summaryGuardrailReason,
    summaryOrigin: canonical.summaryOrigin,
    consistencyChecks: canonical.consistencyChecks,
    summaryRegeneratedFromStructuredEvidence: canonical.summaryRegeneratedFromStructuredEvidence,
  };
  canonicalResponse = finalizePredictionResponse(canonicalResponse, 'recovery_buildCleanPredictionResult');
  return canonicalResponse as NormalizedUpstreamResponse;
}

function normalizeN8nPredictionSuccessPayload(data: unknown): NormalizedUpstreamResponse | null {
  return buildCleanPredictionResult(data);
}

function normalizeUpstreamResponse(data: unknown): NormalizedUpstreamResponse | null {
  return normalizeN8nPredictionSuccessPayload(data);
}

function attachNormalizationMarkers(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    ...buildEntrypointMarkers(),
    backendBuild: SPECIES_PREDICTION_BACKEND_BUILD,
    invokeRouteVersion: INVOKE_ROUTE_VERSION,
  };
}

function enrichPredictionResult(
  raw: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedUpstream = normalizeN8nPredictionSuccessPayload(raw);
  const species = asRecord(raw.species);
  const payloadSpecies = asRecord(payload.species);
  const payloadSettings = asRecord(payload.settings);
  const rawResearchPayload = asRecord(raw.rawResearchPayload);
  const normalizedSources = asRecord(rawResearchPayload.normalizedSources);
  const foreignSightings = Array.isArray(normalizedSources.foreignSightings) ? normalizedSources.foreignSightings : [];
  const elurikkusHistory = asRecord(normalizedSources.elurikkusHistory);
  const estoniaRecent = asRecord(normalizedSources.estoniaRecent);
  const weather = asRecord(normalizedSources.weather);
  const foreignEvidence = buildForeignEvidence(foreignSightings);
  const estoniaEvidence = buildEstoniaEvidence(estoniaRecent);
  const historicalEvidence = buildHistoricalEvidence(elurikkusHistory);
  const sourceHealth = buildSourceHealth(raw, normalizedSources, foreignEvidence, estoniaEvidence, historicalEvidence);
  const speciesInfo = {
    speciesKey: stringOr(raw.speciesKey, payloadSpecies.key),
    speciesName: stringOr(raw.speciesName, payloadSpecies.name),
    latinName: stringOr(species.latinName, raw.latinName, payloadSpecies.latinName),
    ebirdSpeciesCode: stringOr(species.ebirdSpeciesCode, raw.ebirdSpeciesCode, payloadSettings.ebirdSpeciesCodeOverride),
  };
  const rawLinks = buildRawLinks(speciesInfo.speciesName, foreignEvidence);
  const topPredictedPoints = enrichPredictedTargets(
    Array.isArray(raw.topPredictedPoints) ? raw.topPredictedPoints : [],
    foreignEvidence,
    estoniaEvidence,
    historicalEvidence,
  );
  const rerankedTopPredictedPoints = enrichPredictedTargets(
    Array.isArray(raw.rerankedTopPredictedPoints) ? raw.rerankedTopPredictedPoints : [],
    foreignEvidence,
    estoniaEvidence,
    historicalEvidence,
  );
  const sourceWarnings = Array.isArray(sourceHealth.sourceWarnings) ? sourceHealth.sourceWarnings : [];
  const existingWarnings = normalizedUpstream?.warnings
    ?? (Array.isArray(raw.warnings) ? raw.warnings.map((item) => String(item || '').trim()).filter(Boolean) : []);
  const canonicalForeignClusters = normalizedUpstream?.foreignClusters ?? (Array.isArray(raw.foreignClusters) ? raw.foreignClusters : []);
  const canonicalPredictedTargets = normalizedUpstream?.predictedTargets ?? (Array.isArray(raw.predictedTargets) ? raw.predictedTargets : []);
  const canonicalForeignRecentPoints = normalizedUpstream?.foreignRecentPoints ?? (Array.isArray(raw.foreignRecentPoints) ? raw.foreignRecentPoints : []);
  const canonicalEstoniaHistoryPoints = normalizedUpstream?.estoniaHistoryPoints ?? (Array.isArray(raw.estoniaHistoryPoints) ? raw.estoniaHistoryPoints : []);
  const canonicalElurikkusRecentRecords = normalizedUpstream?.elurikkusRecentRecords ?? (Array.isArray(raw.elurikkusRecentRecords) ? raw.elurikkusRecentRecords : []);
  const canonicalEstoniaHistoryClusters = normalizedUpstream?.estoniaHistoryClusters ?? (Array.isArray(raw.estoniaHistoryClusters) ? raw.estoniaHistoryClusters : []);
  const canonicalMapLayersDefault = normalizedUpstream?.mapLayersDefault ?? asRecord(raw.mapLayersDefault);
  const canonicalSourceHealth = Object.keys(normalizedUpstream?.sourceHealth || {}).length ? normalizedUpstream!.sourceHealth : sourceHealth;
  const canonicalEstoniaEvidence = Object.keys(normalizedUpstream?.estoniaEvidence || {}).length ? normalizedUpstream!.estoniaEvidence : estoniaEvidence;
  const canonicalEvidenceSummary = Object.keys(normalizedUpstream?.evidenceSummary || {}).length ? normalizedUpstream!.evidenceSummary : asRecord(raw.evidenceSummary);
  const canonicalCountryScores = Object.keys(normalizedUpstream?.countryScores || {}).length ? normalizedUpstream!.countryScores : asRecord(raw.countryScores);
  const canonicalWeather = Object.keys(normalizedUpstream?.weather || {}).length ? normalizedUpstream!.weather : asRecord(raw.weather);
  const generatedAt = normalizedUpstream?.generatedAt || stringOr(raw.generatedAt) || new Date().toISOString();
  const analysisVersion = normalizedUpstream?.analysisVersion || stringOr(raw.analysisVersion);
  const evidenceStateSnapshot = computeEvidenceState({
    estoniaEvidence: canonicalEstoniaEvidence,
    estoniaHistoryPoints: canonicalEstoniaHistoryPoints,
    estoniaHistoryClusters: canonicalEstoniaHistoryClusters,
    foreignRecentPoints: canonicalForeignRecentPoints,
    foreignClusters: canonicalForeignClusters,
    foreignEvidence,
    sourceHealth: canonicalSourceHealth,
    weather: canonicalWeather,
    predictedTargets: canonicalPredictedTargets,
    topPredictedPoints: topPredictedPoints.length ? topPredictedPoints : canonicalPredictedTargets,
  });
  const canonicalSpecies = Object.keys(normalizedUpstream?.species || {}).length
    ? normalizedUpstream!.species
    : {
      ...speciesInfo,
      key: speciesInfo.speciesKey,
      name: speciesInfo.speciesName,
    };

  const assembled = {
    ...raw,
    ...(canonicalSpecies.speciesKey ? { speciesKey: canonicalSpecies.speciesKey } : {}),
    ...(canonicalSpecies.speciesName ? { speciesName: canonicalSpecies.speciesName } : {}),
    ...(stringOr(raw.scope, payloadSettings.scope) ? { scope: stringOr(raw.scope, payloadSettings.scope) } : {}),
    species: canonicalSpecies,
    insightSummary: normalizedUpstream?.insightSummary || stringOr(raw.insightSummary),
    confidenceNote: normalizedUpstream?.confidenceNote || stringOr(raw.confidenceNote),
    rankingNotes: normalizedUpstream?.rankingNotes || stringOr(raw.rankingNotes),
    generatedAt,
    ...(analysisVersion ? { analysisVersion } : {}),
    edgeFunctionVersion: EDGE_FUNCTION_VERSION,
    sourceHealth: canonicalSourceHealth,
    countryScores: canonicalCountryScores,
    foreignEvidence,
    estoniaEvidence: canonicalEstoniaEvidence,
    evidenceSummary: canonicalEvidenceSummary,
    foreignClusters: canonicalForeignClusters,
    predictedTargets: canonicalPredictedTargets,
    foreignRecentPoints: canonicalForeignRecentPoints,
    estoniaHistoryPoints: canonicalEstoniaHistoryPoints,
    elurikkusRecentRecords: canonicalElurikkusRecentRecords,
    estoniaHistoryClusters: canonicalEstoniaHistoryClusters,
    mapLayers: Object.keys(normalizedUpstream?.mapLayers || {}).length ? normalizedUpstream!.mapLayers : asRecord(raw.mapLayers),
    mapLayersDefault: canonicalMapLayersDefault,
    weather: canonicalWeather,
    historicalEvidence,
    rawLinks,
    topPredictedPoints,
    evidenceState: normalizedUpstream?.evidenceState || evidenceStateSnapshot.evidenceState,
    hasUsableRecentEstoniaEvidence: normalizedUpstream?.hasUsableRecentEstoniaEvidence ?? evidenceStateSnapshot.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: normalizedUpstream?.hasUsableEstoniaHistory ?? evidenceStateSnapshot.hasUsableEstoniaHistory,
    hasUsableForeignPressure: normalizedUpstream?.hasUsableForeignPressure ?? evidenceStateSnapshot.hasUsableForeignPressure,
    hasUsablePredictedTargets: normalizedUpstream?.hasUsablePredictedTargets ?? evidenceStateSnapshot.hasUsablePredictedTargets,
    hasOnlyWeather: normalizedUpstream?.hasOnlyWeather ?? evidenceStateSnapshot.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: normalizedUpstream?.hasOnlySourceAvailabilityWithoutUsableEvidence ?? evidenceStateSnapshot.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: normalizedUpstream?.activeEvidenceSources ?? evidenceStateSnapshot.activeEvidenceSources,
    availableSources: normalizedUpstream?.availableSources ?? evidenceStateSnapshot.availableSources,
    attemptedButUnavailable: normalizedUpstream?.attemptedButUnavailable ?? evidenceStateSnapshot.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: normalizedUpstream?.attemptedButReturnedNoUsableEvidence ?? evidenceStateSnapshot.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: normalizedUpstream?.effectiveRankingMode || evidenceStateSnapshot.effectiveRankingMode,
    summaryGuardrailApplied: normalizedUpstream?.summaryGuardrailApplied === true,
    summaryGuardrailReason: normalizedUpstream?.summaryGuardrailReason || '',
    ...(rerankedTopPredictedPoints.length ? { rerankedTopPredictedPoints } : {}),
    warnings: Array.from(new Set([...existingWarnings, ...sourceWarnings])),
    timeoutMsUsed: resolveTimeoutMs(),
    rawResearchPayload: {
      ...rawResearchPayload,
      sourceHealth,
      foreignEvidence,
      estoniaEvidence,
      historicalEvidence,
      rawLinks,
    },
  };
  const canonical = buildCanonicalPredictionRecord({
    base: assembled,
    alternate: normalizedUpstream ? normalizedUpstream as unknown as Record<string, unknown> : null,
    preferredSummary: normalizedUpstream ? {
      insightSummary: normalizedUpstream.insightSummary,
      confidenceNote: normalizedUpstream.confidenceNote,
      rankingNotes: normalizedUpstream.rankingNotes,
      warnings: normalizedUpstream.warnings,
    } : {
      insightSummary: stringOr(assembled.insightSummary),
      confidenceNote: stringOr(assembled.confidenceNote),
      rankingNotes: stringOr(assembled.rankingNotes),
      warnings: Array.isArray(assembled.warnings) ? assembled.warnings.map((item) => String(item || '')) : [],
    },
  });
  let canonicalResponse = attachNormalizationMarkers({
    ...assembled,
    speciesKey: canonical.speciesKey,
    speciesName: canonical.speciesName,
    scope: canonical.scope,
    generatedAt: canonical.generatedAt,
    analysisVersion: canonical.analysisVersion,
    species: canonical.species,
    sourceHealth: canonical.sourceHealth,
    countryScores: canonical.countryScores,
    estoniaEvidence: canonical.estoniaEvidence,
    evidenceSummary: canonical.evidenceSummary,
    foreignClusters: canonical.foreignClusters,
    predictedTargets: canonical.predictedTargets,
    topPredictedPoints: canonical.predictedTargets,
    topTarget: canonical.topTarget,
    foreignRecentPoints: canonical.foreignRecentPoints,
    estoniaHistoryPoints: canonical.estoniaHistoryPoints,
    elurikkusRecentRecords: canonical.elurikkusRecentRecords,
    estoniaHistoryClusters: canonical.estoniaHistoryClusters,
    mapLayers: canonical.mapLayers,
    mapLayersDefault: canonical.mapLayersDefault,
    globalMigrationEtas: canonical.globalMigrationEtas,
    weather: canonical.weather,
    evidenceState: canonical.evidenceState,
    hasUsableRecentEstoniaEvidence: canonical.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: canonical.hasUsableEstoniaHistory,
    hasUsableForeignPressure: canonical.hasUsableForeignPressure,
    hasUsablePredictedTargets: canonical.hasUsablePredictedTargets,
    hasOnlyWeather: canonical.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: canonical.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: canonical.activeEvidenceSources,
    availableSources: canonical.availableSources,
    attemptedButUnavailable: canonical.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: canonical.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: canonical.effectiveRankingMode,
    insightSummary: canonical.insightSummary,
    aiSummary: canonical.insightSummary,
    confidenceNote: canonical.confidenceNote,
    rankingNotes: canonical.rankingNotes,
    warnings: canonical.warnings,
    summaryGuardrailApplied: canonical.summaryGuardrailApplied,
    summaryGuardrailReason: canonical.summaryGuardrailReason,
    summaryOrigin: canonical.summaryOrigin,
    consistencyChecks: canonical.consistencyChecks,
    summaryRegeneratedFromStructuredEvidence: canonical.summaryRegeneratedFromStructuredEvidence,
    rawResearchPayload: {
      ...rawResearchPayload,
      sourceHealth: canonical.sourceHealth,
      evidenceSummary: canonical.evidenceSummary,
      estoniaEvidence: canonical.estoniaEvidence,
      foreignRecentPoints: canonical.foreignRecentPoints,
      foreignClusters: canonical.foreignClusters,
      predictedTargets: canonical.predictedTargets,
      topTarget: canonical.topTarget,
      insightSummary: canonical.insightSummary,
      aiSummary: canonical.insightSummary,
      confidenceNote: canonical.confidenceNote,
      rankingNotes: canonical.rankingNotes,
      warnings: canonical.warnings,
      consistencyChecks: canonical.consistencyChecks,
      summaryRegeneratedFromStructuredEvidence: canonical.summaryRegeneratedFromStructuredEvidence,
    },
  });
  canonicalResponse = finalizePredictionResponse(canonicalResponse, 'enrichPredictionResult');
  console.info(`${LOG_PREFIX} canonical_response`, {
    species: canonicalResponse.speciesName,
    insightSummary: canonicalResponse.insightSummary,
    aiSummary: canonicalResponse.aiSummary,
    recentCount7d: asRecord(canonicalResponse.estoniaEvidence).recentCount7d,
    recentCount30d: asRecord(canonicalResponse.estoniaEvidence).recentCount30d,
    foreignRecentPointsCount: Array.isArray(canonicalResponse.foreignRecentPoints) ? canonicalResponse.foreignRecentPoints.length : 0,
    foreignClustersCount: Array.isArray(canonicalResponse.foreignClusters) ? canonicalResponse.foreignClusters.length : 0,
    predictedTargetsCount: Array.isArray(canonicalResponse.predictedTargets) ? canonicalResponse.predictedTargets.length : 0,
    ebirdAvailable: asRecord(canonicalResponse.sourceHealth).ebirdAvailable,
    consistencyChecks: canonicalResponse.consistencyChecks,
    activeEvidenceUsed: asRecord(canonicalResponse.evidenceSummary).activeEvidenceUsed,
    summaryRegeneratedFromStructuredEvidence: canonicalResponse.summaryRegeneratedFromStructuredEvidence,
  });
  return canonicalResponse;
}

function buildForeignEvidence(rows: unknown[]): Record<string, unknown>[] {
  const grouped = new Map<string, {
    countryCode: string;
    countryName: string;
    recordCount7d: number;
    recordCount30d: number;
    nearestDistanceKm: number;
    latestDate: string;
    clusterMap: Map<string, {
      lat: number;
      lon: number;
      lastDate: string;
      count7d: number;
      source: string;
      label: string;
    }>;
  }>();

  for (const row of rows) {
    const item = asRecord(row);
    const countryCode = normalizeCountryCode(stringOr(item.countryCode, item.country));
    if (!countryCode) continue;
    const countryName = resolveCountryName(countryCode);
    const daysAgo = toNumber(item.daysAgo);
    const latestDate = normalizeDateString(stringOr(item.latestDate, item.date, item.observedAt, item.lastDate));
    const lat = toNumber(item.lat);
    const lon = toNumber(item.lon);
    const distance = toNumber(item.distanceToEstoniaKm);
    const source = stringOr(item.source, item.provider, item.dataset, 'eBird');
    const label = stringOr(item.label, item.hotspotName, item.name, item.countyOrParish, countryName + ' cluster');
    const recordCount = Math.max(1, Math.round(toNumber(item.recordCount)));
    let group = grouped.get(countryCode);
    if (!group) {
      group = {
        countryCode,
        countryName,
        recordCount7d: 0,
        recordCount30d: 0,
        nearestDistanceKm: distance > 0 ? distance : 0,
        latestDate,
        clusterMap: new Map(),
      };
      grouped.set(countryCode, group);
    }
    if (daysAgo <= 7) group.recordCount7d += recordCount;
    if (daysAgo <= 30) group.recordCount30d += recordCount;
    if (distance > 0 && (!group.nearestDistanceKm || distance < group.nearestDistanceKm)) {
      group.nearestDistanceKm = distance;
    }
    if (latestDate && (!group.latestDate || Date.parse(latestDate) > Date.parse(group.latestDate))) {
      group.latestDate = latestDate;
    }
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
      const bucketKey = `${roundCoord(lat)}:${roundCoord(lon)}`;
      const existing = group.clusterMap.get(bucketKey);
      if (existing) {
        existing.count7d += daysAgo <= 7 ? recordCount : 0;
        if (latestDate && (!existing.lastDate || Date.parse(latestDate) > Date.parse(existing.lastDate))) {
          existing.lastDate = latestDate;
        }
      } else {
        group.clusterMap.set(bucketKey, {
          lat: roundCoord(lat),
          lon: roundCoord(lon),
          lastDate: latestDate,
          count7d: daysAgo <= 7 ? recordCount : 0,
          source,
          label,
        });
      }
    }
  }

  return Array.from(grouped.values())
    .map((group) => {
      const topClusters = Array.from(group.clusterMap.values())
        .sort((left, right) => right.count7d - left.count7d || Date.parse(right.lastDate || '') - Date.parse(left.lastDate || ''))
        .slice(0, 3);
      return {
        countryCode: group.countryCode,
        countryName: group.countryName,
        recordCount7d: group.recordCount7d,
        recordCount30d: group.recordCount30d,
        nearestDistanceKm: group.nearestDistanceKm,
        latestDate: group.latestDate,
        clusterCount: group.clusterMap.size,
        topClusters,
      };
    })
    .sort((left, right) => Number(right.recordCount7d) - Number(left.recordCount7d));
}

function buildEstoniaEvidence(source: Record<string, unknown>): Record<string, unknown> {
  return {
    recentCount7d: Math.max(0, Math.round(toNumber(source.recentCount7d))),
    recentCount30d: Math.max(0, Math.round(toNumber(source.recentCount30d))),
    latestEstoniaDate: normalizeDateString(stringOr(source.latestEstoniaDate, source.latestDate)),
    latestEstoniaLat: hasNumber(source.latestEstoniaLat) ? toNumber(source.latestEstoniaLat) : null,
    latestEstoniaLon: hasNumber(source.latestEstoniaLon) ? toNumber(source.latestEstoniaLon) : null,
    alreadyPresent: source.alreadyPresent === true,
    alreadyPassed: source.alreadyPassed === true,
  };
}

function buildHistoricalEvidence(source: Record<string, unknown>): Record<string, unknown> {
  const topHistoricalHotspots = (Array.isArray(source.historicalHotspots) ? source.historicalHotspots : [])
    .slice(0, 5)
    .map((item) => asRecord(item));
  const habitatHints = (Array.isArray(source.habitatHints) ? source.habitatHints : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return {
    springWindow: stringOr(source.arrivalWindow, source.springWindow),
    topHistoricalHotspots,
    habitatHints,
  };
}

function buildSourceHealth(
  raw: Record<string, unknown>,
  normalizedSources: Record<string, unknown>,
  foreignEvidence: Record<string, unknown>[],
  estoniaEvidence: Record<string, unknown>,
  historicalEvidence: Record<string, unknown>,
): Record<string, unknown> {
  const sourceWarnings: string[] = [];
  const foreignSightings = Array.isArray(normalizedSources.foreignSightings) ? normalizedSources.foreignSightings : [];
  const rawText = JSON.stringify(raw).toLowerCase();
  const gbifFallbackUsed = rawText.includes('gbif');
  const elurikkusAvailable = Boolean(
    Object.keys(asRecord(normalizedSources.elurikkusHistory)).length
    || toNumber(estoniaEvidence.recentCount7d) > 0
    || toNumber(estoniaEvidence.recentCount30d) > 0,
  );
  const ebirdAvailable = foreignSightings.length > 0 || foreignEvidence.length > 0;
  const gbifAvailable = gbifFallbackUsed || (Array.isArray(historicalEvidence.topHistoricalHotspots) && historicalEvidence.topHistoricalHotspots.length > 0);
  const primarySourceUsed = elurikkusAvailable ? 'Elurikkus' : (ebirdAvailable ? 'eBird' : (gbifFallbackUsed ? 'GBIF fallback' : 'Partial upstream payload'));
  if (!elurikkusAvailable) sourceWarnings.push('Elurikkus evidence is missing or incomplete for this run.');
  if (!ebirdAvailable) sourceWarnings.push('Foreign-country evidence is sparse or unavailable.');
  if (!gbifAvailable) sourceWarnings.push('GBIF Estonia history is missing or incomplete for this run.');
  if (gbifFallbackUsed) sourceWarnings.push('GBIF fallback context was used; treat foreign evidence with extra caution.');
  if (!Array.isArray(historicalEvidence.topHistoricalHotspots) || !historicalEvidence.topHistoricalHotspots.length) {
    sourceWarnings.push('Historical hotspot evidence is limited.');
  }
  if (!foreignEvidence.length) {
    sourceWarnings.push('No foreign-country clusters were available to display.');
  }
  return {
    primarySourceUsed,
    sourceWarnings: Array.from(new Set(sourceWarnings)),
    elurikkusAvailable,
    ebirdAvailable,
    gbifAvailable,
    gbifFallbackUsed,
  };
}

function buildRawLinks(speciesName: string, foreignEvidence: Record<string, unknown>[]): Record<string, unknown> {
  const countrySourceUrls: Record<string, string> = {};
  for (const group of foreignEvidence) {
    const code = String(group.countryCode || '').trim();
    if (!code) continue;
    countrySourceUrls[code] = `https://ebird.org/explore?q=${encodeURIComponent(speciesName)}&country=${encodeURIComponent(code.toUpperCase())}`;
  }
  return {
    elurikkusSearchUrl: speciesName ? `https://elurikkus.ee/app/occurrences/search?text=${encodeURIComponent(speciesName)}` : '',
    ...(Object.keys(countrySourceUrls).length ? { countrySourceUrls } : {}),
  };
}

function enrichPredictedTargets(
  points: unknown[],
  foreignEvidence: Record<string, unknown>[],
  estoniaEvidence: Record<string, unknown>,
  historicalEvidence: Record<string, unknown>,
): Record<string, unknown>[] {
  const supportingCountries = foreignEvidence
    .filter((group) => toNumber(group.recordCount7d) > 0)
    .map((group) => String(group.countryName || group.countryCode || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const nearestRelevantClusterKm = foreignEvidence.length
    ? Math.min(...foreignEvidence.map((group) => toNumber(group.nearestDistanceKm)).filter((value) => Number.isFinite(value) && value > 0))
    : null;
  const latestRelevantForeignDate = foreignEvidence
    .map((group) => String(group.latestDate || '').trim())
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || '';
  const topHistoricalHotspot = Array.isArray(historicalEvidence.topHistoricalHotspots)
    ? asRecord(historicalEvidence.topHistoricalHotspots[0])
    : {};
  const historicalMatch = stringOr(topHistoricalHotspot.name, historicalEvidence.springWindow);
  const estoniaPresenceSignal = estoniaEvidence.alreadyPresent === true
    ? 'already_present'
    : (toNumber(estoniaEvidence.recentCount7d) > 0 ? 'recent_estonia_records' : (estoniaEvidence.alreadyPassed === true ? 'already_passed' : 'no_recent_estonia_signal'));

  return points.map((point) => {
    const item = asRecord(point);
    return {
      ...item,
      supportingCountries,
      ...(nearestRelevantClusterKm != null ? { nearestRelevantClusterKm } : {}),
      ...(latestRelevantForeignDate ? { latestRelevantForeignDate } : {}),
      ...(historicalMatch ? { historicalMatch } : {}),
      estoniaPresenceSignal,
    };
  });
}

function buildSourceHealthMapFirst(input: {
  estoniaHistoryPoints: Record<string, unknown>[];
  estoniaHistoryClusters: Array<{ source: string }>;
  foreignRecentPoints: Record<string, unknown>[];
  foreignClusters: Record<string, unknown>[];
  webhookConfigured: boolean;
  estoniaHistorySourceUsed: string;
}): Record<string, unknown> {
  const warnings: string[] = [];
  if (!input.estoniaHistoryPoints.length) warnings.push('Estonia history returned no coordinate-backed points.');
  if (!input.foreignRecentPoints.length) warnings.push('Foreign eBird evidence is sparse or unavailable.');
  if (!input.foreignClusters.length) warnings.push('No foreign-country clusters were available to display.');
  if (!input.webhookConfigured) warnings.push('Secondary AI summary is unavailable because no webhook is configured.');
  if (!input.estoniaHistoryClusters.length) warnings.push('No Estonia history clusters were available, so predicted targets remain empty.');
  const primarySources = [input.estoniaHistorySourceUsed === 'GBIF'
    ? 'GBIF Estonia'
    : (input.estoniaHistorySourceUsed === 'mixed' ? 'eElurikkus + GBIF Estonia' : 'eElurikkus Estonia')];
  if (input.foreignRecentPoints.length) primarySources.push('eBird foreign');
  if (input.foreignClusters.length) primarySources.push('Open-Meteo weather');
  return {
    primarySourceUsed: primarySources.join(' + '),
    sourceWarnings: warnings,
    elurikkusAvailable: input.estoniaHistorySourceUsed === 'EELURIKKUS' || input.estoniaHistorySourceUsed === 'mixed' || input.estoniaHistoryClusters.some((cluster) => String(cluster.source || '') === 'mixed'),
    ebirdAvailable: input.foreignRecentPoints.length > 0,
    gbifAvailable: input.estoniaHistorySourceUsed === 'GBIF' || input.estoniaHistorySourceUsed === 'mixed' || input.estoniaHistoryPoints.length > 0,
    gbifFallbackUsed: input.estoniaHistorySourceUsed === 'GBIF',
  };
}

function clusterEstoniaHistory(points: Record<string, unknown>[]): Array<{
  id: string;
  lat: number;
  lon: number;
  count: number;
  recentCount: number;
  locality: string;
  municipality: string;
  displayName: string;
  displayNameSource: string;
  representativeLat: number;
  representativeLon: number;
  representativePointMethod: string;
  representativeLocality?: string;
  latestSupportingLocality?: string;
  nearestNamedCoastalLocality?: string;
  supportingPoints: Record<string, unknown>[];
  localityNames: string[];
  localityAliases: string[];
  habitatCue: string;
  habitatType: string;
  habitatScore: number;
  coastalDistanceKm: number;
  clusterTightnessKm: number;
  distanceFromClusterKm: number;
  newestEventDate: string;
  oldestEventDate: string;
  source: 'GBIF' | 'EELURIKKUS' | 'mixed';
  sourceBreakdown: Record<string, number>;
}> {
  const grouped = new Map<string, {
    id: string;
    points: Record<string, unknown>[];
    sourceBreakdown: Record<string, number>;
  }>();
  for (const point of points) {
    const lat = toNumber(point.lat);
    const lon = toNumber(point.lon);
    const bucket = `${roundCoord(lat, 1)}:${roundCoord(lon, 1)}`;
    if (!grouped.has(bucket)) {
      grouped.set(bucket, {
        id: `ee-cluster-${grouped.size + 1}`,
        points: [],
        sourceBreakdown: {},
      });
    }
    const group = grouped.get(bucket)!;
    group.points.push(point);
    const source = stringOr(point.source, 'GBIF');
    group.sourceBreakdown[source] = Number(group.sourceBreakdown[source] || 0) + 1;
  }
  return Array.from(grouped.values()).map((cluster) => {
    const pointsInCluster = cluster.points.filter((point) => Number.isFinite(toNumber(point.lat)) && Number.isFinite(toNumber(point.lon)));
    const centroid = computeCentroid(pointsInCluster);
    const localityNames = collectCommonLocalityNames(pointsInCluster);
    const localityAliases = collectLocalityAliases(pointsInCluster);
    const municipality = mostCommonValue(pointsInCluster.map((point) => stringOr(point.municipality)).filter(Boolean)) || 'Estonia';
    const representative = selectRepresentativePoint(pointsInCluster, centroid, localityNames, localityAliases);
    const latestSupportingLocality = getLatestSupportingLocality(pointsInCluster);
    const newestEventDate = pointsInCluster.map((point) => stringOr(point.eventDate)).filter(Boolean).sort().slice(-1)[0] || '';
    const oldestEventDate = pointsInCluster.map((point) => stringOr(point.eventDate)).filter(Boolean).sort()[0] || '';
    const habitat = inferHabitatFromCluster(pointsInCluster, centroid, localityNames);
    const nearestNamedCoastalLocality = getNearestNamedCoastalLocality(pointsInCluster, representative.lat, representative.lon);
    const displayNameInfo = buildTargetDisplayName(
      localityNames,
      latestSupportingLocality,
      nearestNamedCoastalLocality,
      representative.point,
      habitat.type,
      municipality,
    );
    const clusterTightnessKm = computeClusterTightnessKm(pointsInCluster, representative.lat, representative.lon);
    return {
      id: cluster.id,
      lat: centroid.lat,
      lon: centroid.lon,
      count: pointsInCluster.length,
      recentCount: pointsInCluster.filter((point) => (toNumber(point.daysAgo) || 9999) <= 30).length,
      locality: displayNameInfo.displayName || municipality || 'Estonia hotspot',
      municipality,
      displayName: displayNameInfo.displayName,
      displayNameSource: displayNameInfo.source,
      representativeLat: representative.lat,
      representativeLon: representative.lon,
      representativePointMethod: representative.method,
      representativeLocality: representative.locality,
      latestSupportingLocality,
      nearestNamedCoastalLocality,
      supportingPoints: pointsInCluster,
      localityNames,
      localityAliases,
      habitatCue: habitat.cue,
      habitatType: habitat.type,
      habitatScore: habitat.score,
      coastalDistanceKm: habitat.coastalDistanceKm,
      clusterTightnessKm,
      distanceFromClusterKm: distanceToEstonia(representative.lat, representative.lon),
      newestEventDate,
      oldestEventDate,
      source: resolveClusterSource(cluster.sourceBreakdown),
      sourceBreakdown: cluster.sourceBreakdown,
    };
  }).sort((left, right) =>
    right.count - left.count
    || right.recentCount - left.recentCount
    || Date.parse(right.newestEventDate || '') - Date.parse(left.newestEventDate || '')
  );
}

function buildTargetReason(input: {
  speciesName: string;
  hotspot: {
    count: number;
    recentCount: number;
    displayName?: string;
    displayNameSource?: string;
    locality: string;
    municipality: string;
    newestEventDate: string;
    habitatCue?: string;
    representativePointMethod?: string;
    representativeLocality?: string;
    latestSupportingLocality?: string;
    nearestNamedCoastalLocality?: string;
  };
  foreignCluster?: Record<string, unknown>;
  weather: Record<string, unknown>;
  ecology: { mode: string };
  ecologyScore: { habitatCue: string };
  hasForeignPressure: boolean;
  hasWeatherSupport: boolean;
}): string {
  const { speciesName, hotspot, foreignCluster, weather, ecology, ecologyScore, hasForeignPressure, hasWeatherSupport } = input;
  const latestHistory = hotspot.newestEventDate ? hotspot.newestEventDate.slice(0, 10) : 'unknown date';
  const habitatText = stringOr(hotspot.habitatCue, ecologyScore.habitatCue, ecology.mode);
  const localityText = stringOr(
    hotspot.displayName,
    hotspot.latestSupportingLocality,
    hotspot.nearestNamedCoastalLocality,
    hotspot.locality,
    hotspot.municipality,
    'a known hotspot',
  );
  const representativeText = describeRepresentativeMethod(stringOr(hotspot.representativePointMethod), stringOr(hotspot.representativeLocality, localityText));
  const historyText = `Estonia evidence centers on ${localityText} for ${speciesName} (${hotspot.count} records, ${hotspot.recentCount} recent; latest ${latestHistory}). ${representativeText}`;
  if (!hasForeignPressure) {
    return `${historyText} Coastal/open-water relevance: ${habitatText}. Ranking is based mainly on Estonia evidence because no usable foreign support was available.`;
  }
  const countries = foreignCluster && Array.isArray(foreignCluster.countries) ? foreignCluster.countries.join(', ') : 'foreign eBird';
  const hotspotRecord = hotspot as Record<string, unknown>;
  const targetLat = Number.isFinite(Number(hotspotRecord.representativeLat)) ? toNumber(hotspotRecord.representativeLat) : toNumber(hotspotRecord.lat);
  const targetLon = Number.isFinite(Number(hotspotRecord.representativeLon)) ? toNumber(hotspotRecord.representativeLon) : toNumber(hotspotRecord.lon);
  const foreignDistanceKm = foreignCluster ? haversineKm(toNumber(foreignCluster.lat), toNumber(foreignCluster.lon), targetLat, targetLon) : null;
  const weatherText = hasWeatherSupport
    ? ` Weather support contributed to ranking (${bearingToCompass(toNumber(weather.windDirectionDeg))} ${Math.round(toNumber(weather.windSpeedKph))} km/h, ${stringOr(weather.fetchedAt, 'timestamp unavailable')}).`
    : '';
  return `${historyText} Coastal/open-water relevance: ${habitatText}. Recent foreign eBird support from ${countries}${foreignDistanceKm != null ? ` is about ${Math.round(foreignDistanceKm)} km from this representative point` : ''}.${weatherText}`;
}

function buildCountryScores(foreignEvidence: Record<string, unknown>[]): Record<string, number> {
  return {
    latvia: clampInt(toNumber(foreignEvidence.find((entry) => entry.countryCode === 'lv')?.recordCount7d) * 8, 0, 100),
    lithuania: clampInt(toNumber(foreignEvidence.find((entry) => entry.countryCode === 'lt')?.recordCount7d) * 8, 0, 100),
    belarus: clampInt(toNumber(foreignEvidence.find((entry) => entry.countryCode === 'by')?.recordCount7d) * 8, 0, 100),
    poland: clampInt(toNumber(foreignEvidence.find((entry) => entry.countryCode === 'pl')?.recordCount7d) * 8, 0, 100),
    russia: clampInt(toNumber(foreignEvidence.find((entry) => entry.countryCode === 'ru')?.recordCount7d) * 8, 0, 100),
    finlandContextOnly: clampInt(toNumber(foreignEvidence.find((entry) => entry.countryCode === 'fi')?.recordCount7d) * 8, 0, 100),
  };
}

function buildEvidenceSummary(input: {
  weather: Record<string, unknown>;
  sourceHealth: Record<string, unknown>;
  evidenceStateSnapshot: EvidenceStateSnapshot;
}): Record<string, unknown> {
  const weatherAvailable = input.weather.weatherAvailable === true;
  const weatherPartial = input.weather.weatherPartial === true || !stringOr(input.weather.fetchedAt);
  const activeEvidenceUsed = input.evidenceStateSnapshot.activeEvidenceSources.slice();
  const availableSources = input.evidenceStateSnapshot.availableSources.slice();
  const attemptedButUnavailable = input.evidenceStateSnapshot.attemptedButUnavailable.slice();
  const attemptedButReturnedNoUsableEvidence = input.evidenceStateSnapshot.attemptedButReturnedNoUsableEvidence.slice();
  const effectiveRankingMode = input.evidenceStateSnapshot.effectiveRankingMode;
  const summaryParts = [
    `Evidence state: ${effectiveRankingMode}.`,
    `Active evidence used: ${activeEvidenceUsed.length ? activeEvidenceUsed.join(', ') : 'None'}.`,
    attemptedButUnavailable.length ? `Attempted but unavailable: ${attemptedButUnavailable.join(', ')}.` : '',
    attemptedButReturnedNoUsableEvidence.length ? `Attempted but no usable evidence: ${attemptedButReturnedNoUsableEvidence.join(', ')}.` : '',
  ].filter(Boolean);
  return {
    dataSourcesUsed: availableSources,
    availableSources,
    sourcesResponded: availableSources,
    activeEvidenceUsed,
    attemptedButNotUsed: [...attemptedButUnavailable, ...attemptedButReturnedNoUsableEvidence],
    attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence,
    totalForeignRecentPoints: input.evidenceStateSnapshot.totalForeignRecentPoints,
    primaryCountries: input.evidenceStateSnapshot.primaryCountries,
    foreignEbirdAvailable: input.sourceHealth.ebirdAvailable === true,
    weatherAvailable,
    weatherPartial,
    wasWeatherUsedInRanking: input.evidenceStateSnapshot.evidenceState === 'weather_only_insufficient' ? false : activeEvidenceUsed.includes('Open-Meteo weather') && activeEvidenceUsed.length > 1,
    rankingMode: effectiveRankingMode,
    effectiveRankingMode,
    summaryText: summaryParts.join(' '),
  };
}

function computeEvidenceStrengthScore(input: {
  estoniaEvidence: Record<string, unknown>;
  foreignRecentPoints: unknown[];
  foreignClusters: unknown[];
  predictedTargets: unknown[];
  estoniaHistoryPoints: unknown[];
  estoniaHistoryClusters: unknown[];
  elurikkusRecentRecords?: unknown[];
}): number {
  return (
    Math.max(0, toNumber(input.estoniaEvidence.recentCount7d)) * 100
    + Math.max(0, toNumber(input.estoniaEvidence.recentCount30d)) * 25
    + input.predictedTargets.length * 50
    + input.foreignClusters.length * 20
    + input.foreignRecentPoints.length * 5
    + input.estoniaHistoryClusters.length * 10
    + input.estoniaHistoryPoints.length * 2
    + (input.elurikkusRecentRecords?.length || 0) * 3
  );
}

function pickCanonicalStructuredSource(
  primary: Record<string, unknown>,
  secondary?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!secondary) return primary;
  const primaryScore = computeEvidenceStrengthScore({
    estoniaEvidence: asRecord(primary.estoniaEvidence),
    foreignRecentPoints: Array.isArray(primary.foreignRecentPoints) ? primary.foreignRecentPoints : [],
    foreignClusters: Array.isArray(primary.foreignClusters) ? primary.foreignClusters : [],
    predictedTargets: Array.isArray(primary.predictedTargets) ? primary.predictedTargets : [],
    estoniaHistoryPoints: Array.isArray(primary.estoniaHistoryPoints) ? primary.estoniaHistoryPoints : [],
    estoniaHistoryClusters: Array.isArray(primary.estoniaHistoryClusters) ? primary.estoniaHistoryClusters : [],
    elurikkusRecentRecords: Array.isArray(primary.elurikkusRecentRecords) ? primary.elurikkusRecentRecords : [],
  });
  const secondaryScore = computeEvidenceStrengthScore({
    estoniaEvidence: asRecord(secondary.estoniaEvidence),
    foreignRecentPoints: Array.isArray(secondary.foreignRecentPoints) ? secondary.foreignRecentPoints : [],
    foreignClusters: Array.isArray(secondary.foreignClusters) ? secondary.foreignClusters : [],
    predictedTargets: Array.isArray(secondary.predictedTargets) ? secondary.predictedTargets : [],
    estoniaHistoryPoints: Array.isArray(secondary.estoniaHistoryPoints) ? secondary.estoniaHistoryPoints : [],
    estoniaHistoryClusters: Array.isArray(secondary.estoniaHistoryClusters) ? secondary.estoniaHistoryClusters : [],
    elurikkusRecentRecords: Array.isArray(secondary.elurikkusRecentRecords) ? secondary.elurikkusRecentRecords : [],
  });
  return secondaryScore > primaryScore ? secondary : primary;
}

function buildCanonicalSummaryFromEvidence(input: {
  speciesName: string;
  estoniaEvidence: Record<string, unknown>;
  foreignEvidence: Record<string, unknown>[];
  foreignRecentPoints: unknown[];
  foreignClusters: unknown[];
  predictedTargets: unknown[];
  activeEvidenceSources: string[];
  evidenceStateSnapshot: EvidenceStateSnapshot;
}): Pick<CanonicalPredictionRecord, 'insightSummary' | 'confidenceNote' | 'rankingNotes' | 'warnings'> {
  const recentCount7d = Math.max(0, Math.round(toNumber(input.estoniaEvidence.recentCount7d)));
  const recentCount30d = Math.max(0, Math.round(toNumber(input.estoniaEvidence.recentCount30d)));
  const freshestLocalities = Array.isArray(input.estoniaEvidence.freshestLocalities) ? input.estoniaEvidence.freshestLocalities.map((item) => stringOr(item)).filter(Boolean) : [];
  const latestLocality = stringOr(input.estoniaEvidence.latestEstoniaLocality, freshestLocalities[0]);
  const targetNames = (input.predictedTargets || []).map((item) => stringOr(asRecord(item).displayName, asRecord(item).name)).filter(Boolean);
  const countryNamesFromPoints = input.foreignRecentPoints
    .map((item) => stringOr(asRecord(item).countryName, asRecord(item).country, asRecord(item).countryCode))
    .filter(Boolean);
  const countryNamesFromClusters = input.foreignClusters
    .flatMap((item) => {
      const cluster = asRecord(item);
      const countries = Array.isArray(cluster.countries) ? cluster.countries.map((entry) => stringOr(entry)).filter(Boolean) : [];
      const countryCodes = Array.isArray(cluster.countryCodes) ? cluster.countryCodes.map((entry) => stringOr(entry)).filter(Boolean) : [];
      return [...countries, ...countryCodes];
    });
  const countryNamesFromEvidence = input.foreignRecentPoints.length || input.foreignClusters.length
    ? input.foreignEvidence.map((entry) => stringOr(entry.countryName, entry.countryCode)).filter(Boolean)
    : [];
  const countryNames = Array.from(new Set([...countryNamesFromPoints, ...countryNamesFromClusters, ...countryNamesFromEvidence]));
  const warnings = new Set<string>();
  if (!input.foreignRecentPoints.length && !input.foreignClusters.length) warnings.add('No foreign pressure detected in canonical evidence.');
  if (!input.predictedTargets.length) warnings.add('No predicted targets returned from canonical evidence.');
  if (recentCount7d > 0) {
    const localityPart = latestLocality ? ` Latest locality: ${latestLocality}.` : '';
    const targetPart = targetNames.length ? ` Top targets: ${targetNames.slice(0, 3).join(', ')}.` : '';
    const foreignPart = countryNames.length ? ` Foreign support present from ${countryNames.slice(0, 4).join(', ')}.` : '';
    return {
      insightSummary: `ALREADY PRESENT — ${recentCount7d} records in 7 days and ${recentCount30d} records in 30 days for ${input.speciesName}.${localityPart}${foreignPart}${targetPart}`.trim(),
      confidenceNote: `Confidence is anchored to canonical Estonia evidence because recent structured records are present (${recentCount7d}/7d, ${recentCount30d}/30d).`,
      rankingNotes: `Ranking uses canonical evidence only: ${input.activeEvidenceSources.length ? input.activeEvidenceSources.join(', ') : 'no active evidence listed'}.`,
      warnings: Array.from(warnings),
    };
  }
  if (input.evidenceStateSnapshot.hasUsableForeignPressure || input.evidenceStateSnapshot.hasUsableEstoniaHistory) {
    const supportParts = [
      input.evidenceStateSnapshot.hasUsableEstoniaHistory ? 'Estonia history is present' : '',
      input.evidenceStateSnapshot.hasUsableForeignPressure && countryNames.length ? `foreign pressure is present from ${countryNames.slice(0, 4).join(', ')}` : (input.evidenceStateSnapshot.hasUsableForeignPressure ? 'foreign pressure is present' : ''),
      targetNames.length ? `top targets: ${targetNames.slice(0, 3).join(', ')}` : '',
    ].filter(Boolean);
    return {
      insightSummary: `${input.speciesName} is supported by canonical structured evidence: ${supportParts.join('; ')}.`.trim(),
      confidenceNote: 'Confidence is moderate because the response is grounded in canonical structured evidence, but recent Estonia records are limited.',
      rankingNotes: `Ranking is derived only from canonical structured evidence: ${input.activeEvidenceSources.length ? input.activeEvidenceSources.join(', ') : 'no active evidence listed'}.`,
      warnings: Array.from(warnings),
    };
  }
  return {
    insightSummary: INSUFFICIENT_EVIDENCE_FALLBACK.insightSummary,
    confidenceNote: INSUFFICIENT_EVIDENCE_FALLBACK.confidenceNote,
    rankingNotes: INSUFFICIENT_EVIDENCE_FALLBACK.rankingNotes,
    warnings: Array.from(new Set([...INSUFFICIENT_EVIDENCE_FALLBACK.warnings, ...warnings])),
  };
}

function canonicalSummaryMatchesEvidence(input: {
  summary: string;
  estoniaEvidence: Record<string, unknown>;
  foreignRecentPoints: unknown[];
  foreignClusters: unknown[];
  predictedTargets: unknown[];
  elurikkusRecentRecords: unknown[];
}): { ok: boolean; reasons: string[] } {
  const summary = stringOr(input.summary);
  const reasons: string[] = [];
  const recentCount7d = Math.max(0, Math.round(toNumber(input.estoniaEvidence.recentCount7d)));
  const recentCount30d = Math.max(0, Math.round(toNumber(input.estoniaEvidence.recentCount30d)));
  const foreignMentionPattern = /foreign pressure|poland|sweden|finland|latvia|lithuania|belarus|russia|\bpl\b|\bse\b|\bfi\b/i;
  const namedLocalityPattern = /p(?:õ|o)õsaspea|ristna|s(?:ä|a)äre/i;
  const hotspotPattern = /hotspot|target|ranking|p(?:õ|o)õsaspea|ristna|s(?:ä|a)äre/i;
  const countMatch = summary.match(/(\d+)\s+records?\s+in\s+7\s+days/i);
  if ((/already present/i.test(summary) || countMatch) && recentCount7d <= 0) reasons.push('summary_claims_recent_estonia_but_recentCount7d_is_zero');
  if (countMatch && Number(countMatch[1]) !== recentCount7d) reasons.push('summary_recentCount7d_does_not_match_structured_recentCount7d');
  if (foreignMentionPattern.test(summary) && !input.foreignRecentPoints.length && !input.foreignClusters.length) {
    reasons.push('summary_mentions_foreign_pressure_without_structured_foreign_evidence');
  }
  if (/põõsaspea|ristna|sääre/i.test(summary)) {
    const localityPool = [
      ...((input.predictedTargets || []).map((item) => stringOr(asRecord(item).displayName, asRecord(item).name))),
      ...((input.elurikkusRecentRecords || []).map((item) => stringOr(asRecord(item).locality, asRecord(item).locName))),
      stringOr(input.estoniaEvidence.latestEstoniaLocality),
    ].filter(Boolean).join(' ').toLowerCase();
    if ((/põõsaspea/i.test(summary) && !/põõsaspea/i.test(localityPool))
      || (/ristna/i.test(summary) && !/ristna/i.test(localityPool))
      || (/sääre/i.test(summary) && !/sääre/i.test(localityPool))) {
      reasons.push('summary_mentions_specific_estonia_localities_without_structured_match');
    }
  }
  if ((/hotspot|target|põõsaspea|ristna|sääre/i.test(summary)) && !input.predictedTargets.length) {
    reasons.push('summary_mentions_hotspot_structure_without_predicted_targets');
  }
  if (namedLocalityPattern.test(summary)) {
    const structuredLocalityPool = [
      ...((input.predictedTargets || []).map((item) => stringOr(asRecord(item).displayName, asRecord(item).name))),
      ...((input.elurikkusRecentRecords || []).map((item) => stringOr(asRecord(item).locality, asRecord(item).locName))),
      ...(Array.isArray(input.estoniaEvidence.freshestLocalities) ? input.estoniaEvidence.freshestLocalities.map((item) => stringOr(item)) : []),
      stringOr(input.estoniaEvidence.latestEstoniaLocality),
    ].filter(Boolean).join(' ').toLowerCase();
    if ((/p(?:\u00F5|o)\u00F5saspea/i.test(summary) && !/p(?:\u00F5|o)\u00F5saspea/i.test(structuredLocalityPool))
      || (/ristna/i.test(summary) && !/ristna/i.test(structuredLocalityPool))
      || (/s(?:\u00E4|a)\u00E4re/i.test(summary) && !/s(?:\u00E4|a)\u00E4re/i.test(structuredLocalityPool))) {
      reasons.push('summary_mentions_specific_estonia_localities_without_structured_match');
    }
  }
  if (hotspotPattern.test(summary) && !input.predictedTargets.length && !reasons.includes('summary_mentions_hotspot_structure_without_predicted_targets')) {
    reasons.push('summary_mentions_hotspot_structure_without_predicted_targets');
  }
  if (/30\s+days/i.test(summary) && recentCount30d <= 0) reasons.push('summary_claims_recent_30d_presence_but_recentCount30d_is_zero');
  return { ok: reasons.length === 0, reasons };
}

function buildFinalConsistencyChecksFromCanonical(input: {
  foreignRecentPoints: unknown[];
  foreignClusters: unknown[];
  predictedTargets: unknown[];
  weather: Record<string, unknown>;
  insightSummary: string;
}): {
  routeLooksPlausible: boolean;
  timingLooksPlausible: boolean;
  weatherLooksSupportive: boolean;
  foreignPressureMatchesNarrative: boolean;
} {
  const summary = stringOr(input.insightSummary);
  const mentionsForeign = /foreign pressure is active|pressure is building|poland|sweden|finland|latvia|lithuania|belarus|russia|pl\b|se\b|fi\b/i.test(summary);
  return {
    routeLooksPlausible: input.predictedTargets.length > 0,
    timingLooksPlausible: input.foreignRecentPoints.some((point) => toNumber(asRecord(point).daysAgo) <= 7) || !mentionsForeign,
    weatherLooksSupportive: weatherLooksAvailable(input.weather) && computeWindSupport(input.weather) >= 45,
    foreignPressureMatchesNarrative: mentionsForeign
      ? (input.foreignRecentPoints.length > 0 || input.foreignClusters.length > 0)
      : true,
  };
}

function buildNeutralStructuredEvidenceSummary(speciesName: string): Pick<CanonicalPredictionRecord, 'insightSummary' | 'confidenceNote' | 'rankingNotes' | 'warnings'> {
  return {
    insightSummary: `Structured evidence is currently unavailable or incomplete for this species, so recent Estonia presence and foreign pressure could not be confirmed from the final response payload.`,
    confidenceNote: `Confidence is limited because the final structured evidence for ${speciesName || 'this species'} is incomplete or contradictory.`,
    rankingNotes: 'Hotspot ranking was not retained because the final structured evidence did not support a consistent ranked output.',
    warnings: [
      'Summary regenerated from final structured evidence.',
      'Final response payload could not confirm recent Estonia presence or foreign pressure.',
    ],
  };
}

function logPredictionSummaryState(label: string, branch: string, response: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  console.info(`${LOG_PREFIX} ${label}`, {
    branch,
    insightSummary: stringOr(response.insightSummary),
    aiSummary: stringOr(response.aiSummary),
    rawResearchPayloadAiSummary: stringOr(asRecord(response.rawResearchPayload).aiSummary),
    recentCount7d: toNumber(asRecord(response.estoniaEvidence).recentCount7d),
    foreignRecentPointsCount: Array.isArray(response.foreignRecentPoints) ? response.foreignRecentPoints.length : 0,
    foreignClustersCount: Array.isArray(response.foreignClusters) ? response.foreignClusters.length : 0,
    predictedTargetsCount: Array.isArray(response.predictedTargets) ? response.predictedTargets.length : 0,
    ...extra,
  });
}

function sanitizeSummaryAgainstEvidence(response: Record<string, unknown>): Record<string, unknown> {
  const recent7d = response?.estoniaEvidence && typeof response.estoniaEvidence === 'object'
    ? (asRecord(response.estoniaEvidence).recentCount7d ?? 0)
    : 0;
  const foreignPointCount = Array.isArray(response?.foreignRecentPoints) ? response.foreignRecentPoints.length : 0;
  const foreignClusterCount = Array.isArray(response?.foreignClusters) ? response.foreignClusters.length : 0;
  const predictedCount = Array.isArray(response?.predictedTargets) ? response.predictedTargets.length : 0;
  const ebirdAvailable = asRecord(response?.sourceHealth).ebirdAvailable === true;
  const summary =
    stringOr(response?.insightSummary)
    || stringOr(response?.aiSummary)
    || stringOr(asRecord(response?.rawResearchPayload).aiSummary)
    || '';

  const invalidAlreadyPresent =
    /ALREADY PRESENT/i.test(summary) && toNumber(recent7d) <= 0;

  const invalidForeignNarrative =
    /(PL|SE|FI|Poland|Sweden|Finland|Mikoszewo|Kalmar|Helsinki|Zatoka Pomorska|Hel|Dziwnów)/i.test(summary) &&
    (!ebirdAvailable || (foreignPointCount === 0 && foreignClusterCount === 0));

  const invalidHotspotNarrative =
    /(S(?:\u00E4|a)\u00E4re|Ristna|P(?:\u00F5|o)\u00F5saspea|Saaremaa|Hiiu|L(?:\u00E4|a)\u00E4ne counties)/i.test(summary) &&
    toNumber(recent7d) === 0 &&
    predictedCount === 0;

  if (invalidAlreadyPresent || invalidForeignNarrative || invalidHotspotNarrative) {
    response.insightSummary =
      'Structured evidence is currently incomplete in the final payload, so recent Estonia presence, foreign pressure, and hotspot ranking cannot be confirmed from this response.';
    response.summaryOrigin = 'neutral_sanitizer_fallback';
    response.summaryRegeneratedFromStructuredEvidence = true;
  }

  return response;
}

function enforceCanonicalSummaryConsistency(
  canonical: CanonicalPredictionRecord,
): CanonicalPredictionRecord {
  const consistencyChecks = buildFinalConsistencyChecksFromCanonical({
    foreignRecentPoints: canonical.foreignRecentPoints,
    foreignClusters: canonical.foreignClusters,
    predictedTargets: canonical.predictedTargets,
    weather: canonical.weather,
    insightSummary: canonical.insightSummary,
  });
  const summaryCheck = canonicalSummaryMatchesEvidence({
    summary: canonical.insightSummary,
    estoniaEvidence: canonical.estoniaEvidence,
    foreignRecentPoints: canonical.foreignRecentPoints,
    foreignClusters: canonical.foreignClusters,
    predictedTargets: canonical.predictedTargets,
    elurikkusRecentRecords: canonical.elurikkusRecentRecords,
  });
  const failedConsistencyKeys = Object.entries(consistencyChecks).filter(([, ok]) => ok !== true).map(([key]) => key);
  if (summaryCheck.ok && !failedConsistencyKeys.length) {
    return {
      ...canonical,
      consistencyChecks,
      summaryRegeneratedFromStructuredEvidence: false,
    };
  }
  console.error(`${LOG_PREFIX} fail_closed_summary_enforcement`, {
    speciesName: canonical.speciesName,
    summaryReasons: summaryCheck.reasons,
    failedConsistencyKeys,
    insightSummary: canonical.insightSummary,
    recentCount7d: canonical.estoniaEvidence.recentCount7d,
    recentCount30d: canonical.estoniaEvidence.recentCount30d,
    foreignRecentPoints: canonical.foreignRecentPoints.length,
    foreignClusters: canonical.foreignClusters.length,
    predictedTargets: canonical.predictedTargets.length,
  });
  const rebuilt = buildCanonicalSummaryFromEvidence({
    speciesName: canonical.speciesName,
    estoniaEvidence: canonical.estoniaEvidence,
    foreignEvidence: [],
    foreignRecentPoints: canonical.foreignRecentPoints,
    foreignClusters: canonical.foreignClusters,
    predictedTargets: canonical.predictedTargets,
    activeEvidenceSources: canonical.activeEvidenceSources,
    evidenceStateSnapshot: {
      hasUsableRecentEstoniaEvidence: canonical.hasUsableRecentEstoniaEvidence,
      hasUsableEstoniaHistory: canonical.hasUsableEstoniaHistory,
      hasUsableForeignPressure: canonical.hasUsableForeignPressure,
      hasUsablePredictedTargets: canonical.hasUsablePredictedTargets,
      hasOnlyWeather: canonical.hasOnlyWeather,
      hasOnlySourceAvailabilityWithoutUsableEvidence: canonical.hasOnlySourceAvailabilityWithoutUsableEvidence,
      activeEvidenceSources: canonical.activeEvidenceSources,
      availableSources: canonical.availableSources,
      attemptedButUnavailable: canonical.attemptedButUnavailable,
      attemptedButReturnedNoUsableEvidence: canonical.attemptedButReturnedNoUsableEvidence,
      totalForeignRecentPoints: canonical.foreignRecentPoints.length,
      primaryCountries: [],
      effectiveRankingMode: canonical.effectiveRankingMode,
      evidenceState: canonical.evidenceState,
    },
  });
  const enforcedSummary = canonicalSummaryMatchesEvidence({
    summary: rebuilt.insightSummary,
    estoniaEvidence: canonical.estoniaEvidence,
    foreignRecentPoints: canonical.foreignRecentPoints,
    foreignClusters: canonical.foreignClusters,
    predictedTargets: canonical.predictedTargets,
    elurikkusRecentRecords: canonical.elurikkusRecentRecords,
  }).ok ? rebuilt : buildNeutralStructuredEvidenceSummary(canonical.speciesName);
  const enforcedOrigin: SummaryOrigin = enforcedSummary.insightSummary === rebuilt.insightSummary
    ? 'regenerated_from_structured'
    : 'neutral_sanitizer_fallback';
  return {
    ...canonical,
    insightSummary: enforcedSummary.insightSummary,
    confidenceNote: enforcedSummary.confidenceNote,
    rankingNotes: enforcedSummary.rankingNotes,
    warnings: enforcedSummary.warnings,
    summaryGuardrailApplied: true,
    summaryGuardrailReason: Array.from(new Set([...summaryCheck.reasons, ...failedConsistencyKeys, canonical.summaryGuardrailReason].filter(Boolean))).join(','),
    summaryOrigin: enforcedOrigin,
    consistencyChecks,
    summaryRegeneratedFromStructuredEvidence: true,
  };
}

type NarrativeConsistencyResult = {
  summaryMatchesEvidence: boolean;
  foreignPressureMatchesNarrative: boolean;
  estoniaPresenceMatchesNarrative: boolean;
  targetsMatchEvidence: boolean;
  legacyStateSafe: boolean;
  reasons: string[];
};

type FinalPayloadConsistencyResult = {
  summaryMatchesEvidence: boolean;
  estoniaNarrativeMatchesEvidence: boolean;
  foreignNarrativeMatchesEvidence: boolean;
  targetNarrativeMatchesEvidence: boolean;
  rawPayloadMatchesFinalPayload: boolean;
  reasons: string[];
};

const SAFE_INCOMPLETE_EVIDENCE_SUMMARY =
  'No recent Estonia records were confirmed in the last 7 days, and no coordinate-backed Estonia history or foreign pressure was available in this run. This output should be treated as incomplete evidence rather than an already-present signal.';

const STALE_NARRATIVE_WARNING =
  'Narrative regenerated because stale summary text conflicted with structured evidence.';

function collectEvidenceLocalities(response: Record<string, unknown>): string[] {
  const freshestLocalities = Array.isArray(asRecord(response.estoniaEvidence).freshestLocalities)
    ? asRecord(response.estoniaEvidence).freshestLocalities as unknown[]
    : [];
  return [
    stringOr(asRecord(response.estoniaEvidence).latestEstoniaLocality),
    ...freshestLocalities.map((item: unknown) => stringOr(item)),
    ...(Array.isArray(response.estoniaHistoryPoints)
      ? response.estoniaHistoryPoints.map((item) => stringOr(asRecord(item).locality, asRecord(item).municipality))
      : []),
    ...(Array.isArray(response.estoniaHistoryClusters)
      ? response.estoniaHistoryClusters.map((item) => stringOr(asRecord(item).label, asRecord(item).name, asRecord(item).locality, asRecord(item).municipality))
      : []),
    ...(Array.isArray(response.elurikkusRecentRecords)
      ? response.elurikkusRecentRecords.map((item) => stringOr(asRecord(item).locality, asRecord(item).locName))
      : []),
    ...(Array.isArray(response.predictedTargets)
      ? response.predictedTargets.map((item) => stringOr(asRecord(item).displayName, asRecord(item).name))
      : []),
  ].filter(Boolean);
}

function buildDeterministicSummaryFromStructuredEvidence(payload: Record<string, unknown>): string {
  const estoniaEvidence = asRecord(payload.estoniaEvidence);
  const foreignRecentPoints = Array.isArray(payload.foreignRecentPoints) ? payload.foreignRecentPoints : [];
  const foreignClusters = Array.isArray(payload.foreignClusters) ? payload.foreignClusters : [];
  const estoniaHistoryPoints = Array.isArray(payload.estoniaHistoryPoints) ? payload.estoniaHistoryPoints : [];
  const estoniaHistoryClusters = Array.isArray(payload.estoniaHistoryClusters) ? payload.estoniaHistoryClusters : [];
  const recentCount7d = Math.max(0, Math.round(toNumber(estoniaEvidence.recentCount7d)));
  const hasHistory = estoniaHistoryPoints.length > 0 || estoniaHistoryClusters.length > 0;
  const hasForeign = foreignRecentPoints.length > 0 || foreignClusters.length > 0;

  if (recentCount7d > 0) return `ALREADY PRESENT — ${recentCount7d} records in 7 days.`;
  if (hasHistory) return 'No recent Estonia records were confirmed in the last 7 days.';
  if (!hasForeign) return SAFE_INCOMPLETE_EVIDENCE_SUMMARY;
  return 'No recent Estonia records were confirmed in the last 7 days.';
}

function scrubStaleNarrativeFromStructuredEvidence(payload: Record<string, unknown>): {
  safeSummary: string;
  reasons: string[];
  warning: string | null;
} {
  const estoniaEvidence = asRecord(payload.estoniaEvidence);
  const sourceHealth = asRecord(payload.sourceHealth);
  const foreignRecentPoints = Array.isArray(payload.foreignRecentPoints) ? payload.foreignRecentPoints : [];
  const foreignClusters = Array.isArray(payload.foreignClusters) ? payload.foreignClusters : [];
  const estoniaHistoryPoints = Array.isArray(payload.estoniaHistoryPoints) ? payload.estoniaHistoryPoints : [];
  const estoniaHistoryClusters = Array.isArray(payload.estoniaHistoryClusters) ? payload.estoniaHistoryClusters : [];
  const predictedTargets = Array.isArray(payload.predictedTargets) ? payload.predictedTargets : [];
  const freshestLocalities = Array.isArray(estoniaEvidence.freshestLocalities) ? estoniaEvidence.freshestLocalities : [];
  const summary = stringOr(payload.insightSummary, payload.aiSummary) ?? '';
  const recentCount7d = Math.max(0, Math.round(toNumber(estoniaEvidence.recentCount7d)));
  const reasons: string[] = [];

  if (/^ALREADY PRESENT/i.test(summary) && recentCount7d <= 0) reasons.push('summary_claims_already_present_without_recent_evidence');
  if (sourceHealth.ebirdAvailable !== true && /(PL|SE|FI|Poland|Sweden|Finland|foreign pressure)/i.test(summary)) reasons.push('summary_mentions_foreign_pressure_without_ebird');
  if (foreignRecentPoints.length === 0 && foreignClusters.length === 0 && /(Mikoszewo|Zatoka Pomorska|Brittas väg|Helsinki|Kalmar|Rezerwat przyrody Mewia Łacha|Hel|Dziwn[oó]w)/i.test(summary)) reasons.push('summary_mentions_foreign_locality_without_evidence');
  if (estoniaHistoryPoints.length === 0 && estoniaHistoryClusters.length === 0 && freshestLocalities.length === 0 && /(Sääre|Ristna|Põõsaspea|Spithami|Tagaranna)/i.test(summary)) reasons.push('summary_mentions_estonia_locality_without_evidence');
  if (predictedTargets.length === 0 && /(watchers should focus|focus on|target hotspots|top hotspots|hotspot ranking|Ristna|Põõsaspea|Spithami|Tagaranna|Sääre)/i.test(summary)) reasons.push('summary_mentions_targets_without_predicted_targets');
  if (stringOr(payload.payloadSourceState) === 'legacy_or_unverified_source') reasons.push('legacy_or_unverified_source_reused_stale_narrative');

  return {
    // Pass the already-extracted locals — never re-read from payload — so the deterministic
    // summary is built from the same arrays the stale checks ran against, not from whatever
    // rawResearchPayload or a legacy payload might still carry at those keys.
    safeSummary: buildDeterministicSummaryFromStructuredEvidence({
      estoniaEvidence,
      foreignRecentPoints,
      foreignClusters,
      estoniaHistoryPoints,
      estoniaHistoryClusters,
    }),
    reasons,
    warning: reasons.length ? STALE_NARRATIVE_WARNING : null,
  };
}

function validatePredictionPayloadConsistency(finalPayload: Record<string, unknown>): FinalPayloadConsistencyResult {
  const narrative = validateNarrativeConsistency(finalPayload);
  const rawResearchPayload = asRecord(finalPayload.rawResearchPayload);
  const normalizedSources = asRecord(rawResearchPayload.normalizedSources);
  const rawPayloadMatchesFinalPayload =
    stringOr(rawResearchPayload.aiSummary) === stringOr(finalPayload.aiSummary)
    && JSON.stringify(asRecord(rawResearchPayload.estoniaEvidence)) === JSON.stringify(asRecord(finalPayload.estoniaEvidence))
    && JSON.stringify(Array.isArray(rawResearchPayload.foreignEvidence) ? rawResearchPayload.foreignEvidence : []) === JSON.stringify(Array.isArray(finalPayload.foreignRecentPoints) ? finalPayload.foreignRecentPoints : [])
    && JSON.stringify(Array.isArray(rawResearchPayload.predictedTargets) ? rawResearchPayload.predictedTargets : []) === JSON.stringify(Array.isArray(finalPayload.predictedTargets) ? finalPayload.predictedTargets : [])
    && JSON.stringify(Array.isArray(normalizedSources.foreignRecentPoints) ? normalizedSources.foreignRecentPoints : []) === JSON.stringify(Array.isArray(finalPayload.foreignRecentPoints) ? finalPayload.foreignRecentPoints : [])
    && JSON.stringify(Array.isArray(normalizedSources.foreignClusters) ? normalizedSources.foreignClusters : []) === JSON.stringify(Array.isArray(finalPayload.foreignClusters) ? finalPayload.foreignClusters : [])
    && JSON.stringify(Array.isArray(normalizedSources.estoniaHistoryPoints) ? normalizedSources.estoniaHistoryPoints : []) === JSON.stringify(Array.isArray(finalPayload.estoniaHistoryPoints) ? finalPayload.estoniaHistoryPoints : [])
    && JSON.stringify(Array.isArray(normalizedSources.estoniaHistoryClusters) ? normalizedSources.estoniaHistoryClusters : []) === JSON.stringify(Array.isArray(finalPayload.estoniaHistoryClusters) ? finalPayload.estoniaHistoryClusters : []);

  return {
    summaryMatchesEvidence: narrative.summaryMatchesEvidence,
    estoniaNarrativeMatchesEvidence: narrative.estoniaPresenceMatchesNarrative,
    foreignNarrativeMatchesEvidence: narrative.foreignPressureMatchesNarrative,
    targetNarrativeMatchesEvidence: narrative.targetsMatchEvidence,
    rawPayloadMatchesFinalPayload,
    reasons: [
      ...narrative.reasons,
      ...(rawPayloadMatchesFinalPayload ? [] : ['raw_payload_does_not_match_final_payload']),
    ],
  };
}

function buildFinalPredictionPayloadFromEvidence(payload: Record<string, unknown>): Record<string, unknown> {
  const estoniaEvidence = { ...asRecord(payload.estoniaEvidence) };
  const normalizedSources = asRecord(asRecord(payload.rawResearchPayload).normalizedSources);
  const topLevelForeignRecentPoints = Array.isArray(payload.foreignRecentPoints) ? payload.foreignRecentPoints : [];
  const topLevelForeignClusters = Array.isArray(payload.foreignClusters) ? payload.foreignClusters : [];
  const normalizedForeignRecentPointsRaw = Array.isArray(normalizedSources.foreignRecentPoints) ? normalizedSources.foreignRecentPoints : [];
  const normalizedForeignClustersRaw = Array.isArray(normalizedSources.foreignClusters) ? normalizedSources.foreignClusters : [];
  const foreignRecentPoints = topLevelForeignRecentPoints.length
    ? topLevelForeignRecentPoints
    : normalizedForeignRecentPointsRaw;
  const foreignClusters = hasNonPlaceholderForeignClusters(topLevelForeignClusters)
    ? sanitizeCanonicalForeignClusters(topLevelForeignClusters)
    : sanitizeCanonicalForeignClusters(normalizedForeignClustersRaw);
  const estoniaHistoryPoints = Array.isArray(payload.estoniaHistoryPoints) ? payload.estoniaHistoryPoints : [];
  const estoniaHistoryClusters = Array.isArray(payload.estoniaHistoryClusters) ? payload.estoniaHistoryClusters : [];
  const predictedTargets = Array.isArray(payload.predictedTargets) ? payload.predictedTargets : [];
  const scrubbed = scrubStaleNarrativeFromStructuredEvidence(payload);
  const recentCount7d = Math.max(0, Math.round(toNumber(estoniaEvidence.recentCount7d)));
  const recentCount30d = Math.max(0, Math.round(toNumber(estoniaEvidence.recentCount30d)));
  const canonicalWeather = Object.keys(asRecord(payload.weather)).length
    ? asRecord(payload.weather)
    : asRecord(normalizedSources.weather);
  const normalizedForeignRecentPoints = normalizedForeignRecentPointsRaw.map((entry) => asRecord(entry));
  const normalizedForeignClusters = sanitizeCanonicalForeignClusters(normalizedForeignClustersRaw).map((entry) => asRecord(entry));
  const foreignEvidence = buildForeignEvidenceFromPointsAndClusters(
    foreignRecentPoints.map((entry) => asRecord(entry)),
    foreignClusters.map((entry) => asRecord(entry)),
  );
  const canonicalSourceOriginAnchor = selectStrongestForeignSourceAnchor(
    normalizedForeignClusters.length ? normalizedForeignClusters : foreignClusters.map((entry) => asRecord(entry)),
    normalizedForeignRecentPoints.length ? normalizedForeignRecentPoints : foreignRecentPoints.map((entry) => asRecord(entry)),
  );
  const canonicalCorridorAnchor = canonicalSourceOriginAnchor
    ? selectNearestPlausibleCorridorAnchor(
      canonicalSourceOriginAnchor,
      normalizedForeignClusters.length ? normalizedForeignClusters : foreignClusters.map((entry) => asRecord(entry)),
      normalizedForeignRecentPoints.length ? normalizedForeignRecentPoints : foreignRecentPoints.map((entry) => asRecord(entry)),
    )
    : null;
  const canonicalEntryCorridor = canonicalSourceOriginAnchor && estoniaHistoryClusters.length
    ? deriveEstoniaEntryCorridor(canonicalCorridorAnchor ?? canonicalSourceOriginAnchor, estoniaHistoryClusters.map((entry) => asRecord(entry)))
    : null;
  const canonicalPredictedTargets = canonicalSourceOriginAnchor && canonicalEntryCorridor
    ? (predictedTargets.map((entry, index) => rebuildMigrationEtaOnTarget(asRecord(entry), canonicalSourceOriginAnchor, canonicalCorridorAnchor, canonicalEntryCorridor, canonicalWeather, index)))
    : predictedTargets;
  const canonicalCountryScores = buildCountryScores(foreignEvidence);
  const evidenceStateSnapshot = computeEvidenceState({
    estoniaEvidence,
    estoniaHistoryPoints,
    estoniaHistoryClusters,
    foreignRecentPoints,
    foreignClusters,
    foreignEvidence,
    sourceHealth: asRecord(payload.sourceHealth),
    weather: canonicalWeather,
    predictedTargets,
    topPredictedPoints: Array.isArray(payload.topPredictedPoints) ? payload.topPredictedPoints : canonicalPredictedTargets,
  });
  const canonicalEvidenceSummary = buildEvidenceSummary({
    weather: canonicalWeather,
    sourceHealth: asRecord(payload.sourceHealth),
    evidenceStateSnapshot,
  });
  const canonicalPrimaryCountries = extractCanonicalPrimaryCountries(foreignRecentPoints, foreignClusters);
  const predictedTargetsMentionForeignPressure = predictedTargetsContainForeignPressureSignals(canonicalPredictedTargets);
  const canonicalExternalPressureScore = clampInt(Math.round(sum(foreignEvidence.map((entry) => toNumber(entry.recordCount7d) * 4))), 0, 100);
  const forcedExternalPressureScore = (foreignRecentPoints.length > 0 || foreignClusters.length > 0 || predictedTargetsMentionForeignPressure)
    ? Math.max(1, canonicalExternalPressureScore)
    : canonicalExternalPressureScore;
  const predictedTargetRouteVector = deriveRouteVectorFromPredictedTargets(canonicalPredictedTargets);
  const predictedTargetBestEntryZone = deriveBestEntryZoneFromPredictedTargets(canonicalPredictedTargets);
  const canonicalRouteVector = foreignClusters.length
    ? `${joinCountries((foreignClusters[0] as Record<string, unknown>).countryCodes) || joinCountries((foreignClusters[0] as Record<string, unknown>).countries)} -> Estonia`
    : stringOr(predictedTargetRouteVector, isUnavailableLabel(payload.routeVector) ? '' : payload.routeVector);
  const canonicalHasUsableForeignPressure = foreignRecentPoints.length > 0
    || foreignClusters.length > 0
    || predictedTargetsMentionForeignPressure;
  estoniaEvidence.recentCount7d = recentCount7d;
  estoniaEvidence.recentCount30d = recentCount30d;
  estoniaEvidence.alreadyPresent = recentCount7d > 0;

  const finalWarnings = Array.from(new Set([
    ...(recentCount7d > 0 ? [] : ['No recent Estonia records were confirmed in the last 7 days.']),
    ...(estoniaHistoryPoints.length || estoniaHistoryClusters.length ? [] : ['No coordinate-backed Estonia history was available in this run.']),
    ...((asRecord(payload.sourceHealth).ebirdAvailable === true && (foreignRecentPoints.length || foreignClusters.length)) ? [] : ['No foreign pressure was available in this run.']),
    ...(predictedTargets.length ? [] : ['No predicted targets were retained from the final structured evidence.']),
    ...(scrubbed.warning ? [scrubbed.warning] : []),
  ]));
  const finalConsistencyChecks = buildFinalConsistencyChecksFromCanonical({
    foreignRecentPoints,
    foreignClusters,
    predictedTargets: canonicalPredictedTargets,
    weather: canonicalWeather,
    insightSummary: scrubbed.safeSummary,
  });
  const rawResearchPayload = asRecord(payload.rawResearchPayload);
  const finalPayload: Record<string, unknown> = {
    speciesKey: payload.speciesKey,
    speciesName: payload.speciesName,
    scope: payload.scope,
    generatedAt: payload.generatedAt,
    analysisVersion: payload.analysisVersion,
    species: asRecord(payload.species),
    sourceHealth: asRecord(payload.sourceHealth),
    evidenceSummary: {
      ...canonicalEvidenceSummary,
      totalForeignRecentPoints: foreignRecentPoints.length,
      primaryCountries: canonicalPrimaryCountries,
    },
    elurikkusRecentRecords: Array.isArray(payload.elurikkusRecentRecords) ? payload.elurikkusRecentRecords : [],
    estoniaHistoryPoints,
    estoniaHistoryClusters,
    foreignRecentPoints,
    foreignClusters,
    weather: canonicalWeather,
    predictionVectors: Array.isArray(payload.predictionVectors) ? payload.predictionVectors : [],
    predictedTargets: canonicalPredictedTargets,
    mapLayers: asRecord(payload.mapLayers),
    foreignEvidence,
    historicalEvidence: asRecord(payload.historicalEvidence),
    rawLinks: asRecord(payload.rawLinks),
    estoniaEvidence,
    externalPressureScore: forcedExternalPressureScore,
    springFitScore: payload.springFitScore,
    windSupportScore: payload.windSupportScore,
    routeVector: canonicalRouteVector || 'Unavailable',
    bestEntryZone: stringOr(
      asRecord(canonicalPredictedTargets[0]).entryCorridorLabel,
      asRecord(canonicalPredictedTargets[0]).countyOrParish,
      asRecord(canonicalPredictedTargets[0]).name,
      predictedTargetBestEntryZone,
      isUnavailableLabel(payload.bestEntryZone) ? '' : payload.bestEntryZone,
      'Unavailable',
    ),
    alreadyMissedRisk: payload.alreadyMissedRisk,
    countryScores: canonicalCountryScores,
    topPredictedPoints: canonicalPredictedTargets,
    insightSummary: scrubbed.safeSummary,
    aiSummary: scrubbed.safeSummary,
    confidenceNote: payload.confidenceNote,
    rankingNotes: payload.rankingNotes,
    warnings: finalWarnings,
    payloadSourceState: payload.payloadSourceState,
    consistencyChecks: {
      ...finalConsistencyChecks,
      legacyStateSafe: true,
    },
    summaryOrigin: scrubbed.reasons.length ? 'neutral_sanitizer_fallback' : 'regenerated_from_structured',
    summaryRegeneratedFromStructuredEvidence: true,
    backendBuild: payload.backendBuild,
    invokeRouteVersion: payload.invokeRouteVersion,
    responseProof: payload.responseProof,
    summaryGuardrailApplied: payload.summaryGuardrailApplied,
    summaryGuardrailReason: payload.summaryGuardrailReason,
    evidenceState: payload.evidenceState,
    hasUsableRecentEstoniaEvidence: payload.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: payload.hasUsableEstoniaHistory,
    hasUsableForeignPressure: canonicalHasUsableForeignPressure,
    hasUsablePredictedTargets: payload.hasUsablePredictedTargets,
    hasOnlyWeather: payload.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: payload.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: payload.activeEvidenceSources,
    availableSources: payload.availableSources,
    attemptedButUnavailable: payload.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: payload.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: payload.effectiveRankingMode,
    rawResearchPayload: {
      // Safe carry-forwards: species metadata, structured data, coordinates, URLs
      request: asRecord(rawResearchPayload.request),
      evidenceState: rawResearchPayload.evidenceState,
      rawLinks: asRecord(rawResearchPayload.rawLinks),
      historicalEvidence: asRecord(rawResearchPayload.historicalEvidence),
      predictionVectors: Array.isArray(rawResearchPayload.predictionVectors) ? rawResearchPayload.predictionVectors : [],
      sourceHealth: asRecord(payload.sourceHealth),
      evidenceSummary: {
        ...canonicalEvidenceSummary,
        totalForeignRecentPoints: foreignRecentPoints.length,
        primaryCountries: canonicalPrimaryCountries,
      },
      // Fresh computed values — never carried from rawResearchPayload
      aiSummary: scrubbed.safeSummary,
      insightSummary: scrubbed.safeSummary,
      confidenceNote: '',
      rankingNotes: [],
      topPredictedPoints: canonicalPredictedTargets,
      estoniaEvidence,
      foreignEvidence: foreignRecentPoints,
      predictedTargets: canonicalPredictedTargets,
      warnings: finalWarnings,
      consistencyChecks: {
        ...finalConsistencyChecks,
        legacyStateSafe: true,
      },
      countryScores: canonicalCountryScores,
      externalPressureScore: forcedExternalPressureScore,
      normalizedSources: {
        estoniaHistoryPoints,
        estoniaHistoryClusters,
        foreignRecentPoints,
        foreignClusters,
        weather: canonicalWeather,
      },
    },
  };
  if (normalizedForeignRecentPoints.length > 0 && foreignRecentPoints.length === 0) {
    console.error(`${LOG_PREFIX} final_payload_foreign_points_promoted`, {
      speciesName: finalPayload.speciesName,
      normalizedForeignRecentPointsCount: normalizedForeignRecentPoints.length,
      topLevelForeignRecentPointsCount: topLevelForeignRecentPoints.length,
    });
  }
  if (predictedTargetsMentionForeignPressure && (toNumber(finalPayload.externalPressureScore) <= 0 || isUnavailableLabel(finalPayload.routeVector) || isUnavailableLabel(finalPayload.bestEntryZone))) {
    console.error(`${LOG_PREFIX} final_payload_foreign_pressure_state_promoted`, {
      speciesName: finalPayload.speciesName,
      externalPressureScore: finalPayload.externalPressureScore,
      routeVector: finalPayload.routeVector,
      bestEntryZone: finalPayload.bestEntryZone,
    });
  }
  if (finalPayload.hasUsableForeignPressure === true && Object.values(asRecord(finalPayload.countryScores)).every((value) => toNumber(value) <= 0)) {
    console.error(`${LOG_PREFIX} final_payload_country_scores_promoted`, {
      speciesName: finalPayload.speciesName,
      countryScores: finalPayload.countryScores,
    });
  }
  if (finalPayload.hasUsableForeignPressure === true && !hasRealForeignEvidenceShape(foreignRecentPoints, foreignClusters)) {
    console.warn(`${LOG_PREFIX} foreign_pressure_consistency_violation`, {
      speciesName: finalPayload.speciesName,
      hasUsableForeignPressure: finalPayload.hasUsableForeignPressure,
      foreignRecentPointsCount: foreignRecentPoints.length,
      foreignClustersCount: foreignClusters.length,
      normalizedForeignRecentPointsCount: normalizedForeignRecentPoints.length,
      normalizedForeignClustersCount: normalizedForeignClusters.length,
      payloadSourceState: finalPayload.payloadSourceState,
    });
  }
  return finalPayload;
}

function rebuildMigrationEtaOnTarget(
  target: Record<string, unknown>,
  sourceOriginAnchor: Record<string, unknown>,
  corridorAnchor: Record<string, unknown> | null,
  estoniaEntryCorridor: { entryLabel: string; entryLat: number; entryLon: number; bearingDeg: number; distanceFromForeignKm: number },
  weather: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const existingEta = asRecord(target.migrationEta);
  const sourceCountryCode = Array.isArray(sourceOriginAnchor.countryCodes) ? String(sourceOriginAnchor.countryCodes[0] || '').toUpperCase() : '';
  const expectedCountry = Array.isArray(sourceOriginAnchor.countries)
    ? String(sourceOriginAnchor.countries[0] || '')
    : resolveCountryName(sourceCountryCode);
  const etaCountry = stringOr(existingEta.fromCountry, existingEta.foreignCountry);
  const needsRebuild = !etaCountry
    || (expectedCountry && etaCountry.toLowerCase() !== expectedCountry.toLowerCase() && etaCountry.toUpperCase() !== sourceCountryCode);
  if (!needsRebuild) return target;
  return {
    ...target,
    migrationEta: buildCanonicalMigrationEta({
      sourceOriginAnchor,
      corridorAnchor,
      estoniaEntryCorridor,
      target: {
        name: stringOr(target.displayName, target.name, `Target ${index + 1}`),
        lat: toNumber(target.lat),
        lon: toNumber(target.lon),
        rank: toNumber(target.rank) || index + 1,
      },
      weather,
    }),
  };
}

function hasNonPlaceholderForeignClusters(input: unknown[]): boolean {
  return input.some((entry) => {
    const cluster = asRecord(entry);
    return (Array.isArray(cluster.countries) && cluster.countries.length > 0)
      || (Array.isArray(cluster.countryCodes) && cluster.countryCodes.length > 0)
      || (Array.isArray(cluster.locNames) && cluster.locNames.length > 0)
      || !!stringOr(cluster.locality, cluster.locName)
      || toNumber(cluster.totalHowMany) > 0
      || toNumber(cluster.totalIndividuals) > 0
      || toNumber(cluster.recent7d) > 0
      || toNumber(cluster.recent14d) > 0
      || toNumber(cluster.nearestDistanceKm) > 0;
  });
}

function sanitizeCanonicalForeignClusters(input: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry, index) => {
    const cluster = asRecord(entry);
    const locNames = Array.isArray(cluster.locNames)
      ? cluster.locNames.map((item) => stringOr(item)).filter(Boolean)
      : (stringOr(cluster.locality, cluster.locName) ? [stringOr(cluster.locality, cluster.locName)] : []);
    const pointCount = Math.max(1, Math.round(toNumber(cluster.pointCount) || toNumber(cluster.count) || 1));
    const totalHowMany = Math.max(0, Math.round(toNumber(cluster.totalHowMany) || toNumber(cluster.totalIndividuals)));
    const normalized: Record<string, unknown> = {
      ...cluster,
      id: stringOr(cluster.id, `cluster-${index + 1}`),
      pointCount,
      count: pointCount,
      newestObsDt: stringOr(cluster.newestObsDt, cluster.latestDate),
      latestDate: stringOr(cluster.latestDate, cluster.newestObsDt),
      oldestObsDt: stringOr(cluster.oldestObsDt),
      totalHowMany,
      totalIndividuals: totalHowMany,
      countries: Array.isArray(cluster.countries) ? cluster.countries.map((item) => stringOr(item)).filter(Boolean) : [],
      countryCodes: Array.isArray(cluster.countryCodes) ? cluster.countryCodes.map((item) => stringOr(item).toLowerCase()).filter(Boolean) : [],
      locNames,
      locality: stringOr(cluster.locality, locNames[0]),
      nearestDistanceKm: toNumber(cluster.nearestDistanceKm),
      source: stringOr(cluster.source, 'eBird'),
    };
    if (cluster.recent7d != null) normalized.recent7d = Math.max(0, Math.round(toNumber(cluster.recent7d)));
    if (cluster.recent14d != null) normalized.recent14d = Math.max(0, Math.round(toNumber(cluster.recent14d)));
    return normalized;
  }).filter((cluster) => !(!hasNonPlaceholderForeignClusters([cluster]) && Number(toNumber(asRecord(cluster).lat)) !== 0 && Number(toNumber(asRecord(cluster).lon)) !== 0));
}

function predictedTargetsContainForeignPressureSignals(predictedTargets: unknown[]): boolean {
  return predictedTargets.some((entry) => {
    const target = asRecord(entry);
    const reason = stringOr(target.reason);
    const migrationEta = asRecord(target.migrationEta);
    return /foreign pressure|entry corridor|migration eta|latvia|lithuania|poland/i.test(reason)
      || !!stringOr(target.entryCorridorLabel)
      || !!stringOr(migrationEta.entryZone, migrationEta.entryLabel)
      || !!stringOr(migrationEta.fromCountry, migrationEta.foreignCountry);
  });
}

function deriveRouteVectorFromPredictedTargets(predictedTargets: unknown[]): string {
  const first = asRecord(predictedTargets[0]);
  const migrationEta = asRecord(first.migrationEta);
  const country = stringOr(migrationEta.fromCountry, migrationEta.foreignCountry);
  return country ? `${country} -> Estonia` : '';
}

function deriveBestEntryZoneFromPredictedTargets(predictedTargets: unknown[]): string {
  const first = asRecord(predictedTargets[0]);
  const migrationEta = asRecord(first.migrationEta);
  return stringOr(first.entryCorridorLabel, migrationEta.entryZone, migrationEta.entryLabel, first.countyOrParish, first.name);
}

function extractCanonicalPrimaryCountries(
  foreignRecentPoints: unknown[],
  foreignClusters: unknown[],
): string[] {
  const countryNamesFromPoints = foreignRecentPoints
    .map((entry) => {
      const point = asRecord(entry);
      return stringOr(point.countryName, resolveCountryName(stringOr(point.countryCode)));
    })
    .filter(Boolean);
  const countryNamesFromClusters = foreignClusters.flatMap((entry) => {
    const cluster = asRecord(entry);
    const names = Array.isArray(cluster.countries) ? cluster.countries.map((item) => stringOr(item)).filter(Boolean) : [];
    const codes = Array.isArray(cluster.countryCodes)
      ? cluster.countryCodes.map((item) => resolveCountryName(stringOr(item))).filter(Boolean)
      : [];
    return [...names, ...codes];
  });
  return Array.from(new Set([...countryNamesFromPoints, ...countryNamesFromClusters])).slice(0, 5);
}

function isUnavailableLabel(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'unavailable';
}

function hasRealForeignEvidenceShape(foreignRecentPoints: unknown[], foreignClusters: unknown[]): boolean {
  if (foreignRecentPoints.length > 0) return true;
  return foreignClusters.some((entry) => {
    const cluster = asRecord(entry);
    return ((Array.isArray(cluster.countries) && cluster.countries.length > 0)
      || (Array.isArray(cluster.countryCodes) && cluster.countryCodes.length > 0))
      && (toNumber(cluster.totalHowMany) > 0 || toNumber(cluster.pointCount) > 0);
  });
}

function buildDeterministicFinalPayloadFields(payload: Record<string, unknown>) {
  const estoniaEvidence = { ...asRecord(payload.estoniaEvidence) };
  const foreignRecentPoints = Array.isArray(payload.foreignRecentPoints) ? payload.foreignRecentPoints : [];
  const foreignClusters = Array.isArray(payload.foreignClusters) ? payload.foreignClusters : [];
  const estoniaHistoryPoints = Array.isArray(payload.estoniaHistoryPoints) ? payload.estoniaHistoryPoints : [];
  const estoniaHistoryClusters = Array.isArray(payload.estoniaHistoryClusters) ? payload.estoniaHistoryClusters : [];
  const predictedTargets = Array.isArray(payload.predictedTargets) ? payload.predictedTargets : [];
  const recentCount7d = Math.max(0, Math.round(toNumber(estoniaEvidence.recentCount7d)));
  const recentCount30d = Math.max(0, Math.round(toNumber(estoniaEvidence.recentCount30d)));
  const hasHistory = estoniaHistoryPoints.length > 0 || estoniaHistoryClusters.length > 0;
  const hasForeign = foreignRecentPoints.length > 0 || foreignClusters.length > 0;
  const ebirdAvailable = asRecord(payload.sourceHealth).ebirdAvailable === true;
  estoniaEvidence.alreadyPresent = recentCount7d > 0;
  estoniaEvidence.recentCount7d = recentCount7d;
  estoniaEvidence.recentCount30d = recentCount30d;

  let insightSummary = '';
  if (recentCount7d > 0) {
    insightSummary = `ALREADY PRESENT — ${recentCount7d} records in 7 days.`;
  } else if (hasHistory) {
    insightSummary = 'No recent Estonia records were confirmed in the last 7 days.';
  } else if (!hasForeign) {
    insightSummary = 'No recent Estonia records were confirmed in the last 7 days, and no coordinate-backed Estonia history or foreign pressure was available in this run. This result should be treated as incomplete evidence, not as an already-present signal.';
  } else {
    insightSummary = 'No recent Estonia records were confirmed in the last 7 days.';
  }

  const warnings = Array.from(new Set([
    ...(recentCount7d > 0 ? [] : ['No recent Estonia records were confirmed in the last 7 days.']),
    ...(hasHistory ? [] : ['No coordinate-backed Estonia history was available in this run.']),
    ...(ebirdAvailable && hasForeign ? [] : ['No foreign pressure was available in this run.']),
    ...(predictedTargets.length ? [] : ['No predicted targets were retained from the final structured evidence.']),
  ]));
  const consistencyChecks = buildFinalConsistencyChecksFromCanonical({
    foreignRecentPoints,
    foreignClusters,
    predictedTargets,
    weather: asRecord(payload.weather),
    insightSummary,
  });

  return {
    insightSummary,
    aiSummary: insightSummary,
    warnings,
    consistencyChecks,
    estoniaEvidence,
    predictedTargets,
    countryScores: {
      latvia: 0,
      lithuania: 0,
      belarus: 0,
      poland: 0,
      russia: 0,
      finlandContextOnly: 0,
    },
    externalPressureScore: 0,
  };
}

function validateNarrativeConsistency(payload: Record<string, unknown>): NarrativeConsistencyResult {
  const summary = stringOr(payload.insightSummary, payload.aiSummary) ?? '';
  const recentCount7d = Math.max(0, Math.round(toNumber(asRecord(payload.estoniaEvidence).recentCount7d)));
  const foreignRecentPoints = Array.isArray(payload.foreignRecentPoints) ? payload.foreignRecentPoints : [];
  const foreignClusters = Array.isArray(payload.foreignClusters) ? payload.foreignClusters : [];
  const estoniaHistoryPoints = Array.isArray(payload.estoniaHistoryPoints) ? payload.estoniaHistoryPoints : [];
  const estoniaHistoryClusters = Array.isArray(payload.estoniaHistoryClusters) ? payload.estoniaHistoryClusters : [];
  const predictedTargets = Array.isArray(payload.predictedTargets) ? payload.predictedTargets : [];
  const evidenceLocalities = collectEvidenceLocalities(payload).join(' ').toLowerCase();
  const reasons: string[] = [];
  const summaryMatchesEvidence = !(/^ALREADY PRESENT/i.test(summary) && recentCount7d <= 0);
  if (!summaryMatchesEvidence) reasons.push('summary_claims_already_present_without_recent_evidence');
  const foreignPressureMatchesNarrative = !(/(PL|SE|FI|Poland|Sweden|Finland|Mikoszewo|Kalmar|Helsinki|Zatoka Pomorska|Hel|Dziwnów|foreign pressure)/i.test(summary)
    && (asRecord(payload.sourceHealth).ebirdAvailable !== true || (!foreignRecentPoints.length && !foreignClusters.length)));
  if (!foreignPressureMatchesNarrative) reasons.push('summary_mentions_foreign_pressure_without_evidence');
  const estoniaPresenceMatchesNarrative = !(/(Sääre|Ristna|Põõsaspea|Spithami|Tagaranna|Saaremaa|Hiiu|Lääne counties)/i.test(summary)
    && !estoniaHistoryPoints.length
    && !estoniaHistoryClusters.length
    && !evidenceLocalities);
  if (!estoniaPresenceMatchesNarrative) reasons.push('summary_mentions_estonia_locality_without_evidence');
  const targetsMatchEvidence = !(/(watchers should focus|focus on|top targets|hotspot|target sites)/i.test(summary) && !predictedTargets.length);
  if (!targetsMatchEvidence) reasons.push('summary_mentions_targets_without_predicted_targets');
  const legacyStateSafe = stringOr(payload.payloadSourceState) !== 'legacy_or_unverified_source' || !summary;
  if (!legacyStateSafe) reasons.push('legacy_or_unverified_source_reused_stale_narrative');
  return {
    summaryMatchesEvidence,
    foreignPressureMatchesNarrative,
    estoniaPresenceMatchesNarrative,
    targetsMatchEvidence,
    legacyStateSafe,
    reasons,
  };
}

function finalizePredictionResponse(
  canonicalResponse: Record<string, unknown>,
  branch: string,
): Record<string, unknown> {
  logPredictionSummaryState('canonical_response_built', branch, canonicalResponse);
  const finalPayload = buildFinalPredictionPayloadFromEvidence(canonicalResponse);
  const finalValidation = validatePredictionPayloadConsistency(finalPayload);
  if (!finalValidation.rawPayloadMatchesFinalPayload) {
    // Change 1: surface the mismatch visibly in the API response so callers can detect it.
    finalPayload.warnings = Array.from(new Set([
      ...(Array.isArray(finalPayload.warnings) ? finalPayload.warnings.map((w) => String(w || '')) : []),
      'raw_payload_mismatch_detected',
    ]));
    // Change 2: if the narrative also contradicts the structured arrays, force-apply the
    // scrubber now — do not let a mismatched payload leave with stale text intact.
    const mismatchScrub = scrubStaleNarrativeFromStructuredEvidence(finalPayload);
    if (mismatchScrub.reasons.length) {
      finalPayload.insightSummary = mismatchScrub.safeSummary;
      finalPayload.aiSummary = mismatchScrub.safeSummary;
      finalPayload.summaryOrigin = 'neutral_sanitizer_fallback';
      finalPayload.summaryRegeneratedFromStructuredEvidence = true;
      if (mismatchScrub.warning) {
        finalPayload.warnings = Array.from(new Set([
          ...(Array.isArray(finalPayload.warnings) ? finalPayload.warnings.map((w) => String(w || '')) : []),
          mismatchScrub.warning,
        ]));
      }
    }
    const mismatchRwp = asRecord(finalPayload.rawResearchPayload);
    mismatchRwp.aiSummary = stringOr(finalPayload.aiSummary);
    mismatchRwp.insightSummary = stringOr(finalPayload.insightSummary);
    mismatchRwp.warnings = finalPayload.warnings;
  }
  if (finalValidation.reasons.length) {
    finalPayload.insightSummary = buildDeterministicSummaryFromStructuredEvidence(finalPayload);
    finalPayload.aiSummary = stringOr(finalPayload.insightSummary);
    finalPayload.warnings = Array.from(new Set([...(Array.isArray(finalPayload.warnings) ? finalPayload.warnings.map((item) => String(item || '')) : []), STALE_NARRATIVE_WARNING]));
    finalPayload.consistencyChecks = buildFinalConsistencyChecksFromCanonical({
      foreignRecentPoints: Array.isArray(finalPayload.foreignRecentPoints) ? finalPayload.foreignRecentPoints : [],
      foreignClusters: Array.isArray(finalPayload.foreignClusters) ? finalPayload.foreignClusters : [],
      predictedTargets: Array.isArray(finalPayload.predictedTargets) ? finalPayload.predictedTargets : [],
      weather: asRecord(finalPayload.weather),
      insightSummary: stringOr(finalPayload.insightSummary),
    });
    asRecord(finalPayload.consistencyChecks).legacyStateSafe = true;
    const rawResearchPayload = asRecord(finalPayload.rawResearchPayload);
    rawResearchPayload.aiSummary = stringOr(finalPayload.aiSummary);
    rawResearchPayload.insightSummary = stringOr(finalPayload.insightSummary);
    rawResearchPayload.warnings = finalPayload.warnings;
    rawResearchPayload.consistencyChecks = finalPayload.consistencyChecks;
  }
  logPredictionSummaryState('before_return', branch, finalPayload, {
    returnedObjectIsSanitizedObject: true,
    validationReasons: finalValidation.reasons,
  });
  return finalPayload;
}

function finalizePredictionPayload(
  payload: Record<string, unknown>,
  branch: string,
): Record<string, unknown> {
  return finalizePredictionResponse(payload, branch);
}

function buildCanonicalPredictionRecord(input: {
  base: Record<string, unknown>;
  alternate?: Record<string, unknown> | null;
  preferredSummary?: Pick<CanonicalPredictionRecord, 'insightSummary' | 'confidenceNote' | 'rankingNotes' | 'warnings'> | null;
}): CanonicalPredictionRecord {
  const chosen = pickCanonicalStructuredSource(input.base, input.alternate);
  const sourceHealth = asRecord(chosen.sourceHealth);
  const estoniaEvidence = asRecord(chosen.estoniaEvidence);
  const foreignRecentPoints = Array.isArray(chosen.foreignRecentPoints) ? chosen.foreignRecentPoints : [];
  const foreignClusters = Array.isArray(chosen.foreignClusters) ? chosen.foreignClusters : [];
  const predictedTargets = Array.isArray(chosen.predictedTargets) ? chosen.predictedTargets : [];
  const estoniaHistoryPoints = Array.isArray(chosen.estoniaHistoryPoints) ? chosen.estoniaHistoryPoints : [];
  const estoniaHistoryClusters = Array.isArray(chosen.estoniaHistoryClusters) ? chosen.estoniaHistoryClusters : [];
  const elurikkusRecentRecords = Array.isArray(chosen.elurikkusRecentRecords) ? chosen.elurikkusRecentRecords : [];
  const globalMigrationEtas = Array.isArray(chosen.globalMigrationEtas) ? chosen.globalMigrationEtas : [];
  const foreignEvidence = Array.isArray(chosen.foreignEvidence) ? chosen.foreignEvidence.map((item) => asRecord(item)) : [];
  const weather = asRecord(chosen.weather);
  const evidenceStateSnapshot = computeEvidenceState({
    estoniaEvidence,
    estoniaHistoryPoints,
    estoniaHistoryClusters,
    foreignRecentPoints,
    foreignClusters,
    foreignEvidence,
    sourceHealth,
    weather,
    predictedTargets,
    topPredictedPoints: Array.isArray(chosen.topPredictedPoints) ? chosen.topPredictedPoints : predictedTargets,
  });
  const evidenceSummary = buildEvidenceSummary({
    weather,
    sourceHealth,
    evidenceStateSnapshot,
  });
  const deterministicSummary = buildCanonicalSummaryFromEvidence({
    speciesName: stringOr(chosen.speciesName, asRecord(chosen.species).speciesName, asRecord(chosen.species).name),
    estoniaEvidence,
    foreignEvidence,
    foreignRecentPoints,
    foreignClusters,
    predictedTargets,
    activeEvidenceSources: evidenceStateSnapshot.activeEvidenceSources,
    evidenceStateSnapshot,
  });
  const preferredSummary = input.preferredSummary || deterministicSummary;
  const summaryCheck = canonicalSummaryMatchesEvidence({
    summary: preferredSummary.insightSummary,
    estoniaEvidence,
    foreignRecentPoints,
    foreignClusters,
    predictedTargets,
    elurikkusRecentRecords,
  });
  if (!summaryCheck.ok) {
    console.error(`${LOG_PREFIX} canonical_summary_mismatch`, {
      speciesName: stringOr(chosen.speciesName),
      reasons: summaryCheck.reasons,
      insightSummary: preferredSummary.insightSummary,
      recentCount7d: estoniaEvidence.recentCount7d,
      recentCount30d: estoniaEvidence.recentCount30d,
      foreignRecentPoints: foreignRecentPoints.length,
      foreignClusters: foreignClusters.length,
      predictedTargets: predictedTargets.length,
    });
  }
  const summary = summaryCheck.ok ? preferredSummary : deterministicSummary;
  const summaryOrigin: SummaryOrigin = summaryCheck.ok && input.preferredSummary
    ? 'normalized_upstream'
    : 'deterministic_structured';
  return enforceCanonicalSummaryConsistency({
    speciesKey: stringOr(chosen.speciesKey, asRecord(chosen.species).speciesKey, asRecord(chosen.species).key),
    speciesName: stringOr(chosen.speciesName, asRecord(chosen.species).speciesName, asRecord(chosen.species).name),
    scope: stringOr(chosen.scope, 'linnuliigid'),
    generatedAt: stringOr(chosen.generatedAt) || new Date().toISOString(),
    analysisVersion: stringOr(chosen.analysisVersion) || `${EDGE_FUNCTION_VERSION}|canonical`,
    externalPressureScore: toNumber(chosen.externalPressureScore),
    species: asRecord(chosen.species),
    sourceHealth,
    countryScores: asRecord(chosen.countryScores),
    estoniaEvidence,
    evidenceSummary,
    foreignClusters,
    predictedTargets,
    topTarget: predictedTargets.length ? asRecord(predictedTargets[0]) : null,
    foreignRecentPoints,
    estoniaHistoryPoints,
    elurikkusRecentRecords,
    estoniaHistoryClusters,
    mapLayers: asRecord(chosen.mapLayers),
    mapLayersDefault: asRecord(chosen.mapLayersDefault),
    weather,
    evidenceState: evidenceStateSnapshot.evidenceState,
    hasUsableRecentEstoniaEvidence: evidenceStateSnapshot.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: evidenceStateSnapshot.hasUsableEstoniaHistory,
    hasUsableForeignPressure: evidenceStateSnapshot.hasUsableForeignPressure,
    hasUsablePredictedTargets: evidenceStateSnapshot.hasUsablePredictedTargets,
    hasOnlyWeather: evidenceStateSnapshot.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: evidenceStateSnapshot.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: evidenceStateSnapshot.activeEvidenceSources,
    availableSources: evidenceStateSnapshot.availableSources,
    attemptedButUnavailable: evidenceStateSnapshot.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: evidenceStateSnapshot.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: evidenceStateSnapshot.effectiveRankingMode,
    insightSummary: summary.insightSummary,
    confidenceNote: summary.confidenceNote,
    rankingNotes: summary.rankingNotes,
    warnings: summary.warnings,
    summaryGuardrailApplied: !summaryCheck.ok,
    summaryGuardrailReason: !summaryCheck.ok ? summaryCheck.reasons.join(',') : '',
    summaryOrigin,
    consistencyChecks: {
      routeLooksPlausible: true,
      timingLooksPlausible: true,
      weatherLooksSupportive: true,
      foreignPressureMatchesNarrative: true,
    },
    summaryRegeneratedFromStructuredEvidence: false,
    globalMigrationEtas,
  });
}

function computeEvidenceState(input: {
  estoniaEvidence: Record<string, unknown>;
  estoniaHistoryPoints: unknown[];
  estoniaHistoryClusters: unknown[];
  foreignRecentPoints: unknown[];
  foreignClusters: unknown[];
  foreignEvidence: Record<string, unknown>[];
  sourceHealth: Record<string, unknown>;
  weather: Record<string, unknown>;
  predictedTargets: unknown[];
  topPredictedPoints: unknown[];
}): EvidenceStateSnapshot {
  const freshestLocalities = Array.isArray(input.estoniaEvidence.freshestLocalities) ? input.estoniaEvidence.freshestLocalities : [];
  const hasUsableRecentEstoniaEvidence = toNumber(input.estoniaEvidence.recentCount7d) > 0
    || toNumber(input.estoniaEvidence.recentCount30d) > 0
    || Boolean(stringOr(input.estoniaEvidence.latestEstoniaDate))
    || freshestLocalities.length > 0;
  const hasUsableEstoniaHistory = input.estoniaHistoryClusters.length > 0 || input.estoniaHistoryPoints.length > 0;
  const totalForeignRecentPoints = Math.max(
    input.foreignRecentPoints.length,
    input.foreignEvidence.reduce((sumSoFar, entry) => (
      sumSoFar + Math.max(
        toNumber(entry.totalForeignRecentPoints),
        toNumber(entry.recordCount7d),
        toNumber(entry.recordCount30d),
        0,
      )
    ), 0),
  );
  const primaryCountries = Array.from(new Set(input.foreignEvidence.map((entry) => stringOr(entry.countryName, entry.countryCode)).filter(Boolean)));
  const hasUsableForeignPressure = input.foreignRecentPoints.length > 0
    || input.foreignClusters.length > 0
    || totalForeignRecentPoints > 0
    || primaryCountries.length > 0;
  const hasUsablePredictedTargets = input.predictedTargets.length > 0 || input.topPredictedPoints.length > 0;
  const hasWeather = Boolean(input.weather && (input.weather.weatherAvailable === true || stringOr(input.weather.fetchedAt)));
  const hasOnlyWeather = hasWeather
    && !hasUsableRecentEstoniaEvidence
    && !hasUsableEstoniaHistory
    && !hasUsableForeignPressure
    && !hasUsablePredictedTargets;
  const hasOnlySourceAvailabilityWithoutUsableEvidence = !hasUsableRecentEstoniaEvidence
    && !hasUsableEstoniaHistory
    && !hasUsableForeignPressure
    && (input.sourceHealth.elurikkusAvailable === true || input.sourceHealth.ebirdAvailable === true || input.sourceHealth.gbifAvailable === true);
  const availableSources: string[] = [];
  if (input.sourceHealth.elurikkusAvailable === true) availableSources.push('EELURIKKUS Estonia');
  if (input.sourceHealth.gbifAvailable === true) availableSources.push('GBIF Estonia');
  if (input.sourceHealth.ebirdAvailable === true) availableSources.push('eBird foreign');
  if (hasWeather) availableSources.push('Open-Meteo weather');
  const activeEvidenceSources: string[] = [];
  if (hasUsableRecentEstoniaEvidence || hasUsableEstoniaHistory) {
    if (input.sourceHealth.elurikkusAvailable === true) activeEvidenceSources.push('EELURIKKUS Estonia');
    else if (input.sourceHealth.gbifAvailable === true) activeEvidenceSources.push('GBIF Estonia');
  }
  if (hasUsableForeignPressure) activeEvidenceSources.push('eBird foreign');
  if (hasOnlyWeather) activeEvidenceSources.push('Open-Meteo weather');
  const attemptedButUnavailable: string[] = [];
  if (input.sourceHealth.ebirdAvailable === false) attemptedButUnavailable.push('eBird foreign');
  const attemptedButReturnedNoUsableEvidence: string[] = [];
  if (input.sourceHealth.elurikkusAvailable === true && !hasUsableRecentEstoniaEvidence && !hasUsableEstoniaHistory) {
    attemptedButReturnedNoUsableEvidence.push('EELURIKKUS Estonia');
  }
  let evidenceState: EvidenceState = 'insufficient';
  if (hasUsableRecentEstoniaEvidence && (hasUsableEstoniaHistory || hasUsableForeignPressure)) evidenceState = 'mixed';
  else if (hasUsableRecentEstoniaEvidence) evidenceState = 'recent_estonia';
  else if (hasUsableEstoniaHistory && hasUsableForeignPressure) evidenceState = 'mixed';
  else if (hasUsableEstoniaHistory) evidenceState = 'estonia_history';
  else if (hasUsableForeignPressure) evidenceState = 'foreign_pressure';
  else if (hasOnlyWeather) evidenceState = 'weather_only_insufficient';
  const effectiveRankingMode = evidenceState === 'recent_estonia'
    ? 'Recent Estonia evidence'
    : evidenceState === 'estonia_history'
      ? 'Estonia history'
      : evidenceState === 'foreign_pressure'
        ? 'Foreign pressure'
        : evidenceState === 'mixed'
          ? 'Mixed evidence'
          : evidenceState === 'weather_only_insufficient'
            ? 'Weather only (insufficient)'
            : 'Insufficient evidence';
  return {
    hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory,
    hasUsableForeignPressure,
    hasUsablePredictedTargets,
    hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources,
    availableSources,
    attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence,
    totalForeignRecentPoints,
    primaryCountries,
    effectiveRankingMode,
    evidenceState,
  };
}

function applyEvidenceStateSummaryGuardrails(
  response: NormalizedUpstreamResponse,
  evidenceStateSnapshot: EvidenceStateSnapshot,
): NormalizedUpstreamResponse {
  const summary = sanitizeSummaryFields({
    insightSummary: response.insightSummary,
    confidenceNote: response.confidenceNote,
    rankingNotes: response.rankingNotes,
    warnings: response.warnings,
    evidenceStateSnapshot,
  });
  return {
    ...response,
    insightSummary: summary.insightSummary,
    confidenceNote: summary.confidenceNote,
    rankingNotes: summary.rankingNotes,
    warnings: summary.warnings,
    evidenceState: evidenceStateSnapshot.evidenceState,
    hasUsableRecentEstoniaEvidence: evidenceStateSnapshot.hasUsableRecentEstoniaEvidence,
    hasUsableEstoniaHistory: evidenceStateSnapshot.hasUsableEstoniaHistory,
    hasUsableForeignPressure: evidenceStateSnapshot.hasUsableForeignPressure,
    hasUsablePredictedTargets: evidenceStateSnapshot.hasUsablePredictedTargets,
    hasOnlyWeather: evidenceStateSnapshot.hasOnlyWeather,
    hasOnlySourceAvailabilityWithoutUsableEvidence: evidenceStateSnapshot.hasOnlySourceAvailabilityWithoutUsableEvidence,
    activeEvidenceSources: evidenceStateSnapshot.activeEvidenceSources,
    availableSources: evidenceStateSnapshot.availableSources,
    attemptedButUnavailable: evidenceStateSnapshot.attemptedButUnavailable,
    attemptedButReturnedNoUsableEvidence: evidenceStateSnapshot.attemptedButReturnedNoUsableEvidence,
    effectiveRankingMode: evidenceStateSnapshot.effectiveRankingMode,
    summaryGuardrailApplied: summary.summaryGuardrailApplied,
    summaryGuardrailReason: summary.summaryGuardrailReason,
  };
}

function sanitizeSummaryFields(input: {
  insightSummary: string;
  confidenceNote: string;
  rankingNotes: string;
  warnings: string[];
  evidenceStateSnapshot: EvidenceStateSnapshot;
}): SummaryGuardrailResult {
  const originalAiSummarySnippet = [input.insightSummary, input.confidenceNote, input.rankingNotes]
    .filter(Boolean)
    .join(' ')
    .slice(0, 160);
  const disallowedPattern = /high confidence in the absence signal|high confidence absence|ranking is based mainly on estonia evidence|estonia history only|species absent|confirmed absence|no evidence of presence|immediate likelihood is low/i;
  const missingCoreText = !input.insightSummary.trim() || !input.confidenceNote.trim() || !input.rankingNotes.trim();
  const noHistoryButClaimed = !input.evidenceStateSnapshot.hasUsableEstoniaHistory && /estonia history|local historical ranking/i.test(input.rankingNotes);
  const noForeignButClaimed = !input.evidenceStateSnapshot.hasUsableForeignPressure && /foreign pressure/i.test(input.rankingNotes);
  const noTargets = !input.evidenceStateSnapshot.hasUsablePredictedTargets;
  const insufficientLikeState = input.evidenceStateSnapshot.evidenceState === 'insufficient' || input.evidenceStateSnapshot.evidenceState === 'weather_only_insufficient';
  const deterministicMissingEvidenceFallback = insufficientLikeState
    && !input.evidenceStateSnapshot.hasUsableRecentEstoniaEvidence
    && !input.evidenceStateSnapshot.hasUsableEstoniaHistory
    && !input.evidenceStateSnapshot.hasUsableForeignPressure
    && noTargets;
  const needsFallback = deterministicMissingEvidenceFallback
    || (
      insufficientLikeState
      && (
        disallowedPattern.test(`${input.insightSummary} ${input.confidenceNote} ${input.rankingNotes}`)
        || missingCoreText
        || noHistoryButClaimed
        || noForeignButClaimed
      )
    );
  if (needsFallback) {
    const reason = input.evidenceStateSnapshot.evidenceState === 'weather_only_insufficient'
      ? 'weather_only_insufficient_fallback'
      : 'insufficient_evidence_fallback';
    return {
      ...INSUFFICIENT_EVIDENCE_FALLBACK,
      warnings: [...INSUFFICIENT_EVIDENCE_FALLBACK.warnings],
      summaryGuardrailApplied: true,
      summaryGuardrailReason: deterministicMissingEvidenceFallback ? `${reason},missing_usable_prediction_evidence` : reason,
      originalAiSummarySnippet,
      finalAiSummarySnippet: INSUFFICIENT_EVIDENCE_FALLBACK.insightSummary.slice(0, 160),
    };
  }

  let insightSummary = replaceUnsafeSummaryPhrases(input.insightSummary, input.evidenceStateSnapshot.evidenceState);
  let confidenceNote = replaceUnsafeSummaryPhrases(input.confidenceNote, input.evidenceStateSnapshot.evidenceState);
  let rankingNotes = replaceUnsafeSummaryPhrases(input.rankingNotes, input.evidenceStateSnapshot.evidenceState);
  const warnings = new Set((input.warnings || []).map((item) => String(item || '').trim()).filter(Boolean));
  let summaryGuardrailApplied = false;
  const reasons: string[] = [];

  if (insufficientLikeState) {
    if (!confidenceNote || /high confidence|absence|absent/i.test(confidenceNote)) {
      confidenceNote = INSUFFICIENT_EVIDENCE_FALLBACK.confidenceNote;
      summaryGuardrailApplied = true;
      reasons.push('confidence_note_rewritten');
    }
    warnings.add('No usable recent Estonia evidence');
    if (!input.evidenceStateSnapshot.hasUsableEstoniaHistory) warnings.add('No usable Estonia history clusters');
    if (!input.evidenceStateSnapshot.hasUsableForeignPressure) warnings.add('No usable foreign pressure');
    if (noTargets) warnings.add('No predicted targets returned');
    if (input.evidenceStateSnapshot.hasOnlyWeather) warnings.add('Weather alone is insufficient for prediction');
  }
  if (!input.evidenceStateSnapshot.hasUsableEstoniaHistory && /estonia history|local historical ranking/i.test(rankingNotes)) {
    rankingNotes = 'Ranking was not supported by usable Estonia recent evidence, Estonia history, or foreign pressure.';
    summaryGuardrailApplied = true;
    reasons.push('history_claim_removed');
  }
  if (!input.evidenceStateSnapshot.hasUsableForeignPressure && /foreign pressure/i.test(rankingNotes)) {
    rankingNotes = rankingNotes.replace(/foreign pressure[^.]*\.?/ig, '').trim();
    rankingNotes = `${rankingNotes ? `${rankingNotes} ` : ''}No foreign pressure detected in provided data.`.trim();
    summaryGuardrailApplied = true;
    reasons.push('foreign_claim_softened');
  }
  if (!insightSummary) insightSummary = insufficientLikeState
    ? INSUFFICIENT_EVIDENCE_FALLBACK.insightSummary
    : 'No positive signal detected in the provided summary text.';
  if (!confidenceNote) confidenceNote = insufficientLikeState
    ? INSUFFICIENT_EVIDENCE_FALLBACK.confidenceNote
    : 'Confidence remains limited and should be interpreted with caution.';
  if (!rankingNotes) rankingNotes = insufficientLikeState
    ? INSUFFICIENT_EVIDENCE_FALLBACK.rankingNotes
    : 'Ranking reflects the provided evidence only.';

  return {
    insightSummary,
    confidenceNote,
    rankingNotes,
    warnings: Array.from(warnings),
    summaryGuardrailApplied,
    summaryGuardrailReason: reasons.join(','),
    originalAiSummarySnippet,
    finalAiSummarySnippet: insightSummary.slice(0, 160),
  };
}

function replaceUnsafeSummaryPhrases(value: string, evidenceState: EvidenceState): string {
  const insufficientLikeState = evidenceState === 'insufficient' || evidenceState === 'weather_only_insufficient';
  return String(value || '')
    .trim()
    .replace(/high confidence in the absence signal/ig, insufficientLikeState ? 'insufficient evidence in the current payload' : 'negative signal in the provided evidence')
    .replace(/high confidence absence/ig, insufficientLikeState ? 'insufficient evidence' : 'negative signal')
    .replace(/ranking is based mainly on estonia evidence/ig, insufficientLikeState ? 'no positive signal was detected in the available Estonia data' : 'ranking reflects the provided Estonia evidence')
    .replace(/estonia history only/ig, insufficientLikeState ? 'Estonia history was unavailable or empty in this payload' : 'Estonia history context')
    .replace(/no evidence of presence/ig, 'usable prediction evidence is currently missing')
    .replace(/immediate likelihood is low/ig, 'confidence is limited because usable evidence is missing')
    .replace(/species absent/ig, 'no positive signal detected')
    .replace(/confirmed absence/ig, insufficientLikeState ? 'insufficient evidence' : 'negative signal')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function determineRankingMode(hasForeignPressure: boolean, hasWeatherSupport: boolean): string {
  if (hasForeignPressure && hasWeatherSupport) return 'estonia_history_plus_foreign_plus_weather';
  if (hasForeignPressure) return 'estonia_history_plus_foreign';
  if (hasWeatherSupport) return 'estonia_history_plus_weather';
  return 'estonia_history_only';
}

function getConfidenceCapForRankingMode(rankingMode: string): number {
  if (rankingMode === 'estonia_history_plus_weather') return 0.78;
  if (rankingMode === 'estonia_history_plus_foreign') return 0.85;
  if (rankingMode === 'estonia_history_plus_foreign_plus_weather') return 0.90;
  return 0.70;
}

function historyScoreForDebug(cluster: { count: number; recentCount: number }): number {
  return clampInt(cluster.count * 7 + cluster.recentCount * 9, 10, 65);
}

function classifySpeciesEcology(speciesName: string): { mode: string; prefersCoast: boolean } {
  const value = normalizeComparableText(speciesName);
  if (/(kaur|loon|diver|aul|vaeras|sotkas|kajakas|tiir|hahk|part|meri|merisk|viires)/.test(value)) {
    return { mode: 'marine_coastal_waterbird', prefersCoast: true };
  }
  if (/(luik|hani|lagle|pütt|haigur|ruik|sookurg|ibis)/.test(value)) {
    return { mode: 'wetland_waterbird', prefersCoast: false };
  }
  if (/(kotkas|viu|loorkull|pistrik|kull)/.test(value)) {
    return { mode: 'raptor', prefersCoast: false };
  }
  return { mode: 'passerine_general', prefersCoast: false };
}

function scoreClusterEcology(
  cluster: { count: number; habitatCue?: string; habitatType?: string; coastalDistanceKm?: number; localityNames?: string[]; representativeLat?: number; representativeLon?: number },
  ecology: { mode: string; prefersCoast: boolean },
): { score: number; adjustedRanking: boolean; excluded: boolean; habitatCue: string } {
  const cue = stringOr(cluster.habitatCue, Array.isArray(cluster.localityNames) ? cluster.localityNames.join(' / ') : '', cluster.habitatType, 'Habitat uncertain');
  const coastalDistanceKm = toNumber(cluster.coastalDistanceKm);
  if (ecology.mode === 'marine_coastal_waterbird') {
    const coastalMatch = isCoastalCluster(cluster);
    const inlandWaterMatch = /\b(järv|veehoidla|paisjärv|laht)\b/i.test(cue);
    const inlandMismatch = !coastalMatch && coastalDistanceKm > 18 && !inlandWaterMatch;
    if (inlandMismatch && cluster.count < 4) {
      return { score: -48, adjustedRanking: true, excluded: true, habitatCue: cue || 'Unsuitable inland habitat' };
    }
    return {
      score: coastalMatch ? 40 : -38,
      adjustedRanking: !coastalMatch || coastalDistanceKm > 8,
      excluded: false,
      habitatCue: coastalMatch ? (cue || 'Coastal or open-water habitat') : (cue || 'Habitat uncertain away from coast'),
    };
  }
  if (ecology.mode === 'wetland_waterbird') {
    const waterMatch = /\b(järv|soo|raba|laht|laak|märgala|tiik|vee|rand)\b/i.test(cue);
    return { score: waterMatch ? 18 : 2, adjustedRanking: !waterMatch, excluded: false, habitatCue: cue || 'Wetland-associated habitat' };
  }
  return { score: 8, adjustedRanking: false, excluded: false, habitatCue: cue };
}

function sortPredictedConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

function weatherLooksAvailable(weather: Record<string, unknown>): boolean {
  return weather.weatherAvailable === true
    && weather.weatherPartial !== true
    && !!stringOr(weather.fetchedAt)
    && (toNumber(weather.windSpeedKph) > 0 || toNumber(weather.windDirectionDeg) > 0);
}

function computeCentroid(points: Record<string, unknown>[]): { lat: number; lon: number } {
  if (!points.length) return { lat: 0, lon: 0 };
  return {
    lat: roundCoord(sum(points.map((point) => toNumber(point.lat))) / points.length, 5),
    lon: roundCoord(sum(points.map((point) => toNumber(point.lon))) / points.length, 5),
  };
}

function selectRepresentativePoint(
  points: Record<string, unknown>[],
  centroid: { lat: number; lon: number },
  localityNames: string[],
  localityAliases: string[],
): { lat: number; lon: number; method: string; point?: Record<string, unknown>; locality?: string } {
  if (!points.length) return { lat: centroid.lat, lon: centroid.lon, method: 'centroid_fallback' };
  const preferredNames = [...localityNames, ...localityAliases].filter(Boolean);
  const namedHotspotPoint = preferredNames.length
    ? points.find((point) => {
      const locality = sanitizeDisplayLabel(stringOr(point.locality));
      return locality && preferredNames.some((name) => locality.includes(name) || name.includes(locality));
    })
    : null;
  if (namedHotspotPoint) {
    return {
      lat: toNumber(namedHotspotPoint.lat),
      lon: toNumber(namedHotspotPoint.lon),
      method: 'hotspot_coordinate',
      point: namedHotspotPoint,
      locality: sanitizeDisplayLabel(stringOr(namedHotspotPoint.locality, namedHotspotPoint.municipality)),
    };
  }
  const medoid = points
    .map((point) => ({
      point,
      totalDistance: sum(points.map((other) => haversineKm(toNumber(point.lat), toNumber(point.lon), toNumber(other.lat), toNumber(other.lon)))),
    }))
    .sort((left, right) => left.totalDistance - right.totalDistance)[0];
  if (medoid?.point) {
    return {
      lat: toNumber(medoid.point.lat),
      lon: toNumber(medoid.point.lon),
      method: 'medoid',
      point: medoid.point,
      locality: sanitizeDisplayLabel(stringOr(medoid.point.locality, medoid.point.municipality)),
    };
  }
  const nearest = points
    .map((point) => ({
      point,
      distance: haversineKm(toNumber(point.lat), toNumber(point.lon), centroid.lat, centroid.lon),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  if (nearest?.point) {
    return {
      lat: toNumber(nearest.point.lat),
      lon: toNumber(nearest.point.lon),
      method: 'nearest_real_point',
      point: nearest.point,
      locality: sanitizeDisplayLabel(stringOr(nearest.point.locality, nearest.point.municipality)),
    };
  }
  const weightedCentroid = computeWeightedCentroid(points);
  return { lat: weightedCentroid.lat, lon: weightedCentroid.lon, method: 'centroid_fallback' };
}

function collectCommonLocalityNames(points: Record<string, unknown>[]): string[] {
  const localities = points
    .map((point) => stringOr(point.locality))
    .map((value) => sanitizeDisplayLabel(value))
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const locality of localities) counts.set(locality, Number(counts.get(locality) || 0) + 1);
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([label]) => label);
}

function collectLocalityAliases(points: Record<string, unknown>[]): string[] {
  const aliases = points
    .map((point) => stringOr(point.locality))
    .flatMap((value) => value.split(/[;,]/g))
    .map((value) => sanitizeDisplayLabel(value))
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const alias of aliases) counts.set(alias, Number(counts.get(alias) || 0) + 1);
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([label]) => label);
}

function getLatestSupportingLocality(points: Record<string, unknown>[]): string {
  const latestPoint = [...points]
    .filter((point) => sanitizeDisplayLabel(stringOr(point.locality, point.municipality)))
    .sort((left, right) => Date.parse(stringOr(right.eventDate)) - Date.parse(stringOr(left.eventDate)))[0];
  return sanitizeDisplayLabel(stringOr(latestPoint?.locality, latestPoint?.municipality));
}

function getNearestNamedCoastalLocality(points: Record<string, unknown>[], lat: number, lon: number): string {
  const nearest = points
    .map((point) => ({
      locality: sanitizeDisplayLabel(stringOr(point.locality, point.municipality)),
      distanceKm: haversineKm(toNumber(point.lat), toNumber(point.lon), lat, lon),
    }))
    .filter((entry) => entry.locality && isLikelyCoastalLocality(entry.locality))
    .sort((left, right) => left.distanceKm - right.distanceKm)[0];
  return nearest?.locality || '';
}

function mostCommonValue(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, Number(counts.get(value) || 0) + 1);
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || '';
}

function buildDisplayClusterName(localityNames: string[], municipality: string): string {
  const cleaned = localityNames.map((value) => sanitizeDisplayLabel(value)).filter(Boolean);
  if (cleaned.length >= 2) return `${cleaned[0]} / ${cleaned[1]}`;
  if (cleaned.length === 1) return cleaned[0];
  return sanitizeDisplayLabel(municipality) || 'Estonia hotspot';
}

function buildTargetDisplayName(
  localityNames: string[],
  latestSupportingLocality: string,
  nearestNamedCoastalLocality: string,
  representativePoint: Record<string, unknown> | undefined,
  habitatType: string,
  municipality: string,
): { displayName: string; source: string } {
  const primaryLocality = sanitizeDisplayLabel(localityNames[0] || '');
  if (primaryLocality) return { displayName: primaryLocality, source: 'normalized_locality' };
  const latestLocality = sanitizeDisplayLabel(latestSupportingLocality);
  if (latestLocality) return { displayName: latestLocality, source: 'latest_supporting_locality' };
  const nearestCoastalLocality = sanitizeDisplayLabel(nearestNamedCoastalLocality);
  if (nearestCoastalLocality) return { displayName: nearestCoastalLocality, source: 'nearest_named_coastal_locality' };
  const representativeLocality = sanitizeDisplayLabel(stringOr(representativePoint?.locality, representativePoint?.municipality));
  if (representativeLocality) return { displayName: representativeLocality, source: 'representative_point_locality' };
  if (habitatType === 'coastal_open_water') return { displayName: 'Unnamed coastal cluster', source: 'fallback_label' };
  if (habitatType === 'wetland_inland_water') return { displayName: 'Unnamed inland cluster', source: 'fallback_label' };
  return { displayName: sanitizeDisplayLabel(municipality) || 'Unnamed inland cluster', source: 'fallback_label' };
}

function sanitizeDisplayLabel(value: string): string {
  const label = stringOr(value).replace(/\s+/g, ' ').trim();
  if (!label) return '';
  if (/^\d+(?:[d.,]\d+)?\s+\d+(?:[d.,]\d+)?$/i.test(label)) return '';
  if (/^\d{2}[d.,]\d+\s+\d{2}[d.,]\d+$/i.test(label)) return '';
  if (/^\d{2}[d.,]\d+\s+\d{2}[d.,]\d+.*$/i.test(label)) return '';
  if (/^\d+[a-z]?\d*\s+\d+[a-z]?\d*$/i.test(label)) return '';
  if (/^\d+[a-z]\d+\s+\d+[a-z]\d+$/i.test(label)) return '';
  if (/^ee-cluster-\d+$/i.test(label)) return '';
  if (/^cluster-\d+$/i.test(label)) return '';
  if (/^\d+(?::\d+)?$/.test(label)) return '';
  if (/^[a-z]{1,4}-?cluster-\d+$/i.test(label)) return '';
  if (/^[0-9]{2}[a-z]?[0-9]{2,}.*$/i.test(label)) return '';
  return label;
}

function isLikelyCoastalLocality(value: string): boolean {
  return /\b(rand|meri|laht|sadam|poolsaar|ranna|laid|neem|spithami|spithamn|poosaspea|põõsaspea|ristna|tagaranna|tahkuna|sorve|puise|kalana)\b/i.test(value);
}

function isCoastalCluster(cluster: { habitatType?: string; habitatCue?: string; coastalDistanceKm?: number; displayName?: string; locality?: string; latestSupportingLocality?: string; nearestNamedCoastalLocality?: string }): boolean {
  if (stringOr(cluster.habitatType) === 'coastal_open_water') return true;
  const labelText = stringOr(
    cluster.habitatCue,
    cluster.displayName,
    cluster.latestSupportingLocality,
    cluster.nearestNamedCoastalLocality,
    cluster.locality,
  );
  if (toNumber(cluster.coastalDistanceKm) <= 2) return true;
  if (toNumber(cluster.coastalDistanceKm) <= 5 && isLikelyCoastalLocality(labelText)) return true;
  return isLikelyCoastalLocality(labelText) && toNumber(cluster.coastalDistanceKm) <= 12;
}

function computeWeightedCentroid(points: Record<string, unknown>[]): { lat: number; lon: number } {
  if (!points.length) return { lat: 0, lon: 0 };
  const totalWeight = sum(points.map((point) => Math.max(1, toNumber(point.count) || 1)));
  return {
    lat: roundCoord(sum(points.map((point) => toNumber(point.lat) * Math.max(1, toNumber(point.count) || 1))) / totalWeight, 5),
    lon: roundCoord(sum(points.map((point) => toNumber(point.lon) * Math.max(1, toNumber(point.count) || 1))) / totalWeight, 5),
  };
}

function computeClusterTightnessKm(points: Record<string, unknown>[], lat: number, lon: number): number {
  if (!points.length) return 0;
  const distances = points.map((point) => haversineKm(toNumber(point.lat), toNumber(point.lon), lat, lon));
  return Number((sum(distances) / distances.length).toFixed(1));
}

function describeRepresentativeMethod(method: string, locality: string): string {
  if (method === 'hotspot_coordinate') return `Representative point uses a real named hotspot/locality coordinate at ${locality}.`;
  if (method === 'medoid') return `Representative point is the real supporting occurrence nearest the cluster medoid around ${locality}.`;
  if (method === 'nearest_real_point') return `Representative point is the nearest real supporting occurrence to the cluster center near ${locality}.`;
  return `Representative point falls back to the weighted centroid for this history cluster near ${locality}.`;
}

function inferHabitatFromCluster(
  points: Record<string, unknown>[],
  centroid: { lat: number; lon: number },
  localityNames: string[],
): { cue: string; type: string; score: number; coastalDistanceKm: number } {
  const text = normalizeComparableText(localityNames.join(' '));
  const coastalDistanceKm = estimateCoastalDistanceKm(centroid.lat, centroid.lon);
  if (/\b(rand|meri|laht|sadam|poolsaar|ranna|laid|neem|spithami|spithamn|poosaspea|põõsaspea|ristna|tagaranna|tahkuna|sorve|puise|kalana)\b/.test(text) || coastalDistanceKm <= 2) {
    return { cue: buildDisplayClusterName(localityNames, 'Coastal hotspot'), type: 'coastal_open_water', score: 28, coastalDistanceKm };
  }
  if (/\b(järv|veehoidla|paisj|tiik|märgala|soo|raba)\b/.test(text)) {
    return { cue: buildDisplayClusterName(localityNames, 'Wetland hotspot'), type: 'wetland_inland_water', score: 18, coastalDistanceKm };
  }
  return { cue: buildDisplayClusterName(localityNames, 'Habitat uncertain'), type: 'terrestrial_or_unknown', score: 4, coastalDistanceKm };
}

function estimateCoastalDistanceKm(lat: number, lon: number): number {
  const anchors = [
    { lat: 59.082, lon: 23.536 },
    { lat: 58.985, lon: 22.046 },
    { lat: 58.595, lon: 21.97 },
    { lat: 58.430, lon: 23.106 },
    { lat: 58.382, lon: 24.497 },
    { lat: 58.372, lon: 26.73 },
  ];
  return anchors.reduce((best, anchor) => Math.min(best, haversineKm(lat, lon, anchor.lat, anchor.lon)), Number.POSITIVE_INFINITY);
}

function normalizeComparableText(value: string): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function resolveClusterSource(sourceBreakdown: Record<string, number>): 'GBIF' | 'EELURIKKUS' | 'mixed' {
  const keys = Object.keys(sourceBreakdown).filter((key) => Number(sourceBreakdown[key] || 0) > 0);
  if (keys.length > 1) return 'mixed';
  if (keys[0] === 'EELURIKKUS') return 'EELURIKKUS';
  return 'GBIF';
}

function getEnabledForeignRegions(settings: Record<string, unknown>): Array<{ countryCode: string; countryName: string; regionCode: string; regionName: string }> {
  const all = [
    { enabled: settings.useFinlandContextOnly !== false, countryCode: 'fi', countryName: 'Finland', regionCode: 'FI', regionName: 'Finland' },
    { enabled: settings.useLatvia !== false, countryCode: 'lv', countryName: 'Latvia', regionCode: 'LV', regionName: 'Latvia' },
    { enabled: settings.useLithuania !== false, countryCode: 'lt', countryName: 'Lithuania', regionCode: 'LT', regionName: 'Lithuania' },
    { enabled: settings.usePoland !== false, countryCode: 'pl', countryName: 'Poland', regionCode: 'PL', regionName: 'Poland' },
    { enabled: settings.useBelarus !== false, countryCode: 'by', countryName: 'Belarus', regionCode: 'BY', regionName: 'Belarus' },
    { enabled: settings.useRussia !== false, countryCode: 'ru', countryName: 'Russia', regionCode: 'RU', regionName: 'Russia' },
  ];
  return all.filter((entry) => entry.enabled);
}

function daysAgoFromIso(value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86400000));
}

function distanceToEstonia(lat: number, lon: number): number {
  return Math.min(
    haversineKm(lat, lon, 59.437, 24.7536),
    haversineKm(lat, lon, 58.3776, 26.729),
    haversineKm(lat, lon, 58.3859, 24.4971),
  );
}

function isEstoniaCoords(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 57 && lat <= 60.5 && lon >= 21 && lon <= 29;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Number((2 * r * Math.asin(Math.sqrt(a))).toFixed(1));
}

function degToRad(value: number): number {
  return value * (Math.PI / 180);
}

function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(degToRad(lon2 - lon1)) * Math.cos(degToRad(lat2));
  const x = Math.cos(degToRad(lat1)) * Math.sin(degToRad(lat2))
    - Math.sin(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.cos(degToRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function destinationPoint(lat: number, lon: number, distanceKm: number, bearingDeg: number): { lat: number; lon: number } {
  const radiusKm = 6371;
  const bearing = degToRad(bearingDeg);
  const startLat = degToRad(lat);
  const startLon = degToRad(lon);
  const angularDistance = distanceKm / radiusKm;
  const endLat = Math.asin(
    Math.sin(startLat) * Math.cos(angularDistance)
      + Math.cos(startLat) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const endLon = startLon + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLat),
    Math.cos(angularDistance) - Math.sin(startLat) * Math.sin(endLat),
  );
  return { lat: Number((endLat * 180 / Math.PI).toFixed(4)), lon: Number((endLon * 180 / Math.PI).toFixed(4)) };
}

function computeAlignmentScore(cluster: Record<string, unknown>, hotspot: { lat: number; lon: number }, weather: Record<string, unknown>): number {
  const routeBearing = bearingBetween(toNumber(cluster.lat), toNumber(cluster.lon), hotspot.lat, hotspot.lon);
  const windBearing = toNumber(weather.windDirectionDeg);
  const delta = Math.abs((((routeBearing - windBearing) + 540) % 360) - 180);
  return clampInt(Math.round((180 - delta) / 4), 5, 45);
}

function computeWindSupport(weather: Record<string, unknown>): number {
  return clampInt(Math.round(Math.min(80, toNumber(weather.windSpeedKph) * 2 + (toNumber(weather.precipitationMm) > 1 ? -10 : 10))), 0, 100);
}

function bearingToCompass(value: number): string {
  const headings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return headings[Math.round((((value % 360) + 360) % 360) / 45) % 8];
}

function roundCoord(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function hasFiniteNumber(value: unknown): boolean {
  return Number.isFinite(Number(value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function joinCountries(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => String(item || '')).filter(Boolean).join(', ') : '';
}

function normalizeCountryCode(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  const mapping: Record<string, string> = {
    latvia: 'lv',
    lithuania: 'lt',
    belarus: 'by',
    poland: 'pl',
    russia: 'ru',
    finland: 'fi',
    estonia: 'ee',
    lv: 'lv',
    lt: 'lt',
    by: 'by',
    pl: 'pl',
    ru: 'ru',
    fi: 'fi',
    ee: 'ee',
  };
  return mapping[normalized] || normalized;
}

function resolveCountryName(countryCode: string): string {
  const mapping: Record<string, string> = {
    lv: 'Latvia',
    lt: 'Lithuania',
    by: 'Belarus',
    pl: 'Poland',
    ru: 'Russia',
    fi: 'Finland',
    ee: 'Estonia',
  };
  return mapping[countryCode] || countryCode.toUpperCase();
}

function normalizeDateString(value: string): string {
  const input = String(value || '').trim();
  if (!input) return '';
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : input;
}

function stringOr(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasNumber(value: unknown): boolean {
  return Number.isFinite(Number(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
