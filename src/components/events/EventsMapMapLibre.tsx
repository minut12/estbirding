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
};

const ESTONIA_CENTER: [number, number] = [24.75, 59.44];
const ESTONIA_ZOOM = 5;
const KINGFISHER_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 64 64"><path fill="#1f6f4a" d="M32 2c-11 0-20 9-20 20 0 16 20 40 20 40s20-24 20-40C52 11 43 2 32 2z"/><path fill="#ffffff" d="M22 26c6-6 18-6 24 0-5 2-9 6-12 12-3-6-7-10-12-12z"/><circle cx="38" cy="22" r="2" fill="#ffffff"/></svg>`;
const KINGFISHER_PIN_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(KINGFISHER_PIN_SVG)}`;

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
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
  const size = selected ? 36 : 32;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.backgroundImage = `url('${KINGFISHER_PIN_URI}')`;
  el.style.backgroundSize = "contain";
  el.style.backgroundRepeat = "no-repeat";
  el.style.transform = `translate(-${Math.round(size / 2)}px,-${size}px)`;
  el.style.cursor = "pointer";
  return el;
}

export function EventsMapMapLibre({ points, selectedId }: EventsMapMapLibreProps) {
  const validPoints = useMemo(() => points.filter(isValidPoint), [points]);
  if (validPoints.length === 0) return null;
  return <EventsMapInner points={validPoints} selectedId={selectedId} />;
}

function EventsMapInner({ points, selectedId }: { points: MapPoint[]; selectedId?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const loadedRef = useRef(false);
  const userMovedRef = useRef(false);
  const lastPointsKeyRef = useRef("");

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
        const marker = new maplibregl.Marker({ element: createMarkerElement(selected), anchor: "bottom" })
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
      const marker = new maplibregl.Marker({ element: createMarkerElement(selected), anchor: "bottom" })
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
