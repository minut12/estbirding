import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { CalendarDays, CalendarPlus, MapPin, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { et, formatEventCountdown, formatEventMonthAbbr } from "@/localization/et";
import type { EventCategory, EventItem } from "@/data/events";
import { BirdPlaceholder } from "./BirdPlaceholder";
import { getProxiedImageUrl } from "@/features/news/newsImage";
import { resolveProxyBase } from "@/config/proxyEndpoint";
import { Button } from "@/components/ui/button";
import { downloadEventIcs } from "@/lib/ics";
import { buildDateLines } from "@/features/events/eventDates";

const CONFIRM_DELETE_MS = 4000;

interface EventRowProps {
  event: EventItem;
  /** True for the single next upcoming event (highlighted date block). */
  isNext: boolean;
  isPast: boolean;
  onPress: () => void;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

function formatDayNumber(dateStr: string): string {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? "?" : String(d.getDate());
}

function buildMeta(event: EventItem): string {
  return [formatEventCountdown(event.startAt), event.locationName, et.categoryLabel(event.category)]
    .filter(Boolean)
    .join(et.metaSeparator);
}

/** Two-step delete: first click arms for CONFIRM_DELETE_MS, second click calls onConfirm. */
export function useConfirmDelete(onConfirm: (() => void) | undefined) {
  const [isArmed, setIsArmed] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const handleClick = useCallback(() => {
    if (isArmed) {
      clearTimer();
      setIsArmed(false);
      onConfirm?.();
      return;
    }
    setIsArmed(true);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setIsArmed(false);
    }, CONFIRM_DELETE_MS);
  }, [isArmed, clearTimer, onConfirm]);

  return { isArmed, handleClick };
}

interface AdminActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
}

export const ADMIN_BUTTON_CLASS =
  "inline-flex h-8 w-8 items-center justify-center gap-1 rounded-md text-xs transition-colors sm:h-7 sm:w-auto sm:px-2";

function AdminActions({ onEdit, onDelete }: AdminActionsProps) {
  const { isArmed, handleClick } = useConfirmDelete(onDelete);
  const deleteLabel = isArmed ? et.confirmDelete : et.delete;

  const handleEdit = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onEdit?.();
  };

  const handleDelete = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    handleClick();
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={handleEdit}
        aria-label={et.edit}
        className={cn(ADMIN_BUTTON_CLASS, "text-muted-foreground hover:bg-muted hover:text-foreground")}
      >
        <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{et.edit}</span>
      </button>
      <button
        type="button"
        onClick={handleDelete}
        aria-label={deleteLabel}
        className={cn(
          ADMIN_BUTTON_CLASS,
          isArmed
            ? "text-destructive sm:bg-destructive/10 hover:bg-destructive/15"
            : "text-muted-foreground hover:bg-muted hover:text-destructive",
        )}
      >
        <Trash2
          className={cn("h-4 w-4 sm:h-3.5 sm:w-3.5", isArmed && "text-destructive")}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">{deleteLabel}</span>
      </button>
    </div>
  );
}

interface ThumbProps {
  id: string;
  category: EventCategory;
  imageUrl: string;
  className: string;
}

function EventThumb({ id, category, imageUrl, className }: ThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!imageUrl || failedUrl === imageUrl) return <BirdPlaceholder id={id} category={category} className={className} />;
  return (
    <img
      src={getProxiedImageUrl(imageUrl, resolveProxyBase())}
      alt=""
      loading="lazy"
      className={cn("shrink-0 bg-muted object-cover", className)}
      onError={() => setFailedUrl(imageUrl)}
    />
  );
}

interface DateBlockProps {
  startAt: string;
  isNext: boolean;
  size?: "default" | "large";
}

