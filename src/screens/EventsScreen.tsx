import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FeatureVersionBadge } from "@/components/FeatureVersionBadge";
import { RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { et, formatEventMonthLabel } from "@/localization/et";
import { type EventCategory, type EventItem } from "@/data/events";
import { EventFeaturedCard, EventFeaturedWide, EventRow, EventRowWide } from "@/components/events/EventCard";
import {
  deleteManualEvent,
  listPublicEventsManual,
  type ManualEventRow,
  type ManualEventType,
} from "@/features/events/eventsService";
import { useAuth } from "@/features/auth/AuthContext";
import { EventLinkSheet } from "@/features/events/EventLinkSheet";
import { EventDetailsScreen } from "./EventDetailsScreen";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MainTab = "tulevased" | "moodunud";
type ChipKey = "koik" | ManualEventType;

type MonthGroup = {
  key: string;
  label: string;
  events: EventItem[];
};

const DESKTOP_EVENTS_QUERY = "(min-width: 901px)";
const WIDE_EVENTS_QUERY = "(min-width: 1200px)";

// Copied from NewsTab (do not import across features).
const CHIP_BASE = "shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-xs font-medium transition-colors";
const CHIP_ACTIVE = "bg-foreground text-background border-foreground";
const CHIP_INACTIVE = "border-border bg-card text-foreground/80";

const CATEGORY_BY_TYPE: Record<ManualEventType, EventCategory> = {
  estbirding: "EstBirding",
  eoy: "EOY",
  muud: "Muud",
};

const CHIPS: ReadonlyArray<{ key: ChipKey; label: string; dotClass: string | null }> = [
  { key: "koik", label: et.chips.koik, dotClass: null },
  { key: "estbirding", label: et.chips.estbirding, dotClass: "bg-primary" },
  { key: "eoy", label: et.chips.eoy, dotClass: "bg-sky-600" },
  { key: "muud", label: et.chips.muud, dotClass: "bg-muted-foreground" },
];

function useIsDesktopEvents(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(DESKTOP_EVENTS_QUERY).matches
  ));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(DESKTOP_EVENTS_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

function useIsWideEvents(): boolean {
  const [isWide, setIsWide] = useState<boolean>(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(WIDE_EVENTS_QUERY).matches
  ));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(WIDE_EVENTS_QUERY);
    const onChange = () => setIsWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isWide;
}

function groupByMonth(events: EventItem[], reverseChronological: boolean): MonthGroup[] {
  const buckets = new Map<string, EventItem[]>();
  for (const ev of events) {
    const d = new Date(ev.startAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, [...(buckets.get(key) ?? []), ev]);
  }
  const byTime = (a: EventItem, b: EventItem): number => {
    const diff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    return reverseChronological ? -diff : diff;
  };
  return Array.from(buckets.entries())
    .map(([key, evs]) => {
      const [yStr, mStr] = key.split("-");
      return {
        key,
        label: formatEventMonthLabel(Number(yStr), Number(mStr) - 1),
        events: [...evs].sort(byTime),
      };
    })
    .sort((a, b) => (reverseChronological ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)));
}

