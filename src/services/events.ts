import { supabase } from "@/lib/supabase";
import type { EventInsert, EventRow, EventUpdate } from "@/types/events";

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

export async function createEvent(payload: EventInsert): Promise<EventRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await (supabase as any)
    .from("events")
    .insert({
      ...payload,
      category: payload.category ?? "EstBirding",
      is_published: payload.is_published ?? false,
      created_by: user?.id ?? null,
    })
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as EventRow;
}

export async function updateEvent(id: string, patch: EventUpdate): Promise<EventRow> {
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

export async function publishEvent(id: string, isPublished: boolean): Promise<EventRow> {
  return updateEvent(id, { is_published: isPublished });
}
