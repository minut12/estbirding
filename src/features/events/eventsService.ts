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

export async function listPublishedEvents(): Promise<EventRow[]> {
  const { data, error } = await (supabase as any)
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("is_published", true)
    .or("is_archived.is.null,is_archived.eq.false")
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

type AdminActionResponse<T> = {
  data?: T;
  error?: string;
  ok?: boolean;
  raw?: string;
};

function getAdminKeyOrThrow(): string {
  const adminKey = getEventsAdminKey();
  if (!adminKey) {
    throw new Error("events_admin_key puudub. Lisa see Seaded -> Arendaja alt.");
  }
  return adminKey;
}

function getFnUrl(): string {
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("VITE_SUPABASE_URL puudub.");
  }
  return `${baseUrl}/functions/v1/events-admin`;
}

async function callAdminFn<T>(action: string, payload: unknown, adminKey: string): Promise<AdminActionResponse<T>> {
  const fnUrl = getFnUrl();
  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify({ action, payload }),
  });

  const text = await res.text();
  let json: AdminActionResponse<T>;
  try {
    json = JSON.parse(text) as AdminActionResponse<T>;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}: ${text}`);
  }

  return json;
}

async function invokeAdminAction<T>(action: string, payload?: unknown): Promise<T> {
  const adminKey = getAdminKeyOrThrow();
  const parsed = await callAdminFn<T>(action, payload, adminKey);
  if (parsed.error) throw new Error(parsed.error);
  if (parsed.data === undefined) {
    throw new Error("Tühi vastus events-admin funktsioonilt");
  }
  return parsed.data;
}

export async function adminListEvents(): Promise<EventRow[]> {
  return invokeAdminAction<EventRow[]>("list", {});
}

export async function adminCreateEvent(payload: EventPayload): Promise<EventRow> {
  return invokeAdminAction<EventRow>("create", payload);
}

export async function adminUpdateEvent(id: string, patch: Partial<EventPayload>): Promise<EventRow> {
  return invokeAdminAction<EventRow>("update", { id, patch });
}

export async function adminDeleteEvent(id: string): Promise<void> {
  const adminKey = getAdminKeyOrThrow();
  const parsed = await callAdminFn<{ ok: boolean }>("delete", { id }, adminKey);
  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.ok) throw new Error("Kustutamine ebaõnnestus");
}

export async function adminPublishEvent(id: string, is_published: boolean): Promise<EventRow> {
  return invokeAdminAction<EventRow>("publish", { id, is_published });
}

export async function adminArchiveEvent(id: string, is_archived: boolean): Promise<EventRow> {
  return invokeAdminAction<EventRow>("archive", { id, is_archived });
}