function DateBlock({ startAt, isNext, size = "default" }: DateBlockProps) {
  const isLarge = size === "large";
  return (
    <div
      className={cn(
        "flex w-12 shrink-0 flex-col items-center justify-center rounded-lg py-1.5",
        isNext ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        isLarge && "w-16",
      )}
    >
      <span className={cn("text-lg font-semibold leading-none", isLarge && "text-[22px]")}>
        {formatDayNumber(startAt)}
      </span>
      <span
        className={cn(
          "mt-1 text-[10px] uppercase tracking-wide",
          isNext ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {formatEventMonthAbbr(startAt)}
      </span>
    </div>
  );
}

/** List row (phone + desktop): date block, 48px thumb, title, meta, inline admin actions. */
export function EventRow({ event, isNext, isPast, onPress, canManage, onEdit, onDelete }: EventRowProps) {
  return (
    <div className={cn("flex items-center gap-2 px-4 py-3", isPast && "opacity-60")}>
      <button type="button" onClick={onPress} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <DateBlock startAt={event.startAt} isNext={isNext} />
        <EventThumb id={event.id} category={event.category} imageUrl={event.imageUrl} className="h-12 w-12 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{event.title}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{buildMeta(event)}</div>
        </div>
      </button>
      {canManage && <AdminActions onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
}

interface EventFeaturedCardProps {
  event: EventItem;
  onPress: () => void;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Desktop next-event card: bordered, 112x76 thumb, 2-line description snippet. */
export function EventFeaturedCard({ event, onPress, canManage, onEdit, onDelete }: EventFeaturedCardProps) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-2xl border border-border bg-card p-3">
      <button type="button" onClick={onPress} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <DateBlock startAt={event.startAt} isNext />
        <EventThumb id={event.id} category={event.category} imageUrl={event.imageUrl} className="h-[76px] w-[112px] rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-foreground">{event.title}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{buildMeta(event)}</div>
          {event.description && (
            <p className="mt-1.5 line-clamp-2 text-sm text-foreground/80">{event.description}</p>
          )}
        </div>
      </button>
      {canManage && <AdminActions onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
}

// Same dot colours as CATEGORY_DOT_CLASS in EventDetailsScreen (not imported; that file imports this one).
const CATEGORY_DOT_CLASS: Record<EventCategory, string> = {
  EstBirding: "bg-primary",
  EOY: "bg-sky-600",
  Muud: "bg-muted-foreground",
};

/** Wide (>=1200px) next-event card: large image left, details + actions right. */
export function EventFeaturedWide({ event, onPress, canManage, onEdit, onDelete }: EventFeaturedCardProps) {
  const dateLines = buildDateLines(event.startAt, event.endAt);
  return (
    <div className="grid grid-cols-[520px_minmax(0,1fr)] overflow-hidden rounded-[22px] border border-border bg-card">
      <button type="button" onClick={onPress} className="block h-full text-left">
        <EventThumb
          id={event.id}
          category={event.category}
          imageUrl={event.imageUrl}
          className="h-full min-h-[300px] w-full rounded-none"
        />
      </button>
      <div className="flex flex-col gap-3 p-8">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {`${et.nextEvent}${et.metaSeparator}${formatEventCountdown(event.startAt)}`}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground/80">
            <span className={cn("h-2 w-2 rounded-full", CATEGORY_DOT_CLASS[event.category])} aria-hidden="true" />
            {et.categoryLabel(event.category)}
          </span>
        </div>
        <button
          type="button"
          onClick={onPress}
          className="text-left text-[30px] font-semibold leading-tight tracking-tight text-balance text-foreground"
        >
          {event.title}
        </button>
        <div className="flex flex-wrap gap-7 text-sm text-foreground/80">
          {dateLines && (
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {`${dateLines.primary}${et.metaSeparator}${dateLines.times}`}
            </span>
          )}
          {event.locationName && (
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {event.locationName}
            </span>
          )}
        </div>
        {event.description && (
          <p className="line-clamp-3 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
            {event.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2.5">
          <Button onClick={onPress}>{et.viewEvent}</Button>
          <Button variant="outline" onClick={() => downloadEventIcs(event)}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {et.addToCalendar}
          </Button>
          {canManage && (
            <div className="ml-auto">
              <AdminActions onEdit={onEdit} onDelete={onDelete} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Wide (>=1200px) agenda row: large date block, 168px thumb, title + snippet, time + place, admin actions. */
export function EventRowWide({ event, isNext, isPast, onPress, canManage, onEdit, onDelete }: EventRowProps) {
  const dateLines = buildDateLines(event.startAt, event.endAt);
  return (
    <div
      className={cn(
        "grid grid-cols-[64px_168px_minmax(0,1fr)_220px_auto] items-center gap-5 border-b border-border px-4 py-4 last:border-b-0",
        isPast && "opacity-60",
      )}
    >
      <button type="button" onClick={onPress} className="col-span-4 grid grid-cols-subgrid items-center text-left">
        <DateBlock startAt={event.startAt} isNext={isNext} size="large" />
        <EventThumb id={event.id} category={event.category} imageUrl={event.imageUrl} className="h-24 w-[168px] rounded-xl" />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-foreground">{event.title}</div>
          {event.description && (
            <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{event.description}</div>
          )}
        </div>
        <div className="min-w-0 text-[13px]">
          <div className="truncate text-foreground">{dateLines?.times ?? ""}</div>
          {event.locationName && <div className="truncate text-muted-foreground">{event.locationName}</div>}
        </div>
      </button>
      {canManage ? <AdminActions onEdit={onEdit} onDelete={onDelete} /> : <span />}
    </div>
  );
}
