import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { et } from "@/localization/et";
import { type EventItem } from "@/data/events";
import { EventsMapMapLibre } from "@/components/events/EventsMapMapLibre";
import { EventCard } from "@/components/events/EventCard";
import {
  deleteManualEvent,
  listPublicEventsManual,
  type ManualEventRow,
} from "@/features/events/eventsService";
import { useAuth } from "@/features/auth/AuthContext";
import { EventEditDialog } from "@/features/events/EventEditDialog";
import EventDetailsScreen from "./EventDetailsScreen";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MainTab = "tulevased" | "moodunud" | "muud";

type MonthGroup = {
  key: string;
  label: string;
  events: EventItem[];
};

const ESTONIAN_MONTHS = [
  "jaanuar", "veebruar", "märts", "aprill", "mai", "juuni",
  "juuli", "august", "september", "oktoober", "november", "detsember",
];

function groupByMonth(events: EventItem[], reverseChronological: boolean): MonthGroup[] {
  const buckets = new Map<string, EventItem[]>();
  for (const ev of events) {
    const d = new Date(ev.startAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(ev);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const da = new Date(a.startAt).getTime();
      const db = new Date(b.startAt).getTime();
      return reverseChronological ? db - da : da - db;
    });
  }
  return Array.from(buckets.entries())
    .map(([key, evs]) => {
      const [yStr, mStr] = key.split("-");
      const monthIdx = Number(mStr) - 1;
      const monthName = ESTONIAN_MONTHS[monthIdx] ?? mStr;
      const label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${yStr}`;
      return { key, label, events: evs };
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
    locationName: row.location_name || "Asukoht täpsustamisel",
    lat: safeLat,
    lng: safeLon,
    category: row.type === "muud" ? "Muud" : "EstBirding",
    imageUrl: validImage
      ? imageCandidate
      : "https://images.unsplash.com/photo-1448375240586-882707db888b?w=360&h=280&fit=crop",
    description: row.description || undefined,
    url: row.url || undefined,
    isPublished: row.status === "active",
  };
}

function toErrorMessage(err: unknown): string {
  const e = err as any;
  return String(e?.message ?? String(err));
}

export default function EventsScreen() {
  const [mainTab, setMainTab] = useState<MainTab>("tulevased");
  const [searchValue, setSearchValue] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [openedDetails, setOpenedDetails] = useState<EventItem | null>(null);
  const [rows, setRows] = useState<ManualEventRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ManualEventRow | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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

  const events = useMemo(() => rows.map(toEventItem), [rows]);

  const filteredEvents = useMemo(() => {
    const searchTerm = searchValue.trim().toLowerCase();
    return events.filter((event) => {
      const eventDate = new Date(event.startAt);
      const tabMatch =
        mainTab === "tulevased"
          ? eventDate >= todayStart
          : mainTab === "moodunud"
            ? eventDate < todayStart
            : event.category === "Muud";

      const searchMatch = searchTerm
        ? event.title.toLowerCase().includes(searchTerm) ||
          event.locationName.toLowerCase().includes(searchTerm)
        : true;

      return tabMatch && searchMatch;
    });
  }, [events, mainTab, searchValue, todayStart]);

  const reverse = mainTab === "moodunud";
  const groups = useMemo(() => groupByMonth(filteredEvents, reverse), [filteredEvents, reverse]);

  const mapPoints = useMemo(
    () =>
      filteredEvents
        .filter(
          (event) =>
            Number.isFinite(event.lat) &&
            Number.isFinite(event.lng) &&
            Math.abs(event.lat) <= 90 &&
            Math.abs(event.lng) <= 180,
        )
        .map((event) => ({ id: event.id, lat: event.lat, lon: event.lng, title: event.title })),
    [filteredEvents],
  );

  useEffect(() => {
    if (filteredEvents.length === 0) {
      setHighlightedEventId(null);
    }
  }, [filteredEvents]);

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
    if (!window.confirm("Kustutan ürituse?")) return;
    try {
      await deleteManualEvent(eventId);
      await loadEvents();
      toast.success("Üritus kustutatud");
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  if (openedDetails) {
    return <EventDetailsScreen event={openedDetails} onBack={() => setOpenedDetails(null)} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F3F5F4]">
      <div className="space-y-3 px-4 pb-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{et.eventsTitle}</h1>
          <div className="flex items-center gap-2">
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                Lisa üritus
              </Button>
            )}
            <button
              onClick={handleRefresh}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-white/80 text-foreground"
              aria-label={et.refresh}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing ? "animate-spin" : "")} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 rounded-2xl bg-[#E7ECE9] p-1">
          {(
            [
              ["tulevased", et.tabs.tulevased],
              ["moodunud", et.tabs.moodunud],
              ["muud", et.tabs.muud],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMainTab(key)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                mainTab === key ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={et.searchPlaceholder}
            className="h-11 w-full rounded-xl border border-border/80 bg-white pl-9 pr-3 text-sm outline-none ring-0 placeholder:text-muted-foreground/80 focus:border-primary/45"
          />
        </div>
      </div>

      <div className="px-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {mapPoints.length === 0
              ? "Asukohaga üritusi pole"
              : `${mapPoints.length} üritust kaardil`}
          </span>
          {mapPoints.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMapOpen((v) => !v)}
              className="h-7 px-2 text-xs"
            >
              {mapOpen ? "Sulge kaart" : "Ava kaart"}
            </Button>
          )}
        </div>

        {mapOpen && mapPoints.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-lg border border-border">
            <EventsMapMapLibre
              points={mapPoints}
              selectedId={highlightedEventId || undefined}
              onMarkerClick={(id) => {
                setHighlightedEventId(id);
                const node = cardRefs.current[id];
                if (node) {
                  node.scrollIntoView({ behavior: "smooth", block: "center" });
                }
                window.setTimeout(() => {
                  setHighlightedEventId((current) => (current === id ? null : current));
                }, 2500);
              }}
            />
          </div>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto bg-white">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Laen üritusi...</div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Ühtegi üritust ei leitud.
          </p>
        ) : (
          <div className="pb-6">
            {groups.map((group) => (
              <section key={group.key}>
                <header className="bg-muted/50 px-4 py-2">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h2>
                </header>
                <div>
                  {group.events.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      variant="compact"
                      selected={event.id === highlightedEventId}
                      canManage={canManage}
                      onEdit={() => openEdit(event.id)}
                      onDelete={() => onDelete(event.id)}
                      onPress={() => setOpenedDetails(event)}
                      cardRef={(node) => {
                        cardRefs.current[event.id] = node;
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <EventEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editingRow}
        onSaved={() => {
          void loadEvents();
        }}
      />

      {import.meta.env.DEV && (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Admin režiim: {canManage ? "sees" : "väljas (admin rolli vaja)"}
        </p>
      )}
    </div>
  );
}
