import { useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, CalendarPlus, Link2, MapPin, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { et, formatEventCountdown } from "@/localization/et";
import type { EventCategory, EventItem } from "@/data/events";
import { getProxiedImageUrl } from "@/features/news/newsImage";
import { resolveProxyBase } from "@/config/proxyEndpoint";
import { downloadEventIcs } from "@/lib/ics";
import { ADMIN_BUTTON_CLASS, useConfirmDelete } from "@/components/events/EventCard";
import { Button } from "@/components/ui/button";

interface EventDetailsScreenProps {
  event: EventItem;
  onBack: () => void;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

const TIME_ZONE = "Europe/Tallinn";
const EN_DASH = String.fromCharCode(0x2013);

// Same dot colours as the source chips in EventsScreen (not exported there; importing would be circular).
const CATEGORY_DOT_CLASS: Record<EventCategory, string> = {
  EstBirding: "bg-primary",
  EOY: "bg-sky-600",
  Muud: "bg-muted-foreground",
};

const LONG_DATE_FORMAT = new Intl.DateTimeFormat("et-EE", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const END_DATE_FORMAT = new Intl.DateTimeFormat("et-EE", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const TIME_FORMAT = new Intl.DateTimeFormat("et-EE", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const META_LINK_CLASS = "text-[13px] font-semibold text-primary no-underline hover:opacity-80";

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function capitalizeFirst(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

interface DateLines {
  primary: string;
  secondary: string;
}

function buildDateLines(startAt: string, endAt: string | undefined): DateLines | null {
  const start = parseDate(startAt);
  if (!start) return null;
  const end = parseDate(endAt);
  const validEnd = end && end.getTime() > start.getTime() ? end : null;
  const isSameDay = validEnd !== null && DAY_KEY_FORMAT.format(validEnd) === DAY_KEY_FORMAT.format(start);
  const startDate = capitalizeFirst(LONG_DATE_FORMAT.format(start));
  const primary = validEnd && !isSameDay ? `${startDate} ${EN_DASH} ${END_DATE_FORMAT.format(validEnd)}` : startDate;
  const times = validEnd && isSameDay
    ? `${TIME_FORMAT.format(start)}${EN_DASH}${TIME_FORMAT.format(validEnd)}`
    : TIME_FORMAT.format(start);
  return { primary, secondary: `${times}${et.metaSeparator}${formatEventCountdown(startAt)}` };
}

function hasUsableCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

function buildMapUrl(event: EventItem): string | null {
  const base = "https://www.google.com/maps/search/?api=1&query=";
  if (hasUsableCoords(event.lat, event.lng)) return `${base}${event.lat},${event.lng}`;
  return `${base}${encodeURIComponent(event.locationName.trim())}`;
}

interface ParsedLink {
  href: string;
  host: string;
}

function parseEventUrl(raw: string | undefined): ParsedLink | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { href: url.href, host: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

function SourcePill({ category, className }: { category: EventCategory; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", CATEGORY_DOT_CLASS[category])} aria-hidden="true" />
      {et.categoryLabel(category)}
    </span>
  );
}

interface MetaRowProps {
  icon: LucideIcon;
  primary: ReactNode;
  secondary: ReactNode;
}

function MetaRow({ icon: Icon, primary, secondary }: MetaRowProps) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-px h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
      <div className="min-w-0">
        <div className="break-words text-foreground">{primary}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{secondary}</div>
      </div>
    </div>
  );
}

function AdminRow({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) {
  const { isArmed, handleClick } = useConfirmDelete(onDelete);
  const buttonClass = "h-8 w-auto gap-1.5 px-3 sm:h-8 sm:px-3";
  return (
    <div className="flex justify-end gap-2 border-t border-dashed border-border pt-3">
      <button
        type="button"
        onClick={onEdit}
        className={cn(ADMIN_BUTTON_CLASS, buttonClass, "border border-border bg-card text-foreground hover:bg-muted")}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        {et.edit}
      </button>
      <button
        type="button"
        onClick={handleClick}
        className={cn(ADMIN_BUTTON_CLASS, buttonClass, "bg-destructive/10 text-destructive hover:bg-destructive/15")}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {isArmed ? et.confirmDelete : et.delete}
      </button>
    </div>
  );
}

export function EventDetailsScreen({ event, onBack, canManage, onEdit, onDelete }: EventDetailsScreenProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = event.imageUrl.trim();
  const showHero = imageUrl !== "" && failedImageUrl !== imageUrl;
  const dateLines = buildDateLines(event.startAt, event.endAt);
  const locationName = event.locationName.trim();
  const mapUrl = locationName ? buildMapUrl(event) : null;
  const link = parseEventUrl(event.url);
  const description = event.description?.trim() ?? "";

  const handleDelete = () => {
    onDelete?.();
    onBack();
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <button
        type="button"
        onClick={onBack}
        className="flex w-full shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2.5 text-left text-sm font-medium text-foreground"
      >
        <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
        {et.eventsTitle}
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="min-[901px]:mx-auto min-[901px]:max-w-[680px] min-[901px]:px-5 min-[901px]:pt-5">
          {showHero && (
            <div className="relative aspect-[4/3] overflow-hidden min-[901px]:aspect-video min-[901px]:rounded-2xl">
              <img
                src={getProxiedImageUrl(imageUrl, resolveProxyBase())}
                alt={event.title}
                onError={() => setFailedImageUrl(imageUrl)}
                className="h-full w-full object-cover"
              />
              <SourcePill
                category={event.category}
                className="absolute bottom-3 left-3.5 bg-white/[0.92] text-[hsl(150_10%_15%)]"
              />
            </div>
          )}

          <div className="flex flex-col gap-3.5 bg-card p-4 min-[901px]:px-0">
            {!showHero && (
              <SourcePill category={event.category} className="self-start border border-border bg-muted text-foreground" />
            )}

            <h1 className="text-xl font-semibold leading-tight text-foreground text-balance">{event.title}</h1>

            {dateLines && <MetaRow icon={CalendarDays} primary={dateLines.primary} secondary={dateLines.secondary} />}

            {locationName && (
              <MetaRow
                icon={MapPin}
                primary={locationName}
                secondary={mapUrl ? (
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={META_LINK_CLASS}>
                    {et.openOnMap}
                  </a>
                ) : null}
              />
            )}

            {link && (
              <MetaRow
                icon={Link2}
                primary={link.host}
                secondary={(
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className={META_LINK_CLASS}>
                    {et.openOriginal}
                  </a>
                )}
              />
            )}

            {description && (
              <p className="max-w-[65ch] whitespace-pre-line text-[15px] leading-relaxed text-foreground">
                {description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadEventIcs(event)}
                className={cn(!link && "col-span-2")}
              >
                <CalendarPlus aria-hidden="true" />
                {et.addToCalendar}
              </Button>
              {link && (
                <Button asChild>
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    {et.openOriginal}
                  </a>
                </Button>
              )}
            </div>

            {canManage && <AdminRow onEdit={onEdit} onDelete={handleDelete} />}
          </div>
        </div>
      </div>
    </div>
  );
}
