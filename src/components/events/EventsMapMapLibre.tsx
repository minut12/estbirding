import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type LngLatBoundsLike, type Map as MapLibreMap, type Marker } from "maplibre-gl";

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
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}

export function EventsMapMapLibre({ points, selectedId }: EventsMapMapLibreProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const loadedRef = useRef(false);

  const validPoints = useMemo(() => points.filter(isValidPoint), [points]);

  const applyViewRef = useRef<() => void>(() => {});
  applyViewRef.current = () => {
    const map = mapRef.current;
    if (!map || validPoints.length === 0) return;

    try {
      if (validPoints.length === 1) {
        const p = validPoints[0];
        map.easeTo({ center: [p.lon, p.lat], zoom: 10, duration: 500 });
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const p of validPoints) {
        bounds.extend([p.lon, p.lat]);
      }
      map.fitBounds(bounds as LngLatBoundsLike, { padding: 40, maxZoom: 12, duration: 500 });
    } catch {
      map.easeTo({ center: ESTONIA_CENTER, zoom: ESTONIA_ZOOM, duration: 300 });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || validPoints.length === 0) return;

    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE as any,
      center: ESTONIA_CENTER,
      zoom: ESTONIA_ZOOM,
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      loadedRef.current = true;
      applyViewRef.current();
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    const timer = window.setTimeout(() => {
      map.resize();
      applyViewRef.current();
    }, 50);

    return () => {
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [validPoints.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const nextIds = new Set(validPoints.map((p) => p.id));
    for (const [id, marker] of markersRef.current.entries()) {
      if (!nextIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const p of validPoints) {
      const existing = markersRef.current.get(p.id);
      if (existing) {
        existing.setLngLat([p.lon, p.lat]);
        continue;
      }

      const markerEl = document.createElement("div");
      markerEl.className = "h-3.5 w-3.5 rounded-full border border-white bg-red-600 shadow";
      if (p.id === selectedId) {
        markerEl.classList.add("ring-2", "ring-red-300");
      }

      const marker = new maplibregl.Marker({ element: markerEl, anchor: "center" })
        .setLngLat([p.lon, p.lat]);
      if (p.title) marker.setPopup(new maplibregl.Popup({ offset: 12 }).setText(p.title));
      marker.addTo(map);
      markersRef.current.set(p.id, marker);
    }

    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      if (id === selectedId) el.classList.add("ring-2", "ring-red-300");
      else el.classList.remove("ring-2", "ring-red-300");
    });

    applyViewRef.current();
  }, [validPoints, selectedId]);

  if (validPoints.length === 0) return null;

  return <div ref={containerRef} className="w-full h-[260px] sm:h-[320px] rounded-xl overflow-hidden bg-muted" />;
}

