import { getSupabaseClient, getSupabaseInitError } from "@/config/supabaseClient";
import { getFunctionsBaseUrl, getSupabaseAnonKey, getSupabaseUrl, validateSupabaseConfig } from "@/config/supabaseConfig";
import { getEventsAdminKey } from "./adminKey";

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

const EVENT_COLUMNS =
  "id,title,description,start_at,end_at,location_name,lat,lng,category,organizer_name,url,image_url,is_published,is_archived,created_by,created_at,updated_at";

export async function listPublishedEvents(): Promise<EventRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(getSupabaseInitError() || "Supabase not configured");
  const { data, error } = await (supabase as any)
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("is_published", true)
    .eq("is_archived", false)
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EventRow[];
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
    throw new Error(`Fetch error to ${fnUrl}: ${String(err)}`);
  }

  const bodyText = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = { raw: bodyText };
  }

  if (!res.ok) {
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
