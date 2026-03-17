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
  payload: Record<string, unknown>;
  speciesKey: string;
  speciesName: string;
  timeoutMsUsed: number;
  admin: ReturnType<typeof getSupabaseAdmin>;
}): Promise<void> {
  const { requestId, webhookUrl, webhookConfigured, payload, speciesKey, speciesName, timeoutMsUsed, admin } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMsUsed);

  try {
    console.info(`${LOG_PREFIX} evidence_assembly_start`, { requestId, speciesKey });
    const resultObj = await buildMapFirstPredictionResult({
      payload,
      speciesKey,
      speciesName,
      webhookConfigured,
      webhookUrl,
      signal: controller.signal,
    });
    const analysisVersion = typeof resultObj.analysisVersion === 'string' ? resultObj.analysisVersion : null;
    const generatedAt = typeof resultObj.generatedAt === 'string' ? resultObj.generatedAt : new Date().toISOString();

    console.info(`${LOG_PREFIX} evidence_assembly_success`, {
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
    const errorMessage = isAbort ? 'Prediction request timed out' : 'Prediction service evidence assembly error';
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

async function buildMapFirstPredictionResult(opts: {
  payload: Record<string, unknown>;
  speciesKey: string;
  speciesName: string;
  webhookConfigured: boolean;
  webhookUrl: string;
  signal: AbortSignal;
}): Promise<Record<string, unknown>> {
  const { payload, speciesKey, speciesName, webhookConfigured, webhookUrl, signal } = opts;
  const payloadSpecies = asRecord(payload.species);
  const settings = asRecord(payload.settings);
  const ebirdSpeciesCode = stringOr(settings.ebirdSpeciesCodeOverride, payloadSpecies.ebirdSpeciesCode, payloadSpecies.ebirdSpeciesCodeOverride);
  const horizonDays = clampInt(toNumber(settings.horizonDays) || 7, 1, 30);

  const estoniaHistoryPoints = await fetchGbifEstoniaHistory(speciesName, signal);
  const foreignRecentPoints = ebirdSpeciesCode
    ? await fetchForeignRecentPoints(ebirdSpeciesCode, settings, signal)
    : [];
  const foreignClusters = clusterForeignRecentPoints(foreignRecentPoints);
  const weather = await fetchWeatherForPrediction(foreignClusters, signal);
  const estoniaEvidence = buildEstoniaEvidenceFromHistory(estoniaHistoryPoints);
  const historicalEvidence = buildHistoricalEvidenceFromHistory(estoniaHistoryPoints);
  const foreignEvidence = buildForeignEvidenceFromPointsAndClusters(foreignRecentPoints, foreignClusters);
  const predictedTargets = buildPredictedTargets({
    speciesName,
    estoniaHistoryPoints,
    foreignClusters,
    weather,
    estoniaEvidence,
    horizonDays,
  });
  const predictionVectors = buildPredictionVectors(foreignClusters, predictedTargets, weather, settings);
  const rawLinks = buildRawLinks(speciesName, foreignEvidence);
  const sourceHealth = buildSourceHealthMapFirst({
    estoniaHistoryPoints,
    foreignRecentPoints,
    foreignClusters,
    webhookConfigured,
  });
  const warnings = Array.from(new Set(sourceHealth.sourceWarnings as string[]));
  const aiSummary = webhookConfigured && (settings.enableOpenAISummary === true || settings.enableN8nResearch === true)
    ? await maybeFetchSecondarySummary({ webhookUrl, payload, signal, foreignEvidence, predictedTargets, weather, sourceHealth })
    : '';
  const countryScores = buildCountryScores(foreignEvidence);
  const topPredictedPoints = predictedTargets.slice(0, clampInt(toNumber(settings.outputCount) || 5, 1, 10));
  const latestCluster = foreignClusters[0] ?? null;

  return {
    speciesKey,
    speciesName,
    generatedAt: new Date().toISOString(),
    analysisVersion: `${EDGE_FUNCTION_VERSION}|map-first`,
    species: {
      speciesKey,
      speciesName,
      latinName: stringOr(payloadSpecies.latinName),
      ebirdSpeciesCode,
    },
    sourceHealth,
    estoniaHistoryPoints,
    foreignRecentPoints,
    foreignClusters,
    weather,
    predictionVectors,
    predictedTargets,
    mapLayers: {
      estoniaHistory: true,
      foreignEvidence: true,
      predictedLines: true,
      predictedCone: settings.showPredictionCone !== false,
      predictedTargets: true,
      recentOnly: settings.recentOnlyMapMarkers === true,
    },
    foreignEvidence,
    estoniaEvidence,
    historicalEvidence,
    rawLinks,
    externalPressureScore: clampInt(Math.round(sum(foreignEvidence.map((entry) => toNumber(entry.recordCount7d) * 4))), 0, 100),
    springFitScore: clampInt(estoniaHistoryPoints.length ? 78 : 42, 0, 100),
    windSupportScore: clampInt(Math.round(computeWindSupport(weather)), 0, 100),
    routeVector: latestCluster ? `${joinCountries(latestCluster.countryCodes)} -> Estonia` : 'Insufficient foreign evidence',
    bestEntryZone: topPredictedPoints[0]?.countyOrParish || topPredictedPoints[0]?.name || 'Unavailable',
    alreadyMissedRisk: estoniaEvidence.alreadyPresent ? 'medium' : 'low',
    countryScores,
    topPredictedPoints,
    warnings,
    ...(aiSummary ? { insightSummary: aiSummary, aiSummary } : {}),
    consistencyChecks: {
      routeLooksPlausible: predictionVectors.some((vector) => vector.kind === 'route'),
      timingLooksPlausible: foreignRecentPoints.some((point) => point.daysAgo <= 7),
      weatherLooksSupportive: computeWindSupport(weather) >= 45,
      foreignPressureMatchesNarrative: foreignClusters.length > 0,
    },
    rawResearchPayload: {
      request: {
        speciesKey,
        speciesName,
        latinName: stringOr(payloadSpecies.latinName),
        ebirdSpeciesCode,
      },
      normalizedSources: {
        estoniaHistoryPoints,
        foreignRecentPoints,
        foreignClusters,
        weather,
      },
      sourceHealth,
      foreignEvidence,
      estoniaEvidence,
      historicalEvidence,
      predictionVectors,
      predictedTargets,
      rawLinks,
      ...(aiSummary ? { aiSummary } : {}),
    },
  };
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
      if (!resp.ok) return [];
      const rows = await resp.json() as unknown[];
      return (Array.isArray(rows) ? rows : []).map((row) => {
        const item = asRecord(row);
        const obsDt = normalizeDateString(stringOr(item.obsDt, item.obsTime));
        return {
          lat: toNumber(item.lat),
          lon: toNumber(item.lng, item.lon),
          obsDt,
          locName: stringOr(item.locName),
          howMany: hasNumber(item.howMany) ? Math.round(toNumber(item.howMany)) : null,
          countryCode: entry.countryCode,
          countryName: entry.countryName,
          regionCode: entry.regionCode,
          regionName: entry.regionName,
          source: 'eBird',
          daysAgo: Math.max(0, daysAgoFromIso(obsDt) ?? 30),
          distanceToEstoniaKm: distanceToEstonia(toNumber(item.lat), toNumber(item.lng, item.lon)),
        };
      }).filter((point) => Number.isFinite(toNumber(point.lat)) && Number.isFinite(toNumber(point.lon)));
    } catch {
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
    return {
      fetchedAt: normalizeDateString(stringOr(current.time, new Date().toISOString())),
      windSpeedKph: toNumber(current.wind_speed_10m),
      windDirectionDeg,
      windDirectionLabel: bearingToCompass(windDirectionDeg),
      precipitationMm: toNumber(current.precipitation),
      temperatureC: toNumber(current.temperature_2m),
      source: 'Open-Meteo',
    };
  } catch {
    return {
      fetchedAt: new Date().toISOString(),
      windSpeedKph: 0,
      windDirectionDeg: 0,
      windDirectionLabel: 'N',
      precipitationMm: 0,
      source: 'Open-Meteo',
    };
  }
}

function buildEstoniaEvidenceFromHistory(points: Record<string, unknown>[]): Record<string, unknown> {
  const sorted = [...points].sort((left, right) => Date.parse(String(right.eventDate || '')) - Date.parse(String(left.eventDate || '')));
  const latest = sorted[0];
  const recentCount7d = points.filter((point) => toNumber(point.daysAgo) <= 7).length;
  const recentCount30d = points.filter((point) => toNumber(point.daysAgo) <= 30).length;
  return {
    recentCount7d,
    recentCount30d,
    latestEstoniaDate: latest ? stringOr(latest.eventDate) : '',
    latestEstoniaLat: latest ? toNumber(latest.lat) : null,
    latestEstoniaLon: latest ? toNumber(latest.lon) : null,
    alreadyPresent: recentCount7d > 0,
    alreadyPassed: false,
  };
}

function buildHistoricalEvidenceFromHistory(points: Record<string, unknown>[]): Record<string, unknown> {
  const hotspots = clusterEstoniaHistory(points)
    .slice(0, 6)
    .map((cluster, index) => ({
      rank: index + 1,
      name: cluster.label,
      countyOrParish: cluster.municipality,
      lat: cluster.lat,
      lon: cluster.lon,
      confidence: clampInt(40 + cluster.count * 6, 0, 100),
      eta: 'Historical hotspot',
      searchRadiusKm: 12,
      habitatCue: 'Historical occurrence density',
      reason: `${cluster.count} historical records in Estonia`,
    }));
  return {
    springWindow: points.some((point) => toNumber(point.daysAgo) <= 30) ? 'Active in recent historical window' : 'Historical Estonia context only',
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
  estoniaHistoryPoints: Record<string, unknown>[];
  foreignClusters: Record<string, unknown>[];
  weather: Record<string, unknown>;
  estoniaEvidence: Record<string, unknown>;
  horizonDays: number;
}): Record<string, unknown>[] {
  const { speciesName, estoniaHistoryPoints, foreignClusters, weather, estoniaEvidence, horizonDays } = opts;
  const hotspots = clusterEstoniaHistory(estoniaHistoryPoints);
  const usableHotspots = hotspots.length ? hotspots : buildFallbackEstoniaTargets();
  const supportingCountries = Array.from(new Set(foreignClusters.flatMap((cluster) => Array.isArray(cluster.countries) ? cluster.countries.map(String) : []))).slice(0, 4);
  const latestRelevantForeignDate = foreignClusters.map((cluster) => stringOr(cluster.newestObsDt)).filter(Boolean).sort().slice(-1)[0] || '';
  const nearestRelevantClusterKm = foreignClusters.length ? Math.min(...foreignClusters.map((cluster) => toNumber(cluster.nearestDistanceKm)).filter((value) => value > 0)) : null;
  return usableHotspots.slice(0, 5).map((hotspot, index) => {
    const routeAlignment = foreignClusters[0] ? computeAlignmentScore(foreignClusters[0], hotspot, weather) : 35;
    const historyScore = clampInt(hotspot.count * 10, 10, 60);
    const windBoost = clampInt(Math.round(computeWindSupport(weather) / 2), 0, 35);
    const confidence = clampInt(historyScore + routeAlignment + windBoost, 10, 99);
    const etaHours = Math.max(6, Math.round((toNumber(hotspot.distanceFromClusterKm) || 120) / Math.max(20, toNumber(weather.windSpeedKph) + 18)));
    return {
      rank: index + 1,
      name: hotspot.label,
      countyOrParish: hotspot.municipality,
      lat: hotspot.lat,
      lon: hotspot.lon,
      confidence,
      eta: `${Math.min(horizonDays, Math.max(1, Math.ceil(etaHours / 24)))}d / ~${etaHours}h`,
      searchRadiusKm: clampInt(10 + hotspot.count, 8, 30),
      habitatCue: 'Estonia hotspot density',
      reason: buildTargetReason(speciesName, hotspot, foreignClusters[0], weather),
      supportingCountries,
      ...(nearestRelevantClusterKm != null ? { nearestRelevantClusterKm: Number(nearestRelevantClusterKm.toFixed(1)) } : {}),
      ...(latestRelevantForeignDate ? { latestRelevantForeignDate } : {}),
      historicalMatch: `${hotspot.count} Estonia history points nearby`,
      estoniaPresenceSignal: estoniaEvidence.alreadyPresent === true ? 'recent_estonia_records' : 'history_only',
    };
  });
}

function buildPredictionVectors(
  foreignClusters: Record<string, unknown>[],
  predictedTargets: Record<string, unknown>[],
  weather: Record<string, unknown>,
  settings: Record<string, unknown>,
): Record<string, unknown>[] {
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
  webhookUrl: string;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  foreignEvidence: Record<string, unknown>[];
  predictedTargets: Record<string, unknown>[];
  weather: Record<string, unknown>;
  sourceHealth: Record<string, unknown>;
}): Promise<string> {
  const { webhookUrl, payload, signal, foreignEvidence, predictedTargets, weather, sourceHealth } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authHeader = (Deno.env.get(AUTH_HEADER_ENV_KEY) || '').trim();
  const authValue = (Deno.env.get(AUTH_VALUE_ENV_KEY) || '').trim();
  if (authHeader && authValue) headers[authHeader] = authValue;
  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        evidenceSummary: { sourceHealth, foreignEvidence, predictedTargets, weather },
      }),
      signal,
    });
    if (!upstream.ok) return '';
    const text = await upstream.text();
    const data = safeJsonParse(text);
    const record = asRecord(data);
    return stringOr(record.aiSummary, record.insightSummary, record.summary, asRecord(record.openaiAnalysis).insightSummary);
  } catch {
    return '';
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

function buildSourceHealthMapFirst(input: {
  estoniaHistoryPoints: Record<string, unknown>[];
  foreignRecentPoints: Record<string, unknown>[];
  foreignClusters: Record<string, unknown>[];
  webhookConfigured: boolean;
}): Record<string, unknown> {
  const warnings: string[] = [];
  if (!input.estoniaHistoryPoints.length) warnings.push('GBIF Estonia history returned no coordinate-backed points.');
  if (!input.foreignRecentPoints.length) warnings.push('Foreign eBird evidence is sparse or unavailable.');
  if (!input.foreignClusters.length) warnings.push('No foreign-country clusters were available to display.');
  if (!input.webhookConfigured) warnings.push('Secondary AI summary is unavailable because no webhook is configured.');
  return {
    primarySourceUsed: input.estoniaHistoryPoints.length ? 'GBIF + eBird + Open-Meteo' : 'eBird + Open-Meteo',
    sourceWarnings: warnings,
    elurikkusAvailable: false,
    ebirdAvailable: input.foreignRecentPoints.length > 0,
    gbifFallbackUsed: false,
  };
}

function clusterEstoniaHistory(points: Record<string, unknown>[]): Array<{
  lat: number;
  lon: number;
  count: number;
  label: string;
  municipality: string;
  distanceFromClusterKm: number;
}> {
  const grouped = new Map<string, { lat: number; lon: number; count: number; locality: string; municipality: string }>();
  for (const point of points) {
    const lat = toNumber(point.lat);
    const lon = toNumber(point.lon);
    const bucket = `${roundCoord(lat, 1)}:${roundCoord(lon, 1)}`;
    if (!grouped.has(bucket)) {
      grouped.set(bucket, {
        lat: roundCoord(lat, 2),
        lon: roundCoord(lon, 2),
        count: 0,
        locality: stringOr(point.locality, point.municipality, 'Estonia hotspot'),
        municipality: stringOr(point.municipality, point.locality, 'Estonia'),
      });
    }
    grouped.get(bucket)!.count += 1;
  }
  return Array.from(grouped.values()).map((cluster) => ({
    lat: cluster.lat,
    lon: cluster.lon,
    count: cluster.count,
    label: cluster.locality,
    municipality: cluster.municipality,
    distanceFromClusterKm: distanceToEstonia(cluster.lat, cluster.lon),
  })).sort((left, right) => right.count - left.count);
}

function buildFallbackEstoniaTargets(): Array<{ lat: number; lon: number; count: number; label: string; municipality: string; distanceFromClusterKm: number }> {
  return [
    { lat: 59.45, lon: 24.75, count: 4, label: 'Tallinn coast', municipality: 'Harjumaa', distanceFromClusterKm: 110 },
    { lat: 58.38, lon: 24.5, count: 3, label: 'Parnu coast', municipality: 'Parnumaa', distanceFromClusterKm: 95 },
    { lat: 58.95, lon: 23.53, count: 3, label: 'Haapsalu bay', municipality: 'Laanemaa', distanceFromClusterKm: 88 },
    { lat: 58.25, lon: 22.48, count: 2, label: 'Saaremaa west coast', municipality: 'Saaremaa', distanceFromClusterKm: 130 },
    { lat: 58.55, lon: 27.12, count: 2, label: 'Lake Peipsi edge', municipality: 'Tartumaa', distanceFromClusterKm: 120 },
  ];
}

function buildTargetReason(
  speciesName: string,
  hotspot: { count: number; label: string; municipality: string },
  cluster: Record<string, unknown> | undefined,
  weather: Record<string, unknown>,
): string {
  const countries = cluster && Array.isArray(cluster.countries) ? cluster.countries.join(', ') : 'nearby foreign evidence';
  const windText = `${bearingToCompass(toNumber(weather.windDirectionDeg))} ${Math.round(toNumber(weather.windSpeedKph))} km/h`;
  return `${speciesName} has fresh movement from ${countries}, this Estonia hotspot has ${hotspot.count} historical records, and current wind (${windText}) supports the route.`;
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
