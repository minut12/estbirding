import { CalendarDays, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEventDate, et } from "@/localization/et";
import type { EventItem } from "@/data/events";

interface EventCardProps {
  event: EventItem;
  selected: boolean;
  onPress: () => void;
  cardRef?: (node: HTMLButtonElement | null) => void;
}

export function EventCard({ event, selected, onPress, cardRef }: EventCardProps) {
  return (
    <button
      ref={cardRef}
      onClick={onPress}
      className={cn(
        "w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition",
        selected
          ? "border-primary/55 bg-primary/[0.04] ring-1 ring-primary/25"
          : "border-border/70 hover:border-primary/25"
      )}
    >
      <div className="flex gap-3">
        <img
          src={event.imageUrl}
          alt={event.title}
          className="h-20 w-24 shrink-0 rounded-xl object-cover bg-muted"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="line-clamp-2 text-sm font-semibold text-foreground">{event.title}</h4>
            <span className="shrink-0 rounded-full bg-[#DDEBE3] px-2.5 py-1 text-xs font-medium text-primary">
              {et.categoryLabel(event.category)}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatEventDate(event.startAt)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {event.locationName}
          </p>
        </div>
      </div>
    </button>
  );
}
