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
const IMAGE_ID = "kingfisher";
const LAYER_ICONS_ID = "events-icons";
const LAYER_DEBUG_ID = "events-debug-circles";
const LAYER_LABELS_ID = "events-labels";
const KINGFISHER_ICON_URL = "/icons/kingfisher.svg";

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

function addDebugCircleLayer(map: MapLibreMap): void {
  if (map.getLayer(LAYER_DEBUG_ID)) return;
  map.addLayer({
    id: LAYER_DEBUG_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": ["case", ["boolean", ["get", "selected"], false], 8, 6],
      "circle-color": "#0b5fa5",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity": 0.75,
    },
  });
}

function loadKingfisherIcon(map: MapLibreMap): Promise<maplibregl.StyleImage | null> {
  return new Promise((resolve) => {
    map.loadImage(KINGFISHER_ICON_URL, (error, image) => {
      if (error || !image) {
        console.warn("[events-map] kingfisher icon load failed", error);
        resolve(null);
        return;
      }
      resolve(image);
    });
  });
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
        geometry: { type: "Point" as const, coordinates: [Number(p.lon), Number(p.lat)] as [number, number] },
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
        map.easeTo({ center: [p.lon, p.lat], zoom: 12, duration: 400 });
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const p of validPoints) bounds.extend([p.lon, p.lat]);
      map.fitBounds(bounds as LngLatBoundsLike, { padding: 40, maxZoom: 13, duration: 500 });
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

    map.on("load", async () => {
      loadedRef.current = true;
      map.addSource(SOURCE_ID, { type: "geojson", data: featureCollection as any });

      addDebugCircleLayer(map);

      const iconImage = await loadKingfisherIcon(map);
      if (iconImage && !map.hasImage(IMAGE_ID)) {
        map.addImage(IMAGE_ID, iconImage);
      }
      if (map.hasImage(IMAGE_ID) && !map.getLayer(LAYER_ICONS_ID)) {
        map.addLayer({
          id: LAYER_ICONS_ID,
          type: "symbol",
          source: SOURCE_ID,
          layout: {
            "icon-image": IMAGE_ID,
            "icon-size": ["case", ["boolean", ["get", "selected"], false], 1.15, 0.9],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-anchor": "bottom",
          },
        });
      }
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

    if (validPoints.length > 0 && !map.getLayer(LAYER_ICONS_ID) && !map.getLayer(LAYER_DEBUG_ID)) {
      console.warn("[events-map] points exist but marker layer missing", {
        points: validPoints.length,
        zoom: map.getZoom(),
        center: map.getCenter(),
      });
    }

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
