import { getFunctionsBaseUrl, getSupabaseAnonKey, getSupabaseUrl, supabaseFetch, validateSupabaseConfig } from "@/config/supabaseConfig";
import { getEventsAdminKey } from "./adminKey";
import { type EventSourceConfig, loadEventSources } from "@/config/eventSources";

export type EventCategory = "EstBirding" | "Muud";

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  category: EventCategory;
  organizer_name: string | null;
  url: string | null;
  image_url: string | null;
  is_published: boolean;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventPayload = Partial<Omit<EventRow, "id" | "created_at" | "updated_at">> & {
  title: string;
  start_at: string;
};

export type EventSourceFetchResult = {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  status?: number;
  message: string;
  events: EventRow[];
  error?: string;
};

function normalizeCategory(raw: unknown): EventCategory {
  const value = String(raw ?? "").toLowerCase();
  return value === "estbirding" ? "EstBirding" : "Muud";
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function mapAnyToEventRow(raw: any): EventRow {
  const startAt = String(raw?.start_at ?? "");
  return {
    id: String(raw?.id ?? raw?.guid ?? `${raw?.source_slug ?? "events"}:${startAt}:${raw?.title ?? ""}`),
    title: String(raw?.title ?? "Nimetu üritus"),
    description: raw?.description == null ? null : String(raw.description),
    start_at: startAt,
    end_at: raw?.end_at == null ? null : String(raw.end_at),
    location_name: raw?.location_name == null ? null : String(raw.location_name),
    lat: toNumberOrNull(raw?.lat ?? raw?.location_lat),
    lng: toNumberOrNull(raw?.lng ?? raw?.location_lon),
    category: normalizeCategory(raw?.category ?? raw?.source_slug),
    organizer_name: raw?.organizer_name == null ? null : String(raw.organizer_name),
    url: raw?.url == null ? null : String(raw.url),
    image_url: raw?.image_url == null ? null : String(raw.image_url),
    is_published: typeof raw?.is_published === "boolean" ? raw.is_published : true,
    is_archived: typeof raw?.is_archived === "boolean" ? raw.is_archived : Boolean(raw?.is_cancelled),
    created_by: raw?.created_by == null ? null : String(raw.created_by),
    created_at: String(raw?.created_at ?? new Date().toISOString()),
    updated_at: String(raw?.updated_at ?? raw?.created_at ?? new Date().toISOString()),
  };
}

function getSourceFilterQuery(sourceId: string): string {
  if (sourceId === "estbirding") return "source_slug=eq.estbirding";
  return "source_slug=neq.estbirding";
}

function sortEventsAsc(list: EventRow[]): EventRow[] {
  return [...list].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}

function dedupeEvents(list: EventRow[]): EventRow[] {
  const seen = new Set<string>();
  const out: EventRow[] = [];
  for (const item of list) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export async function fetchEventsForSource(source: EventSourceConfig): Promise<EventSourceFetchResult> {
  const validation = validateSupabaseConfig();
  if (!validation.ok || !validation.url) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      ok: false,
      message: "Supabase seadistus puudub või on vigane.",
      events: [],
      error: validation.error || "Supabase not configured",
    };
  }

  const endpoint = `${validation.url.replace(/\/+$/, "")}/rest/v1/events?select=*&order=start_at.asc&${getSourceFilterQuery(source.id)}`;
  try {
    const response = await supabaseFetch(endpoint, { method: "GET" });
    const text = await response.text();
    const json = text ? JSON.parse(text) : [];
    if (!response.ok) {
      return {
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        status: response.status,
        message: `HTTP ${response.status}`,
        events: [],
        error: typeof json?.message === "string" ? json.message : text || "Unknown error",
      };
    }
    const mapped = Array.isArray(json) ? json.map(mapAnyToEventRow).filter((row) => !row.is_archived) : [];
    return {
      sourceId: source.id,
      sourceName: source.name,
      ok: true,
      status: response.status,
      message: `HTTP ${response.status}, ${mapped.length} kirjet`,
      events: sortEventsAsc(mapped),
    };
  } catch (error: any) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      ok: false,
      message: "Päring ebaõnnestus",
      events: [],
      error: error?.message || String(error),
    };
  }
}

export async function fetchEventsBySources(
  sources: EventSourceConfig[]
): Promise<{ events: EventRow[]; results: EventSourceFetchResult[] }> {
  const enabled = sources.filter((source) => source.enabled);
  if (enabled.length === 0) return { events: [], results: [] };

  const settled = await Promise.allSettled(enabled.map((source) => fetchEventsForSource(source)));
  const results: EventSourceFetchResult[] = settled.map((entry, index) => {
    if (entry.status === "fulfilled") return entry.value;
    const source = enabled[index];
    return {
      sourceId: source.id,
      sourceName: source.name,
      ok: false,
      message: "Päring ebaõnnestus",
      events: [],
      error: entry.reason?.message || String(entry.reason),
    };
  });

  const merged = dedupeEvents(results.flatMap((entry) => entry.events));
  return { events: sortEventsAsc(merged), results };
}

