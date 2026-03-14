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
import { LINNULIIGID_SCOPE, RARILIIN_SCOPE } from '@/lib/mapScope';
import { resolveProxyBase } from '@/config/proxyEndpoint';
import { buildSpeciesMetaLookupFallback, getScopedSpeciesMeta, loadSpeciesMeta, seedSpeciesMetaFallback } from '@/lib/speciesMeta';
import { refreshSpeciesMetaFromCloud } from '@/lib/speciesMetaCloud';
import { broadcastSupabaseConfigToMapIframes, getSupabaseAnonKey, getSupabaseUrl, validateSupabaseConfig } from '@/config/supabaseConfig';
import { useAuth } from '@/features/auth/AuthContext';
import { PERMISSIONS } from '@/features/auth/permissions';
import { type MapScope, loadSpeciesVisibility, saveSpeciesVisibility, loadLocalHidden } from '@/lib/speciesVisibility';
import { getSpeciesScopeByMapId, SPECIES_PREDICTION_EVENT_TYPES, type SpeciesPredictionRequestPayload } from '@/lib/speciesPrediction';
import { loadSpeciesPredictionSettings } from '@/lib/speciesPredictionSettings';
import { runSpeciesPredictionRequest } from '@/lib/speciesPredictionRunner';
import { isSpeciesPredictionEnabled } from '@/lib/settings';
import { ACTIVE_PREDICTION_IFRAME_READY_MESSAGE, ACTIVE_PREDICTION_SPECIES_EVENT, ACTIVE_PREDICTION_SPECIES_MESSAGE, getActivePredictionSpecies, setActivePredictionSpecies, type ActivePredictionSpecies } from '@/lib/activePredictionSpecies';

const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const MAP_ID_TO_SCOPE: Record<string, MapScope> = {
  'linnuliigid-ee': 'ee_map',
  'europe': 'europe_map',
  'rariliin': 'rariliin_map',
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
  const speciesScope = current.id === 'rariliin' ? RARILIIN_SCOPE : LINNULIIGID_SCOPE;
  const canEditKevadranne = isAdmin || hasPermission(PERMISSIONS.kevadranneEdit);
  const iframeSrc = useMemo(() => {
    const proxyBase = resolveProxyBase();
    const params = new URLSearchParams();
    params.set('v', APP_VERSION);
    if (proxyBase) params.set('proxyBase', proxyBase);
    const sep = current.source.includes('?') ? '&' : '?';
    return `${current.source}${sep}${params.toString()}`;
  }, [current.source]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeReadyRef = useRef(false);
  const iframePredictionReadyRef = useRef(false);
  const iframePredictionStartupGuardRef = useRef<{ active: boolean; speciesName: string }>({ active: false, speciesName: '' });
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
    return () => clearTimeout(t0);
  }, [seedScopeMetadata, sendAvatarsToIframe, sendSpeciesMetaToIframe, speciesScope]);

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
      if (ev.data?.type === 'INSETS_REQUEST') {
        sendAppInsets();
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
        if (startupGuard.active && startupGuard.speciesName && speciesName !== startupGuard.speciesName) {
          return;
        }
        iframePredictionStartupGuardRef.current = { active: false, speciesName };
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
        const speciesKey = typeof ev.data.speciesKey === 'string' ? ev.data.speciesKey : '';
        if (!scopeCfg || !speciesName || !speciesKey) {
          sendToIframe({
            type: SPECIES_PREDICTION_EVENT_TYPES.error,
            error: 'Select a species before requesting prediction results',
          });
          return;
        }
        sendToIframe({ type: SPECIES_PREDICTION_EVENT_TYPES.loading });
        loadSpeciesPredictionSettings(scopeCfg.id, speciesName)
          .then(async (settings) => {
            const meta = getScopedSpeciesMeta(speciesName, scopeCfg);
            const payload: SpeciesPredictionRequestPayload = {
              requestType: typeof ev.data.requestType === 'string' ? ev.data.requestType : 'prediction_and_insight',
              species: {
                key: speciesKey,
                name: speciesName,
                latinName: meta.scientificName || '',
              },
              settings,
            };
            const response = await runSpeciesPredictionRequest(payload, scopeCfg.id);
            if (!response.ok || !response.result) {
              sendToIframe({
                type: SPECIES_PREDICTION_EVENT_TYPES.error,
                error: response.disabled ? 'Species prediction integration is currently unavailable' : (response.error || 'Prediction request failed'),
              });
              return;
            }
            sendToIframe({
              type: SPECIES_PREDICTION_EVENT_TYPES.result,
              result: response.result,
            });
          })
          .catch((predictionError: unknown) => {
            sendToIframe({
              type: SPECIES_PREDICTION_EVENT_TYPES.error,
              error: predictionError instanceof Error ? predictionError.message : 'Prediction request failed',
            });
          });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [current.id, sendAvatarsToIframe, sendAppInsets, sendSpeciesMetaToIframe, sendSupabaseConfigToIframe, sendToIframe, user, mapScope, sendPredictionContextToIframe, sendActivePredictionSpeciesToIframe]);

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
    const id = window.setInterval(() => {
      refreshSpeciesMetaFromCloud({ scope: speciesScope }).catch(() => {});
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
