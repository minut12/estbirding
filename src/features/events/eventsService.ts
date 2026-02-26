import { supabase } from "@/config/supabaseClient";
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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function listPublishedEvents(): Promise<EventRow[]> {
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
    throw new Error("events_admin_key puudub. Lisa see Seaded → Arendaja alt.");
  }
  return key.trim();
}

async function callAdminFn(action: string, payload: unknown, adminKey: string): Promise<any> {
  const normalizedSupabaseUrl = (supabaseUrl || "").replace(/\/+$/, "");
  const fnUrl = `${normalizedSupabaseUrl}/functions/v1/events-admin`;

  if (!supabaseUrl || !String(supabaseUrl).startsWith("http")) {
    throw new Error(`VITE_SUPABASE_URL puudu/vigane: ${String(supabaseUrl)}`);
  }
  if (!anonKey || anonKey.length < 20) {
    throw new Error("VITE_SUPABASE_ANON_KEY puudu/vigane");
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
    throw new Error(`HTTP ${res.status} from ${fnUrl}: ${bodyText}`);
  }

  return json?.data ?? json;
}

export async function adminListEvents(): Promise<EventRow[]> {
  const key = requireAdminKey();
  return callAdminFn("list", {}, key);
}

export async function adminTestConnection(): Promise<unknown> {
  const key = requireAdminKey();
  return callAdminFn("list", {}, key);
}

export async function adminCreateEvent(payload: EventPayload): Promise<EventRow> {
  const key = requireAdminKey();
  return callAdminFn("create", payload, key);
}

export async function adminUpdateEvent(id: string, patch: Partial<EventPayload>): Promise<EventRow> {
  const key = requireAdminKey();
  return callAdminFn("update", { id, patch }, key);
}

export async function adminDeleteEvent(id: string): Promise<void> {
  const key = requireAdminKey();
  await callAdminFn("delete", { id }, key);
}

export async function adminPublishEvent(id: string, is_published: boolean): Promise<EventRow> {
  const key = requireAdminKey();
  return callAdminFn("publish", { id, is_published }, key);
}

export async function adminArchiveEvent(id: string, is_archived: boolean): Promise<EventRow> {
  const key = requireAdminKey();
  return callAdminFn("archive", { id, is_archived }, key);
}
