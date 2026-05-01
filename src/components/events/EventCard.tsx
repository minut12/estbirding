import { CalendarDays, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEventCountdown, formatEventDate, et } from "@/localization/et";
import type { EventItem } from "@/data/events";

type EventCardVariant = "full" | "compact";

interface EventCardProps {
  event: EventItem;
  selected: boolean;
  onPress: () => void;
  cardRef?: (node: HTMLButtonElement | null) => void;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  variant?: EventCardVariant;
}

const ESTONIAN_MONTH_ABBRS = [
  "jaan", "veebr", "märts", "apr", "mai", "juuni",
  "juuli", "aug", "sept", "okt", "nov", "dets",
];

function formatDayNumber(dateStr: string): string {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? "?" : String(d.getDate());
}

function formatMonthAbbr(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return ESTONIAN_MONTH_ABBRS[d.getMonth()] ?? "";
}

function calendarDayDiff(dateStr: string, now = new Date()): number | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startDay.getTime() - today.getTime()) / 86400000);
}

export function EventCard({
  event,
  selected,
  onPress,
  cardRef,
  canManage,
  onEdit,
  onDelete,
  variant = "full",
}: EventCardProps) {
  if (variant === "compact") {
    const dayNum = formatDayNumber(event.startAt);
    const monthAbbr = formatMonthAbbr(event.startAt);
    const diff = calendarDayDiff(event.startAt);
    const countdownLabel =
      diff == null ? "" : diff < 0 ? `${Math.abs(diff)} päeva tagasi` : `${diff} päeva jäänud`;
    const subtitleParts = [event.locationName, countdownLabel].filter(Boolean);

    return (
      <div
        className={cn(
          "group border-b border-border last:border-b-0 transition-colors",
          selected && "bg-primary/5",
        )}
      >
        <button
          ref={cardRef}
          onClick={onPress}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <div className="flex w-12 flex-col items-center justify-center rounded-md border border-border bg-background py-1">
            <span className="text-base font-semibold leading-none text-foreground">{dayNum}</span>
            <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{monthAbbr}</span>
          </div>

          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt=""
              loading="lazy"
              className="h-11 w-11 flex-shrink-0 rounded-md object-cover bg-muted"
            />
          ) : (
            <div className="h-11 w-11 flex-shrink-0 rounded-md bg-muted" />
          )}

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{event.title}</div>
            {subtitleParts.length > 0 && (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {subtitleParts.join(" · ")}
              </div>
            )}
          </div>

          <span
            className={cn(
              "hidden flex-shrink-0 rounded px-2 py-0.5 text-[11px] sm:inline-flex",
              event.category === "EstBirding"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {et.categoryLabel(event.category)}
          </span>
        </button>

        {canManage && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-3">
            <button
              onClick={onEdit}
              className="rounded-lg border border-border px-2 py-1.5 text-xs"
            >
              Muuda
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700"
            >
              Kustuta
            </button>
          </div>
        )}
      </div>
    );
  }

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
