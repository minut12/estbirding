import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { et } from "@/localization/et";
import { sampleEvents, type EventItem } from "@/data/events";
import { EventMapPreview } from "@/components/events/EventMapPreview";
import { EventCard } from "@/components/events/EventCard";
import { listPublishedEvents, type EventRow } from "@/features/events/eventsService";
import EventDetailsScreen from "./EventDetailsScreen";

type MainTab = "tulevased" | "moodunud" | "muud";
type CategoryFilter = "koik" | "EstBirding" | "Muud";

const mapRowToEventItem = (row: EventRow): EventItem => ({
  id: row.id,
  title: row.title,
  startAt: row.start_at,
  locationName: row.location_name ?? "Asukoht täpsustamisel",
  lat: row.lat ?? 58.7,
  lng: row.lng ?? 25.0,
  category: row.category,
  imageUrl:
    row.image_url ||
    "https://images.unsplash.com/photo-1448375240586-882707db888b?w=360&h=280&fit=crop",
  description: row.description ?? undefined,
});

export default function EventsScreen() {
  const [mainTab, setMainTab] = useState<MainTab>("tulevased");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("koik");
  const [searchValue, setSearchValue] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [openedDetails, setOpenedDetails] = useState<EventItem | null>(null);
  const [events, setEvents] = useState<EventItem[]>(sampleEvents);

  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const todayStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listPublishedEvents();
      setEvents(rows.map(mapRowToEventItem));
    } catch (error) {
      console.warn("[EventsScreen] Failed to load Supabase events, falling back to seed data.", error);
      setEvents(sampleEvents);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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

      const categoryMatch = categoryFilter === "koik" ? true : event.category === categoryFilter;
      const searchMatch = searchTerm
        ? event.title.toLowerCase().includes(searchTerm) ||
          event.locationName.toLowerCase().includes(searchTerm)
        : true;

      return tabMatch && categoryMatch && searchMatch;
    });
  }, [categoryFilter, events, mainTab, searchValue, todayStart]);

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

  const cycleEvent = (direction: "prev" | "next") => {
    if (filteredEvents.length === 0 || !highlightedEventId) return;
    const currentIndex = filteredEvents.findIndex((event) => event.id === highlightedEventId);
    const nextIndex =
      direction === "next"
        ? (currentIndex + 1) % filteredEvents.length
        : (currentIndex - 1 + filteredEvents.length) % filteredEvents.length;
    selectEvent(filteredEvents[nextIndex].id);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadEvents(), new Promise((resolve) => setTimeout(resolve, 600))]);
    setIsRefreshing(false);
  };

  if (openedDetails) {
    return <EventDetailsScreen event={openedDetails} onBack={() => setOpenedDetails(null)} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F3F5F4]">
      <div className="space-y-3 px-4 pb-4 pt-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{et.eventsTitle}</h1>
          <button
            onClick={handleRefresh}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-white/80 text-foreground"
            aria-label={et.refresh}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing ? "animate-spin" : "")} />
          </button>
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
              ["koik", et.chips.koik],
              ["EstBirding", et.chips.estbirding],
              ["Muud", et.chips.muud],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                categoryFilter === key
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

      <div className="px-4 pb-3">
        <EventMapPreview
          events={filteredEvents}
          highlightedEventId={highlightedEventId}
          onSelectEvent={selectEvent}
          onPrev={() => cycleEvent("prev")}
          onNext={() => cycleEvent("next")}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-t-[28px] bg-white px-4 pt-4 shadow-[0_-8px_24px_rgba(38,64,52,0.08)]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Laen üritusi...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/45" />
            <p className="text-sm text-muted-foreground">{et.emptyByTab[mainTab]}</p>
          </div>
        ) : (
          <div className="h-full space-y-3 overflow-y-auto pb-6">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                selected={event.id === highlightedEvent?.id}
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
    </div>
  );
}
