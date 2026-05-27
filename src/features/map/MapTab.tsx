import { maps, getActiveMap } from './config';
import { getAllowedMapsForRole, resolveAllowedMapSelection } from './access';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';
import { fetchSharedAvatars, getMergedAvatars, notifyIframe } from '@/lib/avatar-storage';
import { LINNULIIGID_SCOPE, RARILIIN_SCOPE, USA_CO_SCOPE, USA_PA_SCOPE, USA_I70_SCOPE, SPECIES_SCOPES, type SpeciesScopeConfig, type SpeciesScopeId } from '@/lib/mapScope';
import { resolveProxyBase } from '@/config/proxyEndpoint';
import { buildSpeciesMetaLookupFallback, getScopedSpeciesMeta, loadSpeciesMeta, seedSpeciesMetaFallback, upsertSpeciesMeta } from '@/lib/speciesMeta';
import { refreshSpeciesMetaFromCloud, saveSpeciesMetaToCloud, downloadSpeciesMetaJson, uploadSpeciesMetaJson } from '@/lib/speciesMetaCloud';
import { loadCustomSpecies } from '@/lib/customSpecies';
import { refreshCustomSpeciesFromCloud } from '@/lib/customSpeciesCloud';
import { addDiscoveredSpeciesBatch } from '@/lib/discoveredSpecies';
import { broadcastSupabaseConfigToMapIframes, getSupabaseAnonKey, getSupabaseUrl, isDeveloperModeEnabled, validateSupabaseConfig } from '@/config/supabaseConfig';
import { useAuth } from '@/features/auth/AuthContext';
import { PERMISSIONS } from '@/features/auth/permissions';
import { type MapScope, loadSpeciesVisibility, saveSpeciesVisibility, loadLocalHidden } from '@/lib/speciesVisibility';
import { getSpeciesScopeByMapId, SPECIES_PREDICTION_EVENT_TYPES, type SpeciesPredictionRequestPayload } from '@/lib/speciesPrediction';
import { loadSpeciesPredictionSettings } from '@/lib/speciesPredictionSettings';
import { runSpeciesPredictionRequest } from '@/lib/speciesPredictionRunner';
import { isSpeciesPredictionEnabled } from '@/lib/settings';
import { ACTIVE_PREDICTION_IFRAME_READY_MESSAGE, ACTIVE_PREDICTION_SPECIES_EVENT, ACTIVE_PREDICTION_SPECIES_MESSAGE, getActivePredictionSpecies, setActivePredictionSpecies, type ActivePredictionSpecies } from '@/lib/activePredictionSpecies';
import { normalizeSpeciesName } from '@/lib/textNormalize';
import { runBundledSpeciesBackfill } from '@/lib/speciesMetaBackfill';
import { log } from '@/lib/eventLog';
import { toast } from 'sonner';
import {
  SPECIES_PREDICTION_DEBUG_PANEL_STATE_MESSAGE,
  SPECIES_PREDICTION_DEBUG_RESYNC_EVENT,
  SPECIES_PREDICTION_DEBUG_RERUN_EVENT,
  getSpeciesPredictionDebugSnapshot,
  setSpeciesPredictionDebugBackendResponse,
  setSpeciesPredictionDebugPanelPayload,
  setSpeciesPredictionDebugPanelState,
  setSpeciesPredictionTransportError,
  updateSpeciesPredictionTransport,
  updateSpeciesPredictionDebugContext,
} from '@/lib/speciesPredictionDebug';

const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const MAP_ID_TO_SCOPE: Record<string, MapScope> = {
  'linnuliigid-ee': 'ee_map',
  'europe': 'europe_map',
  'rariliin': 'rariliin_map',
  'usa-co': 'usa_co_map',
  'usa-pa': 'usa_pa_map',
  'usa-i70': 'usa_i70_map',
};

const SCOPE_BY_MAP_ID: Record<string, SpeciesScopeConfig> = {
  'linnuliigid-ee': LINNULIIGID_SCOPE,
  'europe': LINNULIIGID_SCOPE, // intentional: Europe shares meta with EE
  'rariliin': RARILIIN_SCOPE,
  'usa-co': USA_CO_SCOPE,
  'usa-pa': USA_PA_SCOPE,
  'usa-i70': USA_I70_SCOPE,
};

interface MapTabProps {
  isActive?: boolean;
  onMapChange?: (mapId: string) => void;
}

