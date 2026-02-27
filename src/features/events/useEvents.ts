import { useCallback, useEffect, useMemo, useState } from "react";
import { loadEventSources } from "@/config/eventSources";
import { fetchEventsBySources, type EventRow, type EventSourceFetchResult } from "./eventsService";

export type UseEventsState = {
  events: EventRow[];
  loading: boolean;
  refreshing: boolean;
  lastUpdated: Date | null;
  errorMessage: string | null;
  emptyMessage: string | null;
  sourceResults: EventSourceFetchResult[];
  refresh: () => Promise<void>;
};

export function useEvents(): UseEventsState {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceResults, setSourceResults] = useState<EventSourceFetchResult[]>([]);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setErrorMessage(null);
    try {
      const sources = loadEventSources();
      const { events: merged, results } = await fetchEventsBySources(sources);
      setEvents(merged);
      setSourceResults(results);
      setLastUpdated(new Date());

      if (results.length > 0 && results.every((entry) => !entry.ok)) {
        setErrorMessage("Ürituste laadimine ebaõnnestus");
      }
    } catch (error: any) {
      setEvents([]);
      setSourceResults([]);
      setErrorMessage(error?.message || "Ürituste laadimine ebaõnnestus");
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "refresh") setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const emptyMessage = useMemo(() => {
    if (loading || errorMessage) return null;
    if (events.length > 0) return null;
    return "Üritusi ei leitud. Proovi värskendada.";
  }, [errorMessage, events.length, loading]);

  return {
    events,
    loading,
    refreshing,
    lastUpdated,
    errorMessage,
    emptyMessage,
    sourceResults,
    refresh: () => load("refresh"),
  };
}
