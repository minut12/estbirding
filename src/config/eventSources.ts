export type EventSourceKind = "scrape" | "manual";

export interface EventSourceConfig {
  id: string;
  name: string;
  kind: EventSourceKind;
  url: string;
  enabled: boolean;
}

export const EVENT_SOURCES_KEY = "estbirding.eventSources.v1";

export const DEFAULT_EVENT_SOURCES: EventSourceConfig[] = [
  {
    id: "estbirding",
    name: "EstBirding",
    kind: "scrape",
    url: "https://www.estbirding.ee/uritused",
    enabled: true,
  },
  {
    id: "other",
    name: "Muud",
    kind: "manual",
    url: "",
    enabled: true,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeEntry(raw: unknown): EventSourceConfig | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const name = String(raw.name ?? id).trim();
  const kind = raw.kind === "manual" ? "manual" : "scrape";
  const url = String(raw.url ?? "").trim();
  const enabled = raw.enabled !== false;
  return { id, name, kind, url, enabled };
}

function mergeByDefaultId(stored: EventSourceConfig[]): EventSourceConfig[] {
  return DEFAULT_EVENT_SOURCES.map((source) => {
    const override = stored.find((entry) => entry.id === source.id);
    return override ? { ...source, ...override, id: source.id } : source;
  });
}

export function loadEventSources(): EventSourceConfig[] {
  if (typeof window === "undefined") return [...DEFAULT_EVENT_SOURCES];
  try {
    const raw = window.localStorage.getItem(EVENT_SOURCES_KEY);
    if (!raw) return [...DEFAULT_EVENT_SOURCES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_EVENT_SOURCES];
    const normalized = parsed.map(normalizeEntry).filter(Boolean) as EventSourceConfig[];
    return mergeByDefaultId(normalized);
  } catch {
    return [...DEFAULT_EVENT_SOURCES];
  }
}

export function saveEventSources(list: EventSourceConfig[]): EventSourceConfig[] {
  const merged = mergeByDefaultId(list);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(EVENT_SOURCES_KEY, JSON.stringify(merged));
  }
  return merged;
}

export function resetEventSourcesToDefaults(): EventSourceConfig[] {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(EVENT_SOURCES_KEY);
  }
  return [...DEFAULT_EVENT_SOURCES];
}