export default function MapTab({ isActive = true, onMapChange }: MapTabProps) {
  const { user, isAdmin, hasPermission, role, permissions } = useAuth();
  const availableMaps = useMemo(() => (
    getAllowedMapsForRole(role, permissions, maps)
  ), [permissions, role]);
  const initialMap = useMemo(
    () => resolveAllowedMapSelection({ role, permissions, maps, requestedId: getActiveMap().id }) ?? getActiveMap(),
    [permissions, role],
  );
  const [selectedId, setSelectedId] = useState(initialMap.id);
  const fallbackMap = resolveAllowedMapSelection({ role, permissions, maps, requestedId: selectedId }) ?? availableMaps[0] ?? getActiveMap();
  const current = availableMaps.find((m) => m.id === selectedId) ?? fallbackMap;
  const mapScope = MAP_ID_TO_SCOPE[current.id] as MapScope | undefined;
  const speciesScope = SCOPE_BY_MAP_ID[current.id] ?? LINNULIIGID_SCOPE;
  const canEditKevadranne = isAdmin || hasPermission(PERMISSIONS.kevadranneEdit);
  const speciesPredictionRuntimeMarker = `${APP_VERSION}|panel-runtime-fix001`;
  const iframeSrc = useMemo(() => {
    const proxyBase = resolveProxyBase();
    const params = new URLSearchParams();
    params.set('v', APP_VERSION);
    params.set('spv', speciesPredictionRuntimeMarker);
    if (proxyBase) params.set('proxyBase', proxyBase);
    const sep = current.source.includes('?') ? '&' : '?';
    return `${current.source}${sep}${params.toString()}`;
  }, [current.source, speciesPredictionRuntimeMarker]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeReadyRef = useRef(false);
  const iframePredictionReadyRef = useRef(false);
  const iframePredictionStartupGuardRef = useRef<{ active: boolean; speciesName: string }>({ active: false, speciesName: '' });
  const latestPredictionRequestRef = useRef(0);
  const lastAutoRefreshRef = useRef(0);
  const activePredictionSpecies = useMemo(() => {
    const scopeCfg = getSpeciesScopeByMapId(current.id);
    return scopeCfg ? getActivePredictionSpecies(scopeCfg.id) : null;
  }, [current.id]);
  const iframeSyncKey = `${current.id}:${activePredictionSpecies?.scope || 'none'}:${activePredictionSpecies?.speciesKey || 'none'}`;

  useEffect(() => {
    onMapChange?.(selectedId);
  }, [onMapChange, selectedId]);

  useEffect(() => {
    console.debug('[speciesPrediction] iframe runtime src', {
      mapId: current.id,
      source: current.source,
      iframeSrc,
      runtimeMarker: speciesPredictionRuntimeMarker,
    });
    updateSpeciesPredictionDebugContext({
      mapScope: getSpeciesScopeByMapId(current.id)?.id || '',
      panelRuntimeMarker: `${current.id} | ${speciesPredictionRuntimeMarker}`,
    });
  }, [current.id, current.source, iframeSrc, speciesPredictionRuntimeMarker]);

  useEffect(() => {
    const resolved = resolveAllowedMapSelection({ role, permissions, maps, requestedId: selectedId });
    if (resolved && resolved.id !== selectedId) {
      setSelectedId(resolved.id);
    }
  }, [permissions, role, selectedId]);

  // Send a postMessage to the iframe (safe wrapper)
  const sendToIframe = useCallback((msg: Record<string, unknown>) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(msg, '*');
    } catch (e) { /* cross-origin safety */ }
  }, []);

  // Send MAP_SHOWN to iframe so Leaflet can invalidateSize
  const sendMapShown = useCallback(() => sendToIframe({ type: 'MAP_SHOWN' }), [sendToIframe]);

  // Send MAP_REFRESH_VISIBLE to iframe
  const sendRefreshVisible = useCallback(() => {
    if (!iframeReadyRef.current) return;
    sendToIframe({ type: 'MAP_REFRESH_VISIBLE' });
  }, [sendToIframe]);

  // Send APP_INSETS to iframe so it can adjust layout for parent header/nav
  const sendAppInsets = useCallback(() => {
    try {
      const headerEl = document.querySelector('.shrink-0');
      const navEl = document.querySelector('nav.border-t');
      const bottomNavPx = navEl ? navEl.getBoundingClientRect().height : 56;
      sendToIframe({
        type: 'APP_INSETS',
        headerPx: 0,
        bottomNavPx,
      });
    } catch (e) { /* cross-origin safety */ }
  }, [sendToIframe]);

  // Admin key no longer needed for refresh

  // Send shared avatars to iframe
  const sendAvatarsToIframe = useCallback(() => {
    const avatars = getMergedAvatars(speciesScope);
    notifyIframe(avatars, speciesScope);
  }, [speciesScope]);
  const sendSpeciesMetaToIframe = useCallback(() => {
    sendToIframe({ type: 'SPECIES_META_DEFAULTS', speciesMeta: loadSpeciesMeta(speciesScope) });
  }, [sendToIframe, speciesScope]);
  const sendCustomSpeciesToIframe = useCallback(() => {
    sendToIframe({ type: 'CUSTOM_SPECIES_DEFAULTS', customSpecies: loadCustomSpecies() });
  }, [sendToIframe]);
  const seedScopeMetadata = useCallback(async () => {
    if (!speciesScope.speciesMetaAssetPath) return;
    try {
      const res = await fetch(speciesScope.speciesMetaAssetPath);
      if (!res.ok) return;
      const items = await res.json();
      const seeded = seedSpeciesMetaFallback(buildSpeciesMetaLookupFallback(items), speciesScope);
      if (seeded.changed) {
        window.dispatchEvent(new CustomEvent('species-meta-updated'));
      }
    } catch {
      // ignore metadata asset fetch issues and keep current local/cloud state
    }
  }, [speciesScope]);
  const sendSupabaseConfigToIframe = useCallback(() => {
    const validation = validateSupabaseConfig();
    if (validation.ok) {
      sendToIframe({
        type: 'SUPABASE_CONFIG',
        supabaseUrl: getSupabaseUrl(),
        supabaseAnonKey: getSupabaseAnonKey(),
      });
      return;
    }
    sendToIframe({
      type: 'SUPABASE_CONFIG',
      supabaseUrl: '',
      supabaseAnonKey: '',
    });
    sendToIframe({
      type: 'SUPABASE_CONFIG_ERROR',
      error: validation.error || 'Supabase config invalid',
    });
  }, [sendToIframe]);
  const sendPermissionsToIframe = useCallback(() => {
    sendToIframe({
      type: 'APP_PERMISSIONS',
      permissions: {
        kevadranneEdit: canEditKevadranne,
      },
    });
  }, [canEditKevadranne, sendToIframe]);
  const sendFeatureFlagsToIframe = useCallback(() => {
    sendToIframe({
      type: 'APP_FEATURE_FLAGS',
      flags: {
        speciesPredictionEnabled: isSpeciesPredictionEnabled(),
      },
    });
  }, [sendToIframe]);
  const sendActivePredictionSpeciesToIframe = useCallback((species: ActivePredictionSpecies | null) => {
    if (!species || !iframePredictionReadyRef.current) return;
    sendToIframe({
      type: ACTIVE_PREDICTION_SPECIES_MESSAGE,
      scope: species.scope,
      speciesName: species.speciesName,
      speciesKey: species.speciesKey,
    });
  }, [sendToIframe]);
  const sendPredictionContextToIframe = useCallback((scopeCfg: ReturnType<typeof getSpeciesScopeByMapId>, speciesName: string, speciesKey: string) => {
    if (!scopeCfg || !speciesName || !speciesKey || !iframePredictionReadyRef.current) return;
    loadSpeciesPredictionSettings(scopeCfg.id, speciesName)
      .then((settings) => {
        console.debug('[speciesPrediction] parent -> iframe context', { scope: scopeCfg.id, speciesName, speciesKey });
        sendToIframe({
          type: SPECIES_PREDICTION_EVENT_TYPES.context,
          scope: scopeCfg.id,
          speciesName,
          speciesKey,
          settings,
        });
      })
      .catch(() => {
        sendToIframe({
          type: SPECIES_PREDICTION_EVENT_TYPES.error,
          error: 'Species prediction settings could not be loaded',
        });
      });
  }, [sendToIframe]);

  // === Species visibility persistence ===
  const sendSpeciesVisibilityToIframe = useCallback((hidden: Set<string>) => {
    console.log(`[prefs] scope=${mapScope} sending SPECIES_VISIBILITY_RESTORE hiddenCount=${hidden.size}`, [...hidden].slice(0, 3));
    sendToIframe({
      type: 'SPECIES_VISIBILITY_RESTORE',
      hiddenSpecies: [...hidden],
    });
  }, [sendToIframe, mapScope]);

  // On map load or user change, restore species visibility
  useEffect(() => {
    if (!user?.id || !mapScope || !iframeReadyRef.current) return;
    console.log(`[prefs] scope=${mapScope} user=${user.id.slice(0,8)} restoring visibility...`);
    // Immediately send local cache for fast render
    const localHidden = loadLocalHidden(mapScope, user.id);
    if (localHidden.size > 0) {
      console.log(`[prefs] scope=${mapScope} local cache has ${localHidden.size} hidden species`);
      sendSpeciesVisibilityToIframe(localHidden);
    }
    // Then load from cloud and reconcile
    loadSpeciesVisibility(mapScope, user.id).then((cloudHidden) => {
      console.log(`[prefs] scope=${mapScope} cloud has ${cloudHidden.size} hidden species`);
      sendSpeciesVisibilityToIframe(cloudHidden);
    });
  }, [user?.id, mapScope, sendSpeciesVisibilityToIframe]);

  // Fetch shared avatars on mount, cache locally, then send to iframe
  useEffect(() => {
    const t0 = setTimeout(sendAvatarsToIframe, 600);
    fetchSharedAvatars(speciesScope).then(() => {
      sendAvatarsToIframe();
    });
    seedScopeMetadata()
      .then(() => refreshSpeciesMetaFromCloud({ force: true, scope: speciesScope }))
      .then(() => seedScopeMetadata())
      .then(() => sendSpeciesMetaToIframe())
      .catch(() => {
        sendSpeciesMetaToIframe();
      });
    refreshCustomSpeciesFromCloud({ force: true })
      .then(() => sendCustomSpeciesToIframe())
      .catch(() => sendCustomSpeciesToIframe());
    return () => clearTimeout(t0);
  }, [seedScopeMetadata, sendAvatarsToIframe, sendSpeciesMetaToIframe, sendCustomSpeciesToIframe, speciesScope]);

  // Listen for AVATARS_REQUEST and INSETS_REQUEST from iframe
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === 'AVATARS_REQUEST') {
        sendAvatarsToIframe();
      }
      if (ev.data?.type === 'SPECIES_META_REQUEST') {
        sendSpeciesMetaToIframe();
      }
      if (ev.data?.type === 'CUSTOM_SPECIES_REQUEST') {
        sendCustomSpeciesToIframe();
      }
      if (ev.data?.type === 'INSETS_REQUEST') {
        sendAppInsets();
      }
      if (ev.data?.type === 'NOTIFY_SPECIES_CHANGED' && ev.data?.species && typeof ev.data?.notify === 'boolean') {
        const speciesName = String(ev.data.species);
        const notify = ev.data.notify as boolean;
        upsertSpeciesMeta(speciesName, { notify });
        log('🔔 ' + speciesName + (notify ? ' ON' : ' OFF'));
        saveSpeciesMetaToCloud(speciesName, { notify })
          .then(() => {
            console.log('[notify-sync] Cloud updated:', speciesName, notify);
            log('☁️ ' + speciesName + ' synced');
          })
          .catch((e: any) => {
            console.warn('[notify-sync] Cloud sync failed:', e);
            log('❌ sync fail: ' + String(e));
          });
      }
      if (ev.data?.type === 'LOG_EVENT' && ev.data?.msg) {
        log(String(ev.data.msg));
      }
      if (ev.data?.type === 'SUPABASE_CONFIG_REQUEST') {
        const validation = validateSupabaseConfig();
        if (validation.ok) {
          sendToIframe({
            type: 'SUPABASE_CONFIG',
            supabaseUrl: getSupabaseUrl(),
            supabaseAnonKey: getSupabaseAnonKey(),
          });
        } else {
          sendToIframe({
            type: 'SUPABASE_CONFIG',
            supabaseUrl: '',
            supabaseAnonKey: '',
          });
          sendToIframe({
            type: 'SUPABASE_CONFIG_ERROR',
            error: validation.error || 'Supabase config invalid',
          });
        }
      }
      if (ev.data?.type === ACTIVE_PREDICTION_IFRAME_READY_MESSAGE) {
        iframePredictionReadyRef.current = true;
        const scopeCfg = getSpeciesScopeByMapId(current.id);
        if (!scopeCfg) return;
        const species = getActivePredictionSpecies(scopeCfg.id);
        iframePredictionStartupGuardRef.current = {
          active: Boolean(species?.speciesName),
          speciesName: species?.speciesName || '',
        };
        if (species) {
          sendActivePredictionSpeciesToIframe(species);
          if (isSpeciesPredictionEnabled()) {
            sendPredictionContextToIframe(scopeCfg, species.speciesName, species.speciesKey);
          }
        }
      }
        if (ev.data?.type === SPECIES_PREDICTION_DEBUG_PANEL_STATE_MESSAGE) {
          setSpeciesPredictionDebugPanelState({
            speciesName: typeof ev.data.speciesName === 'string' ? ev.data.speciesName : '',
            speciesKey: typeof ev.data.speciesKey === 'string' ? ev.data.speciesKey : '',
            scope: typeof ev.data.scope === 'string' ? ev.data.scope : '',
            generatedAt: typeof ev.data.generatedAt === 'string' ? ev.data.generatedAt : '',
            analysisVersion: typeof ev.data.analysisVersion === 'string' ? ev.data.analysisVersion : '',
            insightSummary: typeof ev.data.insightSummary === 'string' ? ev.data.insightSummary : '',
            externalPressureScore: typeof ev.data.externalPressureScore === 'number' ? ev.data.externalPressureScore : undefined,
            countryScores: ev.data.countryScores && typeof ev.data.countryScores === 'object' ? ev.data.countryScores as Record<string, unknown> : undefined,
            topPredictedPoints: Array.isArray(ev.data.topPredictedPoints) ? ev.data.topPredictedPoints : [],
            sourceHealth: ev.data.sourceHealth && typeof ev.data.sourceHealth === 'object' ? ev.data.sourceHealth as Record<string, unknown> : undefined,
            foreignEvidence: Array.isArray(ev.data.foreignEvidence) ? ev.data.foreignEvidence : [],
            estoniaEvidence: ev.data.estoniaEvidence && typeof ev.data.estoniaEvidence === 'object' ? ev.data.estoniaEvidence as Record<string, unknown> : undefined,
            historicalEvidence: ev.data.historicalEvidence && typeof ev.data.historicalEvidence === 'object' ? ev.data.historicalEvidence as Record<string, unknown> : undefined,
            evidenceState: typeof ev.data.evidenceState === 'string' ? ev.data.evidenceState : '',
            hasUsableRecentEstoniaEvidence: typeof ev.data.hasUsableRecentEstoniaEvidence === 'boolean' ? ev.data.hasUsableRecentEstoniaEvidence : undefined,
            hasUsableEstoniaHistory: typeof ev.data.hasUsableEstoniaHistory === 'boolean' ? ev.data.hasUsableEstoniaHistory : undefined,
            hasUsableForeignPressure: typeof ev.data.hasUsableForeignPressure === 'boolean' ? ev.data.hasUsableForeignPressure : undefined,
            hasUsablePredictedTargets: typeof ev.data.hasUsablePredictedTargets === 'boolean' ? ev.data.hasUsablePredictedTargets : undefined,
            hasOnlyWeather: typeof ev.data.hasOnlyWeather === 'boolean' ? ev.data.hasOnlyWeather : undefined,
            activeEvidenceSources: Array.isArray(ev.data.activeEvidenceSources) ? ev.data.activeEvidenceSources : [],
            availableSources: Array.isArray(ev.data.availableSources) ? ev.data.availableSources : [],
            attemptedButUnavailable: Array.isArray(ev.data.attemptedButUnavailable) ? ev.data.attemptedButUnavailable : [],
            attemptedButReturnedNoUsableEvidence: Array.isArray(ev.data.attemptedButReturnedNoUsableEvidence) ? ev.data.attemptedButReturnedNoUsableEvidence : [],
            effectiveRankingMode: typeof ev.data.effectiveRankingMode === 'string' ? ev.data.effectiveRankingMode : '',
            summaryGuardrailApplied: typeof ev.data.summaryGuardrailApplied === 'boolean' ? ev.data.summaryGuardrailApplied : undefined,
            summaryGuardrailReason: typeof ev.data.summaryGuardrailReason === 'string' ? ev.data.summaryGuardrailReason : '',
            runtimeMarker: typeof ev.data.runtimeMarker === 'string' ? ev.data.runtimeMarker : '',
          });
        }
      // Species visibility changed from iframe
      if (ev.data?.type === 'SPECIES_VISIBILITY_CHANGED' && user?.id && mapScope) {
        const { speciesKey, isHidden } = ev.data;
        if (typeof speciesKey === 'string' && typeof isHidden === 'boolean') {
          console.log(`[prefs] scope=${mapScope} user=${user.id.slice(0,8)} save species=${speciesKey} hidden=${isHidden}`);
          saveSpeciesVisibility(mapScope, user.id, speciesKey, isHidden);
        }
      }
      if (ev.data?.type === SPECIES_PREDICTION_EVENT_TYPES.selected) {
        const scopeCfg = getSpeciesScopeByMapId(current.id);
        const speciesName = typeof ev.data.speciesName === 'string' ? ev.data.speciesName : '';
        const speciesKey = typeof ev.data.speciesKey === 'string' ? ev.data.speciesKey : '';
        if (!scopeCfg || !speciesName) return;
        const startupGuard = iframePredictionStartupGuardRef.current;
        const userInitiated = ev.data?.userInitiated === true;
        if (startupGuard.active && startupGuard.speciesName && speciesName !== startupGuard.speciesName && !userInitiated) {
          return;
        }
        iframePredictionStartupGuardRef.current = { active: false, speciesName };
        latestPredictionRequestRef.current += 1;
        setActivePredictionSpecies(scopeCfg.id, speciesName);
        const predictionFeatureEnabled = isSpeciesPredictionEnabled();
        if (!predictionFeatureEnabled) return;
        sendPredictionContextToIframe(scopeCfg, speciesName, speciesKey || speciesName);
      }
      if (ev.data?.type === SPECIES_PREDICTION_EVENT_TYPES.run) {
        const predictionFeatureEnabled = isSpeciesPredictionEnabled();
        if (!predictionFeatureEnabled) {
          return;
        }
        const scopeCfg = getSpeciesScopeByMapId(current.id);
        const speciesName = typeof ev.data.speciesName === 'string' ? ev.data.speciesName : '';
        const speciesKey = normalizeSpeciesName(typeof ev.data.speciesKey === 'string' ? ev.data.speciesKey : speciesName);
        if (!scopeCfg || !speciesName || !speciesKey) {
          sendToIframe({
            type: SPECIES_PREDICTION_EVENT_TYPES.error,
            error: 'Select a species before requesting prediction results',
          });
          return;
        }
        const requestId = latestPredictionRequestRef.current + 1;
        latestPredictionRequestRef.current = requestId;
        updateSpeciesPredictionDebugContext({
          speciesName,
          speciesKey,
          mapScope: scopeCfg.id,
          panelRuntimeMarker: `${current.id} | ${speciesPredictionRuntimeMarker}`,
          lastPredictionRequestAt: new Date().toISOString(),
          predictionStatus: 'loading',
        });
        updateSpeciesPredictionTransport({
          requestTimestamp: new Date().toISOString(),
          responseTimestamp: '',
          requestId: String(requestId),
          httpStatus: null,
          responseBody: null,
          error: null,
        });
        setSpeciesPredictionDebugBackendResponse(null);
        setSpeciesPredictionDebugPanelPayload(null);
        setSpeciesPredictionDebugPanelState(null);
        sendToIframe({ type: SPECIES_PREDICTION_EVENT_TYPES.loading });
        loadSpeciesPredictionSettings(scopeCfg.id, speciesName)
          .then(async (settings) => {
            const meta = getScopedSpeciesMeta(speciesName, scopeCfg);
            const ebirdSpeciesCodeOverride = meta.ebirdCode || '';
            if (!ebirdSpeciesCodeOverride) {
              sendToIframe({
                type: SPECIES_PREDICTION_EVENT_TYPES.error,
                error: 'Missing eBird mapping for this species',
              });
              return;
            }
            const payload: SpeciesPredictionRequestPayload = {
              requestType: typeof ev.data.requestType === 'string' ? ev.data.requestType : 'prediction_and_insight',
              species: {
                key: speciesKey,
                name: speciesName,
                latinName: meta.scientificName || '',
              },
              settings: {
                ...settings,
                ...((ev.data.runtimeSettingsOverride && typeof ev.data.runtimeSettingsOverride === 'object') ? ev.data.runtimeSettingsOverride : {}),
                ebirdSpeciesCodeOverride,
              },
            };
            console.info('[speciesPrediction] outgoing payload', {
              scope: scopeCfg.id,
              requestType: payload.requestType,
              speciesKey: payload.species.key,
              speciesName: payload.species.name,
              latinName: payload.species.latinName || null,
              ebirdSpeciesCodeOverride: payload.settings.ebirdSpeciesCodeOverride || null,
              predictionMode: payload.settings.predictionMode,
              outputCount: payload.settings.outputCount,
            });
            const response = await runSpeciesPredictionRequest(payload, scopeCfg.id);
            if (latestPredictionRequestRef.current !== requestId) {
              console.debug('[speciesPrediction] ignoring stale response', {
                scope: scopeCfg.id,
                speciesKey: payload.species.key,
                speciesName: payload.species.name,
                requestId,
              });
              return;
            }
            if (!response.ok || !response.result) {
              console.warn('[speciesPrediction] runtime request failed', {
                scope: scopeCfg.id,
                speciesKey: payload.species.key,
                speciesName: payload.species.name,
                stage: response.stage || null,
                message: response.error || 'Prediction request failed',
              });
              updateSpeciesPredictionTransport({
                requestUrl: response.diagnostics.requestUrl,
                requestTimestamp: response.diagnostics.requestTimestamp,
                responseTimestamp: response.diagnostics.responseTimestamp,
                requestId: response.diagnostics.requestId,
                httpStatus: response.diagnostics.httpStatus,
                responseBody: response.diagnostics.responseBody,
                error: response.diagnostics.error,
              });
              setSpeciesPredictionDebugBackendResponse(null);
              setSpeciesPredictionDebugPanelPayload(null);
              setSpeciesPredictionDebugPanelState(null);
              setSpeciesPredictionTransportError(response.diagnostics.error);
              sendToIframe({
                type: SPECIES_PREDICTION_EVENT_TYPES.error,
                error: response.disabled ? 'Species prediction integration is currently unavailable' : (response.error || 'Prediction request failed'),
              });
              updateSpeciesPredictionDebugContext({
                lastPredictionResponseAt: new Date().toISOString(),
                predictionStatus: 'error',
              });
              return;
            }
            console.debug('[speciesPrediction] parent -> iframe result', {
              scope: scopeCfg.id,
              speciesKey: response.result.speciesKey,
              generatedAt: response.result.generatedAt,
              analysisVersion: response.result.analysisVersion || null,
              insightSummary: String(response.result.insightSummary || '').slice(0, 140),
              externalPressureScore: response.result.externalPressureScore,
              springFitScore: response.result.springFitScore,
              windSupportScore: response.result.windSupportScore,
              countryScores: response.result.countryScores,
              topPredictedPoints: response.result.topPredictedPoints.slice(0, 3).map((point) => ({
                rank: point.rank,
                name: point.name,
                confidence: point.confidence,
                eta: point.eta,
                reason: point.reason,
              })),
            });
            const iframePayload = {
              type: SPECIES_PREDICTION_EVENT_TYPES.result,
              result: response.result,
            };
            setSpeciesPredictionDebugPanelPayload(iframePayload.result);
            updateSpeciesPredictionTransport({
              requestUrl: response.diagnostics.requestUrl,
              requestTimestamp: response.diagnostics.requestTimestamp,
              responseTimestamp: response.diagnostics.responseTimestamp,
              requestId: response.diagnostics.requestId,
              httpStatus: response.diagnostics.httpStatus,
              responseBody: response.diagnostics.responseBody,
              error: null,
            });
            setSpeciesPredictionTransportError(null);
            updateSpeciesPredictionDebugContext({
              speciesName: response.result.speciesName,
              speciesKey: response.result.speciesKey,
              mapScope: scopeCfg.id,
              panelRuntimeMarker: `${current.id} | ${speciesPredictionRuntimeMarker}`,
              lastPredictionResponseAt: new Date().toISOString(),
              predictionStatus: 'success',
            });
            console.debug('[speciesPrediction] compare iframe payload', {
              scope: scopeCfg.id,
              speciesKey: iframePayload.result.speciesKey,
              insightSummary: iframePayload.result.insightSummary || null,
              externalPressureScore: iframePayload.result.externalPressureScore,
              lithuania: iframePayload.result.countryScores?.lithuania ?? null,
              topPredictedPointReason: iframePayload.result.topPredictedPoints[0]?.reason || null,
            });
            if (isDeveloperModeEnabled()) {
              console.debug('[SpeciesPredictionDebug] payload', {
                speciesKey: iframePayload.result.speciesKey,
                insightSummary: iframePayload.result.insightSummary || null,
                externalPressureScore: iframePayload.result.externalPressureScore,
                lithuania: iframePayload.result.countryScores?.lithuania ?? null,
                topPredictedPointReason: iframePayload.result.topPredictedPoints[0]?.reason || null,
              });
            }
            sendToIframe(iframePayload);
          })
          .catch((predictionError: unknown) => {
            if (latestPredictionRequestRef.current !== requestId) {
              return;
            }
            const now = new Date().toISOString();
            const message = predictionError instanceof Error ? predictionError.message : 'Prediction request failed';
            updateSpeciesPredictionTransport({
              responseTimestamp: now,
              error: {
                stage: 'unknown',
                httpStatus: null,
                message,
                responseBody: null,
                requestUrl: '',
                requestId: String(requestId),
                timestamp: now,
                errorType: 'unknown',
              },
            });
            setSpeciesPredictionDebugBackendResponse(null);
            setSpeciesPredictionDebugPanelPayload(null);
            setSpeciesPredictionDebugPanelState(null);
            updateSpeciesPredictionDebugContext({
              lastPredictionResponseAt: new Date().toISOString(),
              predictionStatus: 'error',
            });
            sendToIframe({
              type: SPECIES_PREDICTION_EVENT_TYPES.error,
              error: message,
            });
          });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [current.id, sendAvatarsToIframe, sendAppInsets, sendSpeciesMetaToIframe, sendSupabaseConfigToIframe, sendToIframe, user, mapScope, sendPredictionContextToIframe, sendActivePredictionSpeciesToIframe]);

  // === Species discovery (USA maps only): ingest species the iframe found on eBird ===
  // Writes ONLY to the scope-keyed discoveredSpecies store + scoped speciesMeta.
  // Never touches the global customSpecies store, so Linnuliigid/Rariliin cannot be polluted.
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (!ev.data || ev.data.type !== 'MAP_DISCOVERED_SPECIES') return;
      const scopeId = String(ev.data.scopeId || '') as SpeciesScopeId;
      const scopeCfg = (SPECIES_SCOPES as Record<string, SpeciesScopeConfig>)[scopeId];
      if (!scopeCfg) {
        console.warn('[discovery] unknown scopeId', ev.data.scopeId);
        return;
      }
      // Only USA scopes receive discoveries. Linnuliigid/Rariliin never emit
      // MAP_DISCOVERED_SPECIES, but guard anyway to enforce the isolation invariant.
      if (scopeId !== 'usa_co' && scopeId !== 'usa_pa' && scopeId !== 'usa_i70') {
        console.warn('[discovery] refusing to apply discoveries to non-USA scope:', scopeId);
        return;
      }
      const items = Array.isArray(ev.data.species) ? ev.data.species : [];
      if (!items.length) return;

      const names: string[] = [];
      const metaPatches: { name: string; ebirdCode?: string; scientificName?: string }[] = [];
      for (const item of items) {
        const name = String(item?.name || '').trim();
        if (!name) continue;
        names.push(name);
        const code = String(item?.ebirdCode || '').trim();
        const sci = String(item?.sciName || '').trim();
        if (code || sci) {
          const patch: { ebirdCode?: string; scientificName?: string } = {};
          if (code) patch.ebirdCode = code;
          if (sci) patch.scientificName = sci;
          upsertSpeciesMeta(name, patch, scopeCfg);
          metaPatches.push({ name, ...patch });
        }
      }

      const addedCount = addDiscoveredSpeciesBatch(names, scopeId);
      console.log(`[discovery] scope=${scopeId} received=${items.length} newlyAdded=${addedCount} metaChanged=${metaPatches.length > 0}`);

      // One batched cloud meta sync per discovery batch (not per species). The real
      // saveSpeciesMetaToCloud signature is (name, patch, scope) — per-species — so a
      // batch is done with a single download+merge+upload to avoid racing writes.
      if (metaPatches.length > 0) {
        (async () => {
          try {
            const latest = (await downloadSpeciesMetaJson(scopeCfg)) || { version: 1 as const, updatedAt: '', items: {} };
            const metaItems = { ...latest.items };
            for (const patch of metaPatches) {
              metaItems[patch.name] = {
                ...(metaItems[patch.name] || {}),
                ...(patch.ebirdCode ? { ebirdCode: patch.ebirdCode } : {}),
                ...(patch.scientificName ? { scientificName: patch.scientificName } : {}),
              };
            }
            await uploadSpeciesMetaJson({ version: 1, updatedAt: new Date().toISOString(), items: metaItems }, scopeCfg);
          } catch (err) {
            console.warn('[discovery] cloud meta sync failed', err);
          }
        })();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    const rerunHandler = () => {
      if (!iframePredictionReadyRef.current) return;
      const scopeCfg = getSpeciesScopeByMapId(current.id);
      const species = scopeCfg ? getActivePredictionSpecies(scopeCfg.id) : null;
      if (!scopeCfg || !species) return;
      sendToIframe({
        type: SPECIES_PREDICTION_EVENT_TYPES.run,
        scope: scopeCfg.id,
        speciesName: species.speciesName,
        speciesKey: species.speciesKey,
        requestType: 'prediction_and_insight',
      });
    };
    const resyncHandler = () => {
      const snapshot = getSpeciesPredictionDebugSnapshot();
      if (!snapshot.panelPayload || !iframePredictionReadyRef.current) return;
      sendToIframe({
        type: SPECIES_PREDICTION_EVENT_TYPES.result,
        result: snapshot.panelPayload,
      });
    };
    window.addEventListener(SPECIES_PREDICTION_DEBUG_RERUN_EVENT, rerunHandler as EventListener);
    window.addEventListener(SPECIES_PREDICTION_DEBUG_RESYNC_EVENT, resyncHandler as EventListener);
    return () => {
      window.removeEventListener(SPECIES_PREDICTION_DEBUG_RERUN_EVENT, rerunHandler as EventListener);
      window.removeEventListener(SPECIES_PREDICTION_DEBUG_RESYNC_EVENT, resyncHandler as EventListener);
    };
  }, [current.id, sendToIframe]);

  useEffect(() => {
    const scopeCfg = getSpeciesScopeByMapId(current.id);
    if (!scopeCfg) return;
    const syncSpecies = (species: ActivePredictionSpecies | null) => {
      if (!species || species.scope !== scopeCfg.id) return;
      iframePredictionStartupGuardRef.current = { active: false, speciesName: species.speciesName };
      sendActivePredictionSpeciesToIframe(species);
      if (isSpeciesPredictionEnabled()) {
        sendPredictionContextToIframe(scopeCfg, species.speciesName, species.speciesKey);
      }
    };
    syncSpecies(getActivePredictionSpecies(scopeCfg.id));
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ActivePredictionSpecies>).detail;
      syncSpecies(detail || null);
    };
    window.addEventListener(ACTIVE_PREDICTION_SPECIES_EVENT, handler as EventListener);
    return () => window.removeEventListener(ACTIVE_PREDICTION_SPECIES_EVENT, handler as EventListener);
  }, [current.id, sendActivePredictionSpeciesToIframe, sendPredictionContextToIframe]);

  useEffect(() => {
    const t = setTimeout(sendMapShown, 500);
    const t2 = setTimeout(sendMapShown, 1500);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [current.id, sendMapShown]);

  // --- Auto-refresh: on tab activation ---
  useEffect(() => {
    if (isActive && iframeReadyRef.current) {
      // Small delay to let iframe settle after tab switch
      const t = setTimeout(sendRefreshVisible, 500);
      return () => clearTimeout(t);
    }
  }, [isActive, sendRefreshVisible]);

  // --- Auto-refresh: on visibilitychange ---
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && isActive && iframeReadyRef.current) {
        // If >30 min since last refresh, refresh immediately
        const elapsed = Date.now() - lastAutoRefreshRef.current;
        const delay = elapsed > AUTO_REFRESH_INTERVAL_MS ? 300 : 500;
        setTimeout(sendRefreshVisible, delay);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [isActive, sendRefreshVisible]);

  // --- Auto-refresh: 30 minute interval ---
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      lastAutoRefreshRef.current = Date.now();
      sendRefreshVisible();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isActive, sendRefreshVisible]);

  const handleLoad = () => {
    setError(null);
    iframeReadyRef.current = true;
    iframePredictionReadyRef.current = false;
    const scopeCfg = getSpeciesScopeByMapId(current.id);
    const species = scopeCfg ? getActivePredictionSpecies(scopeCfg.id) : null;
    iframePredictionStartupGuardRef.current = {
      active: Boolean(species?.speciesName),
      speciesName: species?.speciesName || '',
    };
    sendMapShown();
    // Send avatars and insets when iframe loads
    setTimeout(sendAvatarsToIframe, 300);
    setTimeout(sendSpeciesMetaToIframe, 350);
    setTimeout(sendCustomSpeciesToIframe, 360);
    setTimeout(sendSupabaseConfigToIframe, 375);
    setTimeout(sendPermissionsToIframe, 380);
    setTimeout(sendFeatureFlagsToIframe, 390);
    setTimeout(broadcastSupabaseConfigToMapIframes, 390);
    setTimeout(sendAppInsets, 400);
    // Send species visibility preferences
    if (user?.id && mapScope) {
      setTimeout(() => {
        const localHidden = loadLocalHidden(mapScope, user.id);
        sendSpeciesVisibilityToIframe(localHidden);
        loadSpeciesVisibility(mapScope, user.id).then((cloudHidden) => {
          sendSpeciesVisibilityToIframe(cloudHidden);
        });
      }, 450);
    }
    // Auto-refresh after initial load
    setTimeout(() => {
      lastAutoRefreshRef.current = Date.now();
      sendRefreshVisible();
    }, 800);
    // One-time backfill of bundled species sciname/ebirdCode into cloud meta
    setTimeout(() => {
      runBundledSpeciesBackfill()
        .then((result) => {
          if (result.status === 'done') {
            console.log(`[backfill] Filled ${result.filled}/${result.checked} bundled species`);
            toast.success(`Täiendasin ${result.filled} liigi andmed`);
          } else if (result.status === 'no-changes') {
            console.log(`[backfill] No changes needed (${result.checked} checked)`);
          } else {
            console.log(`[backfill] Skipped: ${result.reason}`);
          }
        })
        .catch((e) => console.warn('[backfill] failed', e));
    }, 2000);
  };

  useEffect(() => {
    broadcastSupabaseConfigToMapIframes();
    sendSupabaseConfigToIframe();
  }, [selectedId, sendPermissionsToIframe, sendSupabaseConfigToIframe]);

  useEffect(() => {
    let prev = `${getSupabaseUrl()}|${getSupabaseAnonKey()}`;
    const syncIfChanged = () => {
      const next = `${getSupabaseUrl()}|${getSupabaseAnonKey()}`;
      if (next === prev) return;
      prev = next;
      sendSupabaseConfigToIframe();
    };
    const id = window.setInterval(syncIfChanged, 1000);
    window.addEventListener('focus', syncIfChanged);
    window.addEventListener('storage', syncIfChanged);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', syncIfChanged);
      window.removeEventListener('storage', syncIfChanged);
    };
  }, [sendSupabaseConfigToIframe]);

  useEffect(() => {
    const onMetaUpdated = () => sendSpeciesMetaToIframe();
    window.addEventListener('species-meta-updated', onMetaUpdated as EventListener);
    return () => window.removeEventListener('species-meta-updated', onMetaUpdated as EventListener);
  }, [sendSpeciesMetaToIframe]);

  useEffect(() => {
    const onCustomSpeciesUpdated = () => sendCustomSpeciesToIframe();
    window.addEventListener('custom-species-updated', onCustomSpeciesUpdated as EventListener);
    return () => window.removeEventListener('custom-species-updated', onCustomSpeciesUpdated as EventListener);
  }, [sendCustomSpeciesToIframe]);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshSpeciesMetaFromCloud({ scope: speciesScope }).catch(() => {});
      refreshCustomSpeciesFromCloud().catch(() => {});
    }, 60000);
    return () => window.clearInterval(id);
  }, [speciesScope]);

  const handleError = () => {
    setError('Võrguühenduse viga või ressurss puudub');
  };

  const retry = () => {
    setError(null);
    iframeReadyRef.current = false;
    if (iframeRef.current) {
      iframeRef.current.src = iframeSrc;
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableMaps.map((m) => (
              <SelectItem key={m.id} value={m.id} disabled={!m.enabled}>
                {m.name}
                {!m.enabled && ' (varsti)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-destructive/10 p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive" />
            <h2 className="text-lg font-semibold text-foreground">Kaardi laadimine ebaõnnestus</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={retry} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Proovi uuesti
            </Button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            data-map-iframe="true"
            key={iframeSyncKey}
            src={iframeSrc}
            title={current.name}
            className="absolute inset-0 w-full h-full border-0 block"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
      </div>
    </div>
  );
}
