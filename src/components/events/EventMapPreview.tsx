import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventItem } from "@/data/events";

interface EventMapPreviewProps {
  events: EventItem[];
  highlightedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

function toMapPosition(
  item: EventItem,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
) {
  const latDenom = Math.max(bounds.maxLat - bounds.minLat, 0.1);
  const lngDenom = Math.max(bounds.maxLng - bounds.minLng, 0.1);
  const x = ((item.lng - bounds.minLng) / lngDenom) * 100;
  const y = 100 - ((item.lat - bounds.minLat) / latDenom) * 100;
  return {
    left: `${Math.min(94, Math.max(6, x))}%`,
    top: `${Math.min(92, Math.max(8, y))}%`,
  };
}

export function EventMapPreview({
  events,
  highlightedEventId,
  onSelectEvent,
  onPrev,
  onNext,
}: EventMapPreviewProps) {
  const bounds = events.reduce(
    (acc, item) => ({
      minLat: Math.min(acc.minLat, item.lat),
      maxLat: Math.max(acc.maxLat, item.lat),
      minLng: Math.min(acc.minLng, item.lng),
      maxLng: Math.max(acc.maxLng, item.lng),
    }),
    { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 }
  );

  return (
    <div className="relative h-[300px] overflow-hidden rounded-2xl border border-border/70 bg-[#edf2ed] shadow-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,#f6faf6_0%,transparent_44%),radial-gradient(circle_at_80%_72%,#dce8df_0%,transparent_35%),linear-gradient(160deg,#f3f7f3_0%,#e6ede7_55%,#d9e4dc_100%)]" />
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(120deg,rgba(79,108,89,0.2)_1px,transparent_1px),linear-gradient(40deg,rgba(79,108,89,0.14)_1px,transparent_1px)] [background-size:64px_64px,80px_80px]" />

      {events.map((event) => {
        const isActive = event.id === highlightedEventId;
        const pos = toMapPosition(event, bounds);
        return (
          <button
            key={event.id}
            onClick={() => onSelectEvent(event.id)}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all",
              isActive ? "z-20 scale-110" : "z-10 scale-100"
            )}
            style={pos}
            aria-label={event.title}
          >
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-[18px] border border-white bg-white shadow-[0_8px_20px_rgba(47,107,79,0.25)]",
                isActive ? "ring-2 ring-primary/35" : ""
              )}
            >
              <CalendarDays className="h-5 w-5 text-primary" />
            </span>
          </button>
        );
      })}

      <div className="absolute right-3 top-3 h-24 w-28 overflow-hidden rounded-xl border border-white/80 bg-white/85 shadow-sm backdrop-blur-sm">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#eff6ef_0%,#dfebe1_100%)]" />
        {events.map((event) => {
          const pos = toMapPosition(event, bounds);
          return (
            <span
              key={`mini-${event.id}`}
              className={cn(
                "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                event.id === highlightedEventId ? "bg-primary" : "bg-primary/55"
              )}
              style={pos}
            />
          );
        })}
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
    </div>
  );
}