function toEventItem(row: ManualEventRow): EventItem {
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  const safeLat = Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : Number.NaN;
  const safeLon = Number.isFinite(lon) && Math.abs(lon) <= 180 ? lon : Number.NaN;
  const imageCandidate = String(row.image_url || "").trim();
  const validImage =
    imageCandidate.startsWith("data:image/") ||
    imageCandidate.startsWith("http://") ||
    imageCandidate.startsWith("https://");
  return {
    id: row.id,
    title: row.title,
    startAt: row.starts_at,
    endAt: row.ends_at || undefined,
    locationName: (row.location_name || "").trim(),
    lat: safeLat,
    lng: safeLon,
    category: CATEGORY_BY_TYPE[row.type] ?? "EstBirding",
    imageUrl: validImage ? imageCandidate : "",
    description: row.description || undefined,
    url: row.url || undefined,
    isPublished: row.status === "active",
  };
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export default function EventsScreen() {
  const [mainTab, setMainTab] = useState<MainTab>("tulevased");
  const [chip, setChip] = useState<ChipKey>("koik");
  const [searchValue, setSearchValue] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [openedDetails, setOpenedDetails] = useState<EventItem | null>(null);
  const [rows, setRows] = useState<ManualEventRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ManualEventRow | null>(null);
  const isDesktop = useIsDesktopEvents();
  const isWide = useIsWideEvents();

  const todayStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const { isAdmin } = useAuth();
  const canManage = isAdmin;

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listPublicEventsManual();
      setRows(data);
    } catch (error) {
      toast.error(toErrorMessage(error));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const events = useMemo(
    () => rows.filter((row) => chip === "koik" || row.type === chip).map(toEventItem),
    [rows, chip],
  );

  const filteredEvents = useMemo(() => {
    const searchTerm = searchValue.trim().toLowerCase();
    return events.filter((event) => {
      const isUpcoming = new Date(event.startAt) >= todayStart;
      const tabMatch = mainTab === "tulevased" ? isUpcoming : !isUpcoming;
      const searchMatch = searchTerm
        ? event.title.toLowerCase().includes(searchTerm) ||
          event.locationName.toLowerCase().includes(searchTerm)
        : true;
      return tabMatch && searchMatch;
    });
  }, [events, mainTab, searchValue, todayStart]);

  const isPastTab = mainTab === "moodunud";
  const groups = useMemo(() => groupByMonth(filteredEvents, isPastTab), [filteredEvents, isPastTab]);
  const nextEventId = isPastTab ? null : groups[0]?.events[0]?.id ?? null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadEvents(), new Promise((resolve) => setTimeout(resolve, 350))]);
    setIsRefreshing(false);
  };

  const openCreate = () => {
    setEditingRow(null);
    setDialogOpen(true);
  };

  const openEdit = (eventId: string) => {
    const row = rows.find((r) => r.id === eventId);
    if (!row) return;
    setEditingRow(row);
    setDialogOpen(true);
  };

  const onDelete = async (eventId: string) => {
    try {
      await deleteManualEvent(eventId);
      await loadEvents();
      toast.success(et.eventDeleted);
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  if (openedDetails) {
    const detailsId = openedDetails.id;
    return (
      <EventDetailsScreen
        event={openedDetails}
        onBack={() => setOpenedDetails(null)}
        canManage={canManage}
        onEdit={() => {
          setOpenedDetails(null);
          openEdit(detailsId);
        }}
        onDelete={() => void onDelete(detailsId)}
      />
    );
  }

  const titleEl = <h2 className="text-lg font-semibold text-foreground">{et.eventsTitle}<FeatureVersionBadge id="uritused" /></h2>;

  const addButtonEl = canManage ? (
    <Button size="sm" onClick={openCreate}>
      {et.eventLink.titleCreate}
    </Button>
  ) : null;

  const refreshEl = (
    <button
      type="button"
      onClick={handleRefresh}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground"
      aria-label={et.refresh}
    >
      <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
    </button>
  );

  const segmentButtonClass = (active: boolean) => cn(
    isDesktop ? "px-3" : "flex-1",
    "py-1.5 text-sm font-medium rounded-md transition-colors",
    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
  );

  const segmentEl = (
    <div className={isDesktop ? "flex gap-1 bg-muted rounded-lg p-1 shrink-0" : "flex gap-1 bg-muted rounded-lg p-1"}>
      <button type="button" onClick={() => setMainTab("tulevased")} className={segmentButtonClass(mainTab === "tulevased")}>
        {et.tabs.tulevased}
      </button>
      <button type="button" onClick={() => setMainTab("moodunud")} className={segmentButtonClass(mainTab === "moodunud")}>
        {et.tabs.moodunud}
      </button>
    </div>
  );

  const searchEl = (
    <div className={isDesktop ? "relative w-44" : "relative flex-1"}>
      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder={et.searchPlaceholder}
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        className="pl-9 h-9"
      />
    </div>
  );

  const chipsEl = (
    <div
      className={isDesktop
        ? "flex-1 min-w-0 flex gap-1.5 overflow-x-auto [scrollbar-width:none]"
        : "flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-4 px-4"}
    >
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => setChip(c.key)}
          className={cn(CHIP_BASE, chip === c.key ? CHIP_ACTIVE : CHIP_INACTIVE)}
        >
          {c.dotClass && <span className={cn("h-2 w-2 rounded-full", c.dotClass)} aria-hidden="true" />}
          {c.label}
        </button>
      ))}
    </div>
  );

  const header = isDesktop ? (
    <div className="border-b border-border bg-card">
      <div className={isWide ? "mx-auto max-w-[1320px] px-12 py-3" : "mx-auto max-w-[1180px] px-5 py-3"}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            {titleEl}
            {segmentEl}
          </div>
          {chipsEl}
          <div className="flex items-center gap-3 shrink-0">
            {searchEl}
            {addButtonEl}
            {refreshEl}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="px-4 py-3 border-b border-border bg-card space-y-3">
      <div className="flex items-center justify-between gap-2">
        {titleEl}
        <div className="flex items-center gap-2">
          {addButtonEl}
          {refreshEl}
        </div>
      </div>
      {segmentEl}
      <div className="flex">{searchEl}</div>
      {chipsEl}
    </div>
  );

  const renderRow = (event: EventItem) => (
    <EventRow
      key={event.id}
      event={event}
      isNext={event.id === nextEventId}
      isPast={isPastTab}
      canManage={canManage}
      onEdit={() => openEdit(event.id)}
      onDelete={() => void onDelete(event.id)}
      onPress={() => setOpenedDetails(event)}
    />
  );

  const phoneListEl = groups.map((group) => (
    <Fragment key={group.key}>
      <div className="sticky top-0 z-10 bg-muted px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {group.label}
      </div>
      <div className="divide-y divide-border">{group.events.map(renderRow)}</div>
    </Fragment>
  ));

  const desktopListEl = (
    <div className="mx-auto max-w-[680px] px-5 pb-6">
      {groups.map((group) => {
        const featured = group.events.find((ev) => ev.id === nextEventId) ?? null;
        const rest = featured ? group.events.filter((ev) => ev.id !== featured.id) : group.events;
        return (
          <section key={group.key}>
            <div className="flex items-center justify-between px-1 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{group.label}</span>
              <span>{et.monthCount(group.events.length)}</span>
            </div>
            {featured && (
              <EventFeaturedCard
                event={featured}
                canManage={canManage}
                onEdit={() => openEdit(featured.id)}
                onDelete={() => void onDelete(featured.id)}
                onPress={() => setOpenedDetails(featured)}
              />
            )}
            <div className="divide-y divide-border">{rest.map(renderRow)}</div>
          </section>
        );
      })}
    </div>
  );

  const featuredEvent = !isPastTab && nextEventId
    ? groups.flatMap((g) => g.events).find((ev) => ev.id === nextEventId) ?? null
    : null;
  const wideGroups = groups
    .map((g) => ({
      ...g,
      events: featuredEvent ? g.events.filter((ev) => ev.id !== featuredEvent.id) : g.events,
    }))
    .filter((g) => g.events.length > 0);

  const wideListEl = (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-7 px-12 py-7">
      {featuredEvent && (
        <EventFeaturedWide
          event={featuredEvent}
          canManage={canManage}
          onEdit={() => openEdit(featuredEvent.id)}
          onDelete={() => void onDelete(featuredEvent.id)}
          onPress={() => setOpenedDetails(featuredEvent)}
        />
      )}
      {wideGroups.map((group) => (
        <section key={group.key}>
          <div className="flex items-center justify-between px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{group.label}</span>
            <span>{et.monthCount(group.events.length)}</span>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-border bg-card">
            {group.events.map((event) => (
              <EventRowWide
                key={event.id}
                event={event}
                isNext={false}
                isPast={isPastTab}
                canManage={canManage}
                onEdit={() => openEdit(event.id)}
                onDelete={() => void onDelete(event.id)}
                onPress={() => setOpenedDetails(event)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {header}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{et.loadingEvents}</div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {isPastTab ? et.emptyPast : et.emptyUpcoming}
          </p>
        ) : isWide ? (
          wideListEl
        ) : isDesktop ? (
          desktopListEl
        ) : (
          <div className="pb-6">{phoneListEl}</div>
        )}
      </div>

      <EventLinkSheet
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editingRow}
        onSaved={() => {
          void loadEvents();
        }}
      />

      {import.meta.env.DEV && (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          {canManage ? et.adminModeOn : et.adminModeOff}
        </p>
      )}
    </div>
  );
}
