import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useMemo } from "react";
import type { EventItem } from "@/data/events";

interface EventMapPreviewProps {
  events: EventItem[];
  highlightedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildStaticMapUrl(events: EventItem[]): string {
  const base = "https://staticmap.openstreetmap.de/staticmap.php";
  const params = new URLSearchParams();
  params.set("size", "800x420");

  const points = events.filter(
    (event) =>
      Number.isFinite(event.lat) &&
      Number.isFinite(event.lng) &&
      Math.abs(event.lat) <= 90 &&
      Math.abs(event.lng) <= 180,
  );

  if (!points.length) {
    params.set("center", "58.7,25.0");
    params.set("zoom", "7");
    return `${base}?${params.toString()}`;
  }

  const lats = points.map((event) => event.lat);
  const lngs = points.map((event) => event.lng);
  const centerLat = clamp(avg(lats), -90, 90);
  const centerLng = clamp(avg(lngs), -180, 180);

  let zoom = 7;
  if (points.length === 1) {
    zoom = 11;
  } else {
    const spanLat = Math.max(...lats) - Math.min(...lats);
    const spanLng = Math.max(...lngs) - Math.min(...lngs);
    const span = Math.max(spanLat, spanLng);
    if (span > 20) zoom = 4;
    else if (span > 10) zoom = 5;
    else if (span > 5) zoom = 6;
    else if (span > 2) zoom = 7;
    else if (span > 1) zoom = 8;
    else if (span > 0.5) zoom = 9;
    else zoom = 10;
  }

  params.set("center", `${centerLat},${centerLng}`);
  params.set("zoom", String(zoom));

  for (const event of points.slice(0, 60)) {
    params.append("markers", `${event.lat},${event.lng},red-pushpin`);
  }

  return `${base}?${params.toString()}`;
}

export function EventMapPreview({
  events,
  highlightedEventId,
  onSelectEvent,
  onPrev,
  onNext,
}: EventMapPreviewProps) {
  const points = useMemo(
    () =>
      events.filter(
        (event) =>
          Number.isFinite(event.lat) &&
          Number.isFinite(event.lng) &&
          Math.abs(event.lat) <= 90 &&
          Math.abs(event.lng) <= 180,
      ),
    [events],
  );
  const mapUrl = useMemo(() => buildStaticMapUrl(points), [points]);

  return (
    <div className="relative w-full h-[260px] sm:h-[320px] overflow-hidden rounded-xl border border-border/70 bg-[#edf2ed] shadow-sm">
      <img
        src={mapUrl}
        alt="Ürituste kaart"
        className="h-full w-full object-cover"
        loading="lazy"
      />

      <div className="absolute right-3 top-3 h-24 w-28 overflow-y-auto rounded-xl border border-white/80 bg-white/85 p-1.5 shadow-sm backdrop-blur-sm">
        {points.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Markereid pole</p>
        ) : (
          <div className="space-y-1">
            {points.slice(0, 4).map((event) => (
              <button
                key={event.id}
                onClick={() => onSelectEvent(event.id)}
                className={`w-full truncate rounded px-1.5 py-1 text-left text-[11px] ${
                  highlightedEventId === event.id ? "bg-primary/15 text-foreground" : "hover:bg-black/5"
                }`}
                title={event.title}
              >
                {event.title}
              </button>
            ))}
          </div>
        )}
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

      <div className="absolute bottom-3 left-3 rounded bg-white/85 px-2 py-1 text-[11px] text-muted-foreground">
        © OpenStreetMap contributors
      </div>
    </div>
  );
}

