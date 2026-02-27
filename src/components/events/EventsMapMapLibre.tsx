import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap } from "maplibre-gl";

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
const SOURCE_ID = "events";
const LAYER_POINTS_ID = "events-points";
const LAYER_LABELS_ID = "events-labels";

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

function stableKey(points: MapPoint[]): string {
  return points
    .map((p) => `${p.id}:${p.lat.toFixed(6)}:${p.lon.toFixed(6)}`)
    .sort()
    .join("|");
}

export function EventsMapMapLibre({ points, selectedId }: EventsMapMapLibreProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const userMovedRef = useRef(false);
  const lastPointsKeyRef = useRef("");

  const validPoints = useMemo(() => points.filter(isValidPoint), [points]);
  const pointsKey = useMemo(() => stableKey(validPoints), [validPoints]);

  const featureCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: validPoints.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] as [number, number] },
        properties: { id: p.id, title: p.title || "", selected: p.id === selectedId },
      })),
    }),
    [validPoints, selectedId],
  );

  const applyViewRef = useRef<(force?: boolean) => void>(() => {});
  applyViewRef.current = (force = false) => {
    const map = mapRef.current;
    if (!map || validPoints.length === 0) return;
    if (!force && userMovedRef.current) return;

    try {
      if (validPoints.length === 1) {
        const p = validPoints[0];
        map.easeTo({ center: [p.lon, p.lat], zoom: 10, duration: 500 });
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const p of validPoints) bounds.extend([p.lon, p.lat]);
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
      maxZoom: 12,
      attributionControl: true,
    });
    mapRef.current = map;

    map.scrollZoom.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on("dragstart", () => {
      userMovedRef.current = true;
    });
    map.on("movestart", () => {
      userMovedRef.current = true;
    });

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource(SOURCE_ID, { type: "geojson", data: featureCollection as any });
      map.addLayer({
        id: LAYER_POINTS_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": ["case", ["boolean", ["get", "selected"], false], 9, 7],
          "circle-color": "#dc2626",
          "circle-stroke-color": ["case", ["boolean", ["get", "selected"], false], "#7f1d1d", "#ffffff"],
          "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 3, 2],
          "circle-opacity": 0.9,
        },
      });
      map.addLayer({
        id: LAYER_LABELS_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "text-field": ["get", "title"],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });

      applyViewRef.current(true);
      lastPointsKeyRef.current = pointsKey;
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    const timer = window.setTimeout(() => {
      map.resize();
      applyViewRef.current(true);
    }, 50);

    return () => {
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [featureCollection, pointsKey, validPoints.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (src) src.setData(featureCollection as any);

    const pointsChanged = pointsKey !== lastPointsKeyRef.current;
    if (pointsChanged) {
      userMovedRef.current = false;
      applyViewRef.current(true);
      lastPointsKeyRef.current = pointsKey;
    }
  }, [featureCollection, pointsKey]);

  if (validPoints.length === 0) return null;
  return <div ref={containerRef} className="w-full h-[260px] sm:h-[320px] rounded-xl overflow-hidden bg-muted" />;
}

