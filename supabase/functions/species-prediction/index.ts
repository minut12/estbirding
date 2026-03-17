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

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const webhookUrl = readWebhookUrl();
    const webhookConfigured = webhookUrl.length > 0;
    const timeoutMsUsed = resolveTimeoutMs();

    // ── GET ?mode=status ──
    if (req.method === 'GET' && url.searchParams.get('mode') === 'status') {
      console.info(`${LOG_PREFIX} status check`, { webhookConfigured, edgeFunctionVersion: EDGE_FUNCTION_VERSION });
      return json({
        ok: true,
        stage: 'status',
        available: true,
        deployed: true,
        configured: webhookConfigured,
        webhookConfigured,
        timeoutMsUsed,
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
        timestamp: new Date().toISOString(),
        message: webhookConfigured
          ? 'Prediction backend is deployed and configured'
          : 'Prediction backend is not configured yet',
      });
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

      if (job.status === 'completed' && job.result_json) {
        response.result = job.result_json;
      }
      if (job.status === 'failed' && job.error_json) {
        response.error = job.error_json;
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

    if (!webhookConfigured) {
      console.warn(`${LOG_PREFIX} webhook env missing`, { requestId, envKey: WEBHOOK_ENV_KEY });
      return json({
        ok: false,
        message: 'Prediction backend is not configured yet',
        requestId,
        stage: 'missing_webhook',
        edgeFunctionVersion: EDGE_FUNCTION_VERSION,
      }, 503);
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
  payload: Record<string, unknown>;
  speciesKey: string;
  speciesName: string;
  timeoutMsUsed: number;
  admin: ReturnType<typeof getSupabaseAdmin>;
}): Promise<void> {
  const { requestId, webhookUrl, payload, speciesKey, speciesName, timeoutMsUsed, admin } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMsUsed);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authHeader = (Deno.env.get(AUTH_HEADER_ENV_KEY) || '').trim();
    const authValue = (Deno.env.get(AUTH_VALUE_ENV_KEY) || '').trim();
    if (authHeader && authValue) headers[authHeader] = authValue;

    console.info(`${LOG_PREFIX} upstream_request_start`, { requestId, speciesKey });

    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error(`${LOG_PREFIX} upstream non-2xx`, { requestId, status: upstream.status });
      await admin.from('prediction_jobs').update({
        status: 'failed',
        error_json: { message: 'Upstream returned non-2xx', status: upstream.status, body: safeJsonParse(text) },
        updated_at: new Date().toISOString(),
      }).eq('request_id', requestId);
      return;
    }

    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      console.error(`${LOG_PREFIX} invalid upstream JSON`, { requestId });
      await admin.from('prediction_jobs').update({
        status: 'failed',
        error_json: { message: 'Invalid JSON from upstream', bodyPreview: text?.slice(0, 500) },
        updated_at: new Date().toISOString(),
      }).eq('request_id', requestId);
      return;
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      await admin.from('prediction_jobs').update({
        status: 'failed',
        error_json: { message: 'Upstream returned non-object response' },
        updated_at: new Date().toISOString(),
      }).eq('request_id', requestId);
      return;
    }

    const resultObj = enrichPredictionResult(data as Record<string, unknown>, payload);
    const analysisVersion = typeof resultObj.analysisVersion === 'string' ? resultObj.analysisVersion : null;
    const generatedAt = typeof resultObj.generatedAt === 'string' ? resultObj.generatedAt : new Date().toISOString();

    console.info(`${LOG_PREFIX} upstream_success`, {
      requestId,
      speciesKey,
      analysisVersion,
      generatedAt,
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
    const errorMessage = isAbort ? 'Prediction request timed out' : 'Prediction service upstream error';
    console.error(`${LOG_PREFIX} background_error`, { requestId, isAbort, error: String(err) });

    await admin.from('prediction_jobs').update({
      status: 'failed',
      error_json: { message: errorMessage, detail: String(err) },
      updated_at: new Date().toISOString(),
    }).eq('request_id', requestId).catch(() => {});
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

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text?.slice(0, 500) || '';
  }
}

function enrichPredictionResult(
  raw: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
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
  const existingWarnings = Array.isArray(raw.warnings) ? raw.warnings.map((item) => String(item || '').trim()).filter(Boolean) : [];

  return {
    ...raw,
    species: speciesInfo,
    sourceHealth,
    foreignEvidence,
    estoniaEvidence,
    historicalEvidence,
    rawLinks,
    topPredictedPoints,
    ...(rerankedTopPredictedPoints.length ? { rerankedTopPredictedPoints } : {}),
    warnings: Array.from(new Set([...existingWarnings, ...sourceWarnings])),
    rawResearchPayload: {
      ...rawResearchPayload,
      sourceHealth,
      foreignEvidence,
      estoniaEvidence,
      historicalEvidence,
      rawLinks,
    },
  };
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
  const primarySourceUsed = elurikkusAvailable ? 'Elurikkus' : (ebirdAvailable ? 'eBird' : (gbifFallbackUsed ? 'GBIF fallback' : 'Partial upstream payload'));
  if (!elurikkusAvailable) sourceWarnings.push('Elurikkus evidence is missing or incomplete for this run.');
  if (!ebirdAvailable) sourceWarnings.push('Foreign-country evidence is sparse or unavailable.');
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

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
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
