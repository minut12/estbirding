import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { et } from "@/localization/et";
import { type EventItem } from "@/data/events";
import { EventsMapMapLibre } from "@/components/events/EventsMapMapLibre";
import { EventCard } from "@/components/events/EventCard";
import {
  archiveManualEvent,
  deleteManualEvent,
  listPublicEventsManual,
  type ManualEventRow,
  unarchiveManualEvent,
} from "@/features/events/eventsService";
import { useAuth } from "@/features/auth/AuthContext";
import { EventEditDialog } from "@/features/events/EventEditDialog";
import EventDetailsScreen from "./EventDetailsScreen";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MainTab = "tulevased" | "moodunud" | "muud";
type CategoryFilter = "koik" | "active" | "archived";

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
    isArchived: row.status === "archived",
  };
}

function toErrorMessage(err: unknown): string {
  const e = err as any;
  return String(e?.message ?? String(err));
}

export default function EventsScreen() {
  const [mainTab, setMainTab] = useState<MainTab>("tulevased");
  const [statusFilter, setStatusFilter] = useState<CategoryFilter>("active");
  const [searchValue, setSearchValue] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [openedDetails, setOpenedDetails] = useState<EventItem | null>(null);
  const [rows, setRows] = useState<ManualEventRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ManualEventRow | null>(null);

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

      const statusMatch =
        statusFilter === "koik"
          ? true
          : statusFilter === "active"
            ? !event.isArchived
            : Boolean(event.isArchived);

      const searchMatch = searchTerm
        ? event.title.toLowerCase().includes(searchTerm) ||
          event.locationName.toLowerCase().includes(searchTerm)
        : true;

      return tabMatch && statusMatch && searchMatch;
    });
  }, [events, mainTab, searchValue, statusFilter, todayStart]);

  const mapEvents = useMemo(
    () =>
      filteredEvents.filter(
        (event) =>
          Number.isFinite(event.lat) &&
          Number.isFinite(event.lng) &&
          Math.abs(event.lat) <= 90 &&
          Math.abs(event.lng) <= 180,
      ),
    [filteredEvents],
  );

  useEffect(() => {
    if (filteredEvents.length === 0) {
      setHighlightedEventId(null);
      return;
    }
    if (!highlightedEventId || !filteredEvents.some((event) => event.id === highlightedEventId)) {
      setHighlightedEventId(filteredEvents[0].id);
    }
  }, [filteredEvents, highlightedEventId]);

  const highlightedEvent = useMemo(
    () => filteredEvents.find((event) => event.id === highlightedEventId) ?? null,
    [filteredEvents, highlightedEventId]
  );

  const selectEvent = (eventId: string) => {
    setHighlightedEventId(eventId);
    cardRefs.current[eventId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

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

  const onArchiveToggle = async (eventId: string) => {
    const row = rows.find((r) => r.id === eventId);
    if (!row) return;
    try {
      if (row.status === "archived") await unarchiveManualEvent(eventId);
      else await archiveManualEvent(eventId);
      await loadEvents();
      toast.success(row.status === "archived" ? "Üritus taastatud" : "Üritus arhiveeritud");
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
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

        <div className="flex gap-2">
          {(
            [
              ["koik", "Kõik"],
              ["active", "Aktiivsed"],
              ["archived", "Arhiveeritud"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                statusFilter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-white text-muted-foreground"
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

      {mapEvents.length > 0 && (
        <div className="px-4 pb-3">
          <EventsMapMapLibre
            points={mapEvents.map((event) => ({ id: event.id, lat: event.lat, lon: event.lng, title: event.title }))}
            selectedId={highlightedEventId || undefined}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-t-[28px] bg-white px-4 pt-4 shadow-[0_-8px_24px_rgba(38,64,52,0.08)]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Laen üritusi...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/45" />
            <p className="text-sm text-muted-foreground">Üritusi ei leitud. Proovi värskendada.</p>
            <button onClick={handleRefresh} className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground">
              Värskenda
            </button>
          </div>
        ) : (
          <div className="h-full space-y-3 overflow-y-auto pb-6">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                selected={event.id === highlightedEvent?.id}
                canManage={canManage}
                onEdit={() => openEdit(event.id)}
                onArchiveToggle={() => onArchiveToggle(event.id)}
                onDelete={() => onDelete(event.id)}
                onPress={() => {
                  selectEvent(event.id);
                  setOpenedDetails(event);
                }}
                cardRef={(node) => {
                  cardRefs.current[event.id] = node;
                }}
              />
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
