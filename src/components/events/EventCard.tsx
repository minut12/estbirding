import { CalendarDays, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEventCountdown, formatEventDate, et } from "@/localization/et";
import type { EventItem } from "@/data/events";

interface EventCardProps {
  event: EventItem;
  selected: boolean;
  onPress: () => void;
  cardRef?: (node: HTMLButtonElement | null) => void;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function EventCard({
  event,
  selected,
  onPress,
  cardRef,
  canManage,
  onEdit,
  onDelete,
}: EventCardProps) {
  const countdown = formatEventCountdown(event.startAt);
  return (
    <div
      className={cn(
        "w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition",
        selected
          ? "border-primary/55 bg-primary/[0.04] ring-1 ring-primary/25"
          : "border-border/70 hover:border-primary/25"
      )}
    >
      <button ref={cardRef} onClick={onPress} className="w-full text-left">
        <div className="flex gap-3">
          <img
            src={event.imageUrl}
            alt={event.title}
            loading="lazy"
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
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-foreground">{countdown}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {event.locationName}
            </p>
          </div>
        </div>
      </button>

      {canManage && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onEdit} className="rounded-lg border border-border px-2 py-1.5 text-xs">Muuda</button>
          <button onClick={onDelete} className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700">Kustuta</button>
        </div>
      )}
    </div>
  );
}
