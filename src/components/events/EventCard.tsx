import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { et, formatEventCountdown, formatEventMonthAbbr } from "@/localization/et";
import type { EventCategory, EventItem } from "@/data/events";
import { BirdPlaceholder } from "./BirdPlaceholder";
import { getProxiedImageUrl } from "@/features/news/newsImage";
import { resolveProxyBase } from "@/config/proxyEndpoint";

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

function DateBlock({ startAt, isNext }: { startAt: string; isNext: boolean }) {
  return (
    <div
      className={cn(
        "flex w-12 shrink-0 flex-col items-center justify-center rounded-lg py-1.5",
        isNext ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
      )}
    >
      <span className="text-lg font-semibold leading-none">{formatDayNumber(startAt)}</span>
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
