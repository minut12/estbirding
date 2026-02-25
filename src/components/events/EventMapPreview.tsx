import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { EventItem } from "@/data/events";

interface EventMapPreviewProps {
  events: EventItem[];
  highlightedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

type LeafletLike = any;

declare global {
  interface Window {
    L?: LeafletLike;
  }
}

function getCenter(events: EventItem[]): [number, number] {
  if (!events.length) return [58.7, 25.0];
  const lat = events.reduce((sum, e) => sum + e.lat, 0) / events.length;
  const lng = events.reduce((sum, e) => sum + e.lng, 0) / events.length;
  return [lat, lng];
}

function ensureLeafletAssets(): Promise<void> {
  if (window.L) return Promise.resolve();

  const existingLink = document.querySelector('link[data-leaflet-css="1"]');
  if (!existingLink) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.setAttribute("data-leaflet-css", "1");
    document.head.appendChild(link);
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-leaflet-js="1"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Leaflet script failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.setAttribute("data-leaflet-js", "1");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Leaflet script failed"));
    document.body.appendChild(script);
  });
}

function InvalidateMapSize({ map, deps }: { map: LeafletLike | null; deps: unknown[] }) {
  useEffect(() => {
    if (!map) return;
    const id = window.setTimeout(() => map.invalidateSize(), 50);
    return () => window.clearTimeout(id);
  }, [map, ...deps]);

  return null;
}

export function EventMapPreview({
  events,
  highlightedEventId,
  onSelectEvent,
  onPrev,
  onNext,
}: EventMapPreviewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const miniMapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<LeafletLike | null>(null);
  const leafletMiniRef = useRef<LeafletLike | null>(null);
  const markersRef = useRef<Map<string, LeafletLike>>(new Map());
  const [tileError, setTileError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const center = useMemo(() => getCenter(events), [events]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!mapRef.current || !miniMapRef.current) return;

      try {
        await ensureLeafletAssets();
        if (cancelled || !window.L) return;

        const L = window.L;

        if (!leafletMapRef.current) {
          const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: true,
          }).setView(center, 7);

          const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
          });
          tileLayer.on("tileerror", () => setTileError(true));
          tileLayer.addTo(map);

          leafletMapRef.current = map;
        }

        if (!leafletMiniRef.current) {
          const mini = L.map(miniMapRef.current, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            touchZoom: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
          }).setView(center, 5);

          const miniTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
          });
          miniTiles.on("tileerror", () => setTileError(true));
          miniTiles.addTo(mini);

          leafletMiniRef.current = mini;
        }

        setMapReady(true);
      } catch {
        setTileError(true);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [center]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !window.L) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    events.forEach((event) => {
      const active = event.id === highlightedEventId;
      const icon = window.L!.divIcon({
        className: "",
        html: `<div style="width:36px;height:36px;border-radius:16px;background:white;border:2px solid ${active ? "#2F6B4F" : "#fff"};box-shadow:0 8px 20px rgba(47,107,79,.25);display:flex;align-items:center;justify-content:center;font-size:16px;">📍</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = window.L!.marker([event.lat, event.lng], { icon }).addTo(map);
      marker.on("click", () => onSelectEvent(event.id));
      marker.setZIndexOffset(active ? 1000 : 0);
      markersRef.current.set(event.id, marker);
    });

    if (events.length) {
      map.setView(center, 7, { animate: false });
    }
  }, [events, highlightedEventId, onSelectEvent, center]);

  useEffect(() => {
    const mini = leafletMiniRef.current;
    if (!mini || !window.L) return;

    mini.eachLayer((layer: any) => {
      if (layer instanceof window.L.TileLayer) return;
      mini.removeLayer(layer);
    });

    events.forEach((event) => {
      const circle = window.L!.circleMarker([event.lat, event.lng], {
        radius: event.id === highlightedEventId ? 4 : 3,
        color: "#2F6B4F",
        fillColor: "#2F6B4F",
        fillOpacity: event.id === highlightedEventId ? 1 : 0.6,
        weight: 0,
      });
      circle.addTo(mini);
    });

    if (events.length) {
      mini.setView(center, 5, { animate: false });
    }
  }, [events, highlightedEventId, center]);

  useEffect(() => {
    return () => {
      leafletMapRef.current?.remove();
      leafletMiniRef.current?.remove();
      leafletMapRef.current = null;
      leafletMiniRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-[300px] overflow-hidden rounded-2xl border border-border/70 bg-[#edf2ed] shadow-sm">
      <div ref={mapRef} className="h-[300px] w-full" />

      {tileError && (
        <div className="absolute left-3 top-12 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Kaardi taust ei lae (tile error)
        </div>
      )}

      <div className="absolute right-3 top-3 h-24 w-28 overflow-hidden rounded-xl border border-white/80 bg-white/85 shadow-sm backdrop-blur-sm">
        <div ref={miniMapRef} className="h-full w-full" />
      </div>

      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white/95 text-foreground shadow-sm"
          onClick={onPrev}
          aria-label="Eelmine üritus"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white/95 text-foreground shadow-sm"
          onClick={onNext}
          aria-label="Järgmine üritus"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="absolute left-3 top-3 rounded-full border border-white/60 bg-white/85 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          Kaart
        </span>
      </div>

      <InvalidateMapSize map={leafletMapRef.current} deps={[events.length, highlightedEventId, mapReady]} />
    </div>
  );
}
