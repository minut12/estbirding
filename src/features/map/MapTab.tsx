import { maps, getActiveMap } from './config';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';
import { fetchSharedAvatars, getMergedAvatars, notifyIframe } from '@/lib/avatar-storage';
import { resolveProxyBase } from '@/config/proxyEndpoint';
import { loadSpeciesMeta } from '@/lib/speciesMeta';
import { refreshSpeciesMetaFromCloud } from '@/lib/speciesMetaCloud';
import { broadcastSupabaseConfigToMapIframes, getSupabaseAnonKey, getSupabaseUrl, validateSupabaseConfig } from '@/config/supabaseConfig';
import { useAuth } from '@/features/auth/AuthContext';
import { type MapScope, loadSpeciesVisibility, saveSpeciesVisibility, loadLocalHidden } from '@/lib/speciesVisibility';

const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

interface MapTabProps {
  isActive?: boolean;
  onMapChange?: (mapId: string) => void;
}

export default function MapTab({ isActive = true, onMapChange }: MapTabProps) {
  const [selectedId, setSelectedId] = useState(getActiveMap().id);
  const current = maps.find((m) => m.id === selectedId) ?? getActiveMap();
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
  const lastAutoRefreshRef = useRef(0);

  useEffect(() => {
    onMapChange?.(selectedId);
  }, [onMapChange, selectedId]);

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
    const avatars = getMergedAvatars();
    notifyIframe(avatars);
  }, []);
  const sendSpeciesMetaToIframe = useCallback(() => {
    sendToIframe({ type: 'SPECIES_META_DEFAULTS', speciesMeta: loadSpeciesMeta() });
  }, [sendToIframe]);
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

  // Fetch shared avatars on mount, cache locally, then send to iframe
  useEffect(() => {
    const t0 = setTimeout(sendAvatarsToIframe, 600);
    fetchSharedAvatars().then(() => {
      sendAvatarsToIframe();
    });
    refreshSpeciesMetaFromCloud({ force: true })
      .then(() => sendSpeciesMetaToIframe())
      .catch(() => {
        sendSpeciesMetaToIframe();
      });
    return () => clearTimeout(t0);
  }, [sendAvatarsToIframe, sendSpeciesMetaToIframe]);

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
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [sendAvatarsToIframe, sendAppInsets, sendSpeciesMetaToIframe, sendSupabaseConfigToIframe, sendToIframe]);

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
    sendMapShown();
    // Send avatars and insets when iframe loads
    setTimeout(sendAvatarsToIframe, 300);
    setTimeout(sendSpeciesMetaToIframe, 350);
    setTimeout(sendSupabaseConfigToIframe, 375);
    setTimeout(broadcastSupabaseConfigToMapIframes, 390);
    setTimeout(sendAppInsets, 400);
    // Auto-refresh after initial load
    setTimeout(() => {
      lastAutoRefreshRef.current = Date.now();
      sendRefreshVisible();
    }, 800);
  };

  useEffect(() => {
    broadcastSupabaseConfigToMapIframes();
    sendSupabaseConfigToIframe();
  }, [selectedId, sendSupabaseConfigToIframe]);

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
      refreshSpeciesMetaFromCloud().catch(() => {});
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

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
            {maps.map((m) => (
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
            key={current.id}
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