export async function listPublishedEvents(): Promise<EventRow[]> {
  const { events } = await fetchEventsBySources(loadEventSources());
  return events;
}

export async function listAllEventsAdmin(): Promise<EventRow[]> {
  return adminListEvents();
}

export async function createEvent(payload: EventPayload): Promise<EventRow> {
  return adminCreateEvent(payload);
}

export async function updateEvent(id: string, patch: Partial<EventPayload>): Promise<EventRow> {
  return adminUpdateEvent(id, patch);
}

export async function deleteEvent(id: string): Promise<void> {
  await adminDeleteEvent(id);
}

export async function setPublished(id: string, flag: boolean): Promise<EventRow> {
  return adminPublishEvent(id, flag);
}

function requireAdminKey(): string {
  const key = getEventsAdminKey();
  if (!key || !key.trim()) {
    throw new Error("events_admin_key puudub. Lisa see Seaded ? Arendaja alt.");
  }
  return key.trim();
}

export async function preflightSupabaseRestHealth(): Promise<{
  ok: boolean;
  message: string;
  url: string;
  status?: number;
}> {
  const validation = validateSupabaseConfig();
  const resolvedUrl = validation.url || getSupabaseUrl() || "(empty)";
  if (!validation.ok) {
    throw new Error(`${validation.error} Resolved Supabase URL: ${resolvedUrl}`);
  }
  const anonKey = getSupabaseAnonKey();
  if (!anonKey || anonKey.length < 20) {
    throw new Error(`VITE_SUPABASE_ANON_KEY puudu/vigane. Resolved Supabase URL: ${resolvedUrl}`);
  }
  const healthUrl = `${resolvedUrl.replace(/\/+$/, "")}/auth/v1/health`;
  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
    });
    if (res.ok || res.status === 401 || res.status === 404) {
      return { ok: true, message: `Supabase reachable (HTTP ${res.status})`, url: healthUrl, status: res.status };
    }
    return { ok: true, message: `Supabase reachable (HTTP ${res.status})`, url: healthUrl, status: res.status };
  } catch (err) {
    throw new Error(
      `Supabase URL unreachable (DNS/Network). Check Project URL or override in Settings. URL: ${resolvedUrl}. Error: ${String(err)}`
    );
  }
}

async function callAdminFn(action: string, payload: unknown, adminKey: string): Promise<any> {
  const validation = validateSupabaseConfig();
  const resolvedUrl = validation.url || getSupabaseUrl() || "(empty)";
  if (!validation.ok) {
    throw new Error(`${validation.error} Resolved Supabase URL: ${resolvedUrl}`);
  }

  const anonKey = getSupabaseAnonKey();
  const fnUrl = `${getFunctionsBaseUrl()}/events-ingest`;
  if (!anonKey || anonKey.length < 20) {
    throw new Error(`VITE_SUPABASE_ANON_KEY puudu/vigane. Resolved Supabase URL: ${resolvedUrl}`);
  }
  if (!adminKey) {
    throw new Error("events_admin_key puudub");
  }
  await preflightSupabaseRestHealth();

  let res: Response;
  try {
    res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-key": adminKey,
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ action, payload }),
    });
  } catch (err) {
    throw new Error(`Network error to ${fnUrl}: ${String(err)}. Likely wrong Supabase URL (DNS NXDOMAIN) or offline.`);
  }

  const bodyText = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = { raw: bodyText };
  }

  if (!res.ok) {
    if (res.status === 404 || res.status === 405) {
      throw new Error("Edge Function events-ingest not deployed. Deploy it in Supabase -> Edge Functions.");
    }
    throw new Error(`HTTP ${res.status}: ${bodyText}`);
  }

  return json?.data ?? json;
}

export async function adminListEvents(): Promise<EventRow[]> {
  const key = requireAdminKey();
  return callAdminFn("admin_list", {}, key);
}

export async function adminTestConnection(): Promise<unknown> {
  const key = requireAdminKey();
  return callAdminFn("admin_list", {}, key);
}

export async function adminCreateEvent(payload: EventPayload): Promise<EventRow> {
  const key = requireAdminKey();
  return callAdminFn("admin_create", payload, key);
}

export async function adminUpdateEvent(id: string, patch: Partial<EventPayload>): Promise<EventRow> {
  const key = requireAdminKey();
  return callAdminFn("admin_update", { id, patch }, key);
}

export async function adminDeleteEvent(id: string): Promise<void> {
  const key = requireAdminKey();
  await callAdminFn("admin_delete", { id }, key);
}

export async function adminPublishEvent(id: string, is_published: boolean): Promise<EventRow> {
  const key = requireAdminKey();
  return callAdminFn("admin_publish", { id, is_published }, key);
}

export async function adminArchiveEvent(id: string, is_archived: boolean): Promise<EventRow> {
  const key = requireAdminKey();
  return callAdminFn("admin_archive", { id, is_archived }, key);
}
