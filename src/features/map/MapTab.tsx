import { maps, getActiveMap } from './config';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/version';

export default function MapTab() {
  const [selectedId, setSelectedId] = useState(getActiveMap().id);
  const current = maps.find((m) => m.id === selectedId) ?? getActiveMap();
  const iframeSrc = useMemo(() => {
    const sep = current.source.includes('?') ? '&' : '?';
    return `${current.source}${sep}v=${APP_VERSION}`;
  }, [current.source]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Send MAP_SHOWN to iframe so Leaflet can invalidateSize
  const sendMapShown = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: 'MAP_SHOWN' }, '*');
    } catch (e) { /* cross-origin safety */ }
  }, []);

  useEffect(() => {
    // Send on mount + short delay for iframe load
    const t = setTimeout(sendMapShown, 500);
    const t2 = setTimeout(sendMapShown, 1500);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [current.id, sendMapShown]);

  const handleLoad = () => {
    setError(null);
    sendMapShown();
  };

  const handleError = () => {
    setError('Võrguühenduse viga või ressurss puudub');
  };

  const retry = () => {
    setError(null);
    if (iframeRef.current) {
      iframeRef.current.src = iframeSrc;
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Map selector header */}
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

      {/* Map area */}
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
