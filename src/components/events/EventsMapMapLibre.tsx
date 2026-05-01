import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type LngLatBoundsLike, type Map as MapLibreMap } from "maplibre-gl";

type MapPoint = {
  id: string;
  lat: number;
  lon: number;
  title?: string;
};

type EventsMapMapLibreProps = {
  points: MapPoint[];
  selectedId?: string;
  onMarkerClick?: (id: string) => void;
};

const ESTONIA_CENTER: [number, number] = [24.75, 59.44];
const ESTONIA_ZOOM = 5;

// Teardrop pin with a flying bird silhouette. Two-tone green to match app theme.
const BIRD_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.35"/>
    </filter>
  </defs>
  <path filter="url(#shadow)" fill="#1f6f4a" stroke="#0f3a26" stroke-width="1"
        d="M18 1 C8 1 1 8.5 1 18 C1 30 18 47 18 47 C18 47 35 30 35 18 C35 8.5 28 1 18 1 Z"/>
  <circle cx="18" cy="17" r="10.5" fill="#ffffff"/>
  <path fill="#1f6f4a"
        d="M7.5 18 C10 14.5 13.5 13.5 17 16 C20.5 13.5 24 14.5 26.5 18 C24 17 21 17.5 18 19 C15 17.5 12 17 7.5 18 Z"/>
</svg>`;
const BIRD_PIN_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BIRD_PIN_SVG)}`;

const MAP_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
} as const;

function isValidPoint(point: MapPoint): boolean {
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

function stableKey(points: MapPoint[]): string {
  return points
    .map((p) => `${p.id}:${p.lat.toFixed(6)}:${p.lon.toFixed(6)}`)
    .sort()
    .join("|");
}

function createMarkerElement(selected: boolean): HTMLDivElement {
  const el = document.createElement("div");
  const width = selected ? 42 : 36;
  const height = Math.round(width * (48 / 36));
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.backgroundImage = `url('${BIRD_PIN_URI}')`;
  el.style.backgroundSize = "contain";
  el.style.backgroundRepeat = "no-repeat";
  el.style.transform = `translate(-${Math.round(width / 2)}px,-${height}px)`;
  el.style.cursor = "pointer";
  el.style.transition = "transform 0.15s ease-out";
  if (selected) {
    el.style.zIndex = "10";
  }
  return el;
}

export function EventsMapMapLibre({ points, selectedId, onMarkerClick }: EventsMapMapLibreProps) {
  const validPoints = useMemo(() => points.filter(isValidPoint), [points]);
  if (validPoints.length === 0) return null;
  return <EventsMapInner points={validPoints} selectedId={selectedId} onMarkerClick={onMarkerClick} />;
}

function EventsMapInner({
  points,
  selectedId,
  onMarkerClick,
}: {
  points: MapPoint[];
  selectedId?: string;
  onMarkerClick?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const loadedRef = useRef(false);
  const userMovedRef = useRef(false);
  const lastPointsKeyRef = useRef("");
  const onMarkerClickRef = useRef<typeof onMarkerClick>(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

  const pointsKey = useMemo(() => stableKey(points), [points]);

  const applyViewRef = useRef<(force?: boolean) => void>(() => {});
  applyViewRef.current = (force = false) => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    if (!force && userMovedRef.current) return;

    try {
      if (points.length === 1) {
        const p = points[0];
        map.easeTo({ center: [p.lon, p.lat], zoom: 12, duration: 400 });
        return;
      }
      const bounds = new maplibregl.LngLatBounds();
      for (const p of points) bounds.extend([p.lon, p.lat]);
      map.fitBounds(bounds as LngLatBoundsLike, { padding: 40, maxZoom: 13, duration: 500 });
    } catch (err) {
      console.warn("[EventsMap] fitBounds failed, falling back to Estonia center", err);
      map.easeTo({ center: ESTONIA_CENTER, zoom: ESTONIA_ZOOM, duration: 300 });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container,
        style: MAP_STYLE as any,
        center: ESTONIA_CENTER,
        zoom: ESTONIA_ZOOM,
        maxZoom: 12,
        attributionControl: { compact: true },
      });
    } catch (err) {
      console.error("[EventsMap] failed to construct MapLibre Map", err);
      return;
    }
    mapRef.current = map;

    map.scrollZoom.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on("dragstart", () => { userMovedRef.current = true; });
    map.on("zoomstart", (e: any) => {
      if (e?.originalEvent) userMovedRef.current = true;
    });

    map.on("error", (e: any) => {
      console.warn("[EventsMap] MapLibre error:", e?.error?.message || e);
    });

    map.on("load", () => {
      loadedRef.current = true;
      applyViewRef.current(true);
      lastPointsKeyRef.current = pointsKey;
      for (const point of points) {
        const selected = point.id === selectedId;
        const el = createMarkerElement(selected);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onMarkerClickRef.current?.(point.id);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([point.lon, point.lat])
          .addTo(map);
        markersRef.current.set(point.id, marker);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try { map.resize(); } catch {}
    });
    resizeObserver.observe(container);

    const timer = window.setTimeout(() => {
      try { map.resize(); } catch {}
      applyViewRef.current(true);
    }, 50);

    return () => {
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      loadedRef.current = false;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const markerIds = new Set(points.map((p) => p.id));
    for (const [id, marker] of markersRef.current) {
      if (!markerIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    for (const point of points) {
      const existing = markersRef.current.get(point.id);
      const selected = point.id === selectedId;
      const el = createMarkerElement(selected);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onMarkerClickRef.current?.(point.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([point.lon, point.lat])
        .addTo(map);
      if (existing) existing.remove();
      markersRef.current.set(point.id, marker);
    }

    if (pointsKey !== lastPointsKeyRef.current) {
      userMovedRef.current = false;
      applyViewRef.current(true);
      lastPointsKeyRef.current = pointsKey;
    }
  }, [pointsKey, selectedId, points]);

  return (
    <div>
      <div ref={containerRef} className="w-full h-[260px] sm:h-[320px] rounded-xl overflow-hidden bg-muted" />
      {import.meta.env.DEV ? <p className="mt-1 text-xs text-muted-foreground">Pins: {points.length}</p> : null}
    </div>
  );
}
