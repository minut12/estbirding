import { supabase } from "@/config/supabaseClient";

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
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventPayload = Partial<Omit<EventRow, "id" | "created_at" | "updated_at">> & {
  title: string;
  start_at: string;
};

const EVENT_COLUMNS =
  "id,title,description,start_at,end_at,location_name,lat,lng,category,organizer_name,url,image_url,is_published,created_by,created_at,updated_at";

export async function listPublishedEvents(): Promise<EventRow[]> {
  const { data, error } = await (supabase as any)
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("is_published", true)
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

export async function listAllEventsAdmin(): Promise<EventRow[]> {
  const { data, error } = await (supabase as any)
    .from("events")
    .select(EVENT_COLUMNS)
    .order("start_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

export async function createEvent(payload: EventPayload): Promise<EventRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await (supabase as any)
    .from("events")
    .insert({ ...payload, created_by: user?.id ?? null })
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as EventRow;
}

export async function updateEvent(id: string, patch: Partial<EventPayload>): Promise<EventRow> {
  const { data, error } = await (supabase as any)
    .from("events")
    .update(patch)
    .eq("id", id)
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as EventRow;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await (supabase as any).from("events").delete().eq("id", id);
  if (error) throw error;
}

export async function setPublished(id: string, flag: boolean): Promise<EventRow> {
  return updateEvent(id, { is_published: flag });
}
