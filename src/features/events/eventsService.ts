import { getSupabaseUrl, supabaseFetch, validateSupabaseConfig } from "@/config/supabaseConfig";
import { supabase } from "@/config/supabaseClient";
import { getEventsAdminKey } from "./adminKey";

export type ManualEventType = "estbirding" | "muud";
export type ManualEventStatus = "active" | "archived" | "deleted";

export type ManualEventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  type: ManualEventType;
  location_name: string | null;
  lat: number | null;
  lon: number | null;
  url: string | null;
  description: string | null;
  image_url: string | null;
  image_path: string | null;
  status: ManualEventStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

export type ManualEventInput = {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  type: ManualEventType;
  location_name?: string | null;
  lat?: number | null;
  lon?: number | null;
  url?: string | null;
  description?: string | null;
  image_url?: string | null;
  image_path?: string | null;
};

export type ManualEventPatch = Partial<ManualEventInput>;

const READ_COLUMNS = "id,title,starts_at,ends_at,type,location_name,lat,lon,url,description,status,created_at,updated_at,archived_at,deleted_at";
const READ_COLUMNS_WITH_IMAGE = "id,title,starts_at,ends_at,type,location_name,lat,lon,url,description,image_url,image_path,status,created_at,updated_at,archived_at,deleted_at";

function sortByStartsAtAsc(list: ManualEventRow[]): ManualEventRow[] {
  return [...list].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

function normalizeType(value: unknown): ManualEventType {
  return String(value || "").toLowerCase() === "muud" ? "muud" : "estbirding";
}

function mapRow(raw: any): ManualEventRow {
  return {
    id: String(raw.id),
    title: String(raw.title || ""),
    starts_at: String(raw.starts_at || ""),
    ends_at: raw.ends_at ? String(raw.ends_at) : null,
    type: normalizeType(raw.type),
    location_name: raw.location_name ? String(raw.location_name) : null,
    lat: raw.lat == null ? null : Number(raw.lat),
    lon: raw.lon == null ? null : Number(raw.lon),
    url: raw.url ? String(raw.url) : null,
    description: raw.description ? String(raw.description) : null,
    image_url: raw.image_url ? String(raw.image_url) : null,
    image_path: raw.image_path ? String(raw.image_path) : null,
    status: (raw.status as ManualEventStatus) || "active",
    created_at: String(raw.created_at || ""),
    updated_at: String(raw.updated_at || ""),
    archived_at: raw.archived_at ? String(raw.archived_at) : null,
    deleted_at: raw.deleted_at ? String(raw.deleted_at) : null,
  };
}

async function parseJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function listPublicEventsManual(): Promise<ManualEventRow[]> {
  const validation = validateSupabaseConfig();
  if (!validation.ok || !validation.url) {
    throw new Error(validation.error || "Supabase config invalid");
  }

  const base = `${getSupabaseUrl().replace(/\/+$/, "")}/rest/v1/events_manual`;
  const query = `status=neq.deleted&order=starts_at.asc`;
  const withImageEndpoint = `${base}?select=${encodeURIComponent(READ_COLUMNS_WITH_IMAGE)}&${query}`;
  const fallbackEndpoint = `${base}?select=${encodeURIComponent(READ_COLUMNS)}&${query}`;

  let response = await supabaseFetch(withImageEndpoint, { method: "GET" });
  let json = await parseJsonResponse(response);
  if (!response.ok) {
    const firstMessage = String(json?.message || json?.error || json?.hint || "").toLowerCase();
    const missingImageColumn =
      response.status === 400 &&
      firstMessage.includes("column") &&
      (firstMessage.includes("image_url") || firstMessage.includes("image_path"));
    if (missingImageColumn) {
      response = await supabaseFetch(fallbackEndpoint, { method: "GET" });
      json = await parseJsonResponse(response);
    }
  }
  if (!response.ok) {
    const message = String(json?.message || json?.error || json?.hint || "");
    const lower = message.toLowerCase();
    if (
      response.status === 404 &&
      (lower.includes("schema cache") ||
        lower.includes("could not find") ||
        lower.includes("events_manual"))
    ) {
      throw new Error("Events table missing in Supabase. Run migration.");
    }
    throw new Error(`HTTP ${response.status}: ${message || "events read failed"}`);
  }
  const rows = Array.isArray(json) ? json.map(mapRow) : [];
  return sortByStartsAtAsc(rows);
}

function requireEventsAdminKey(): string {
  const eventsAdminKey = getEventsAdminKey();
  const key = (eventsAdminKey ?? "").trim();
  if (!key) {
    throw new Error("events_admin_key puudub");
  }
  return key;
}

function ensureIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

async function callRpcRow(functionName: string, args: Record<string, unknown>): Promise<ManualEventRow> {
  const { data, error } = await supabase.rpc(functionName as any, args as any);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapRow(row);
}

export async function testEventsAdminHealth(adminKey?: string): Promise<{ ok: boolean; now?: string }> {
  const key = (adminKey || requireEventsAdminKey()).trim();
  const { data, error } = await supabase.rpc("events_admin_health", { admin_key: key });
  if (error) {
    console.log("[events-admin-rpc] health error", { fn: "events_admin_health", error });
    throw error;
  }
  return (data as { ok: boolean; now?: string }) || { ok: true };
}

export async function createManualEvent(event: ManualEventInput): Promise<ManualEventRow> {
  const adminKey = requireEventsAdminKey();
  return callRpcRow("events_admin_create", {
    admin_key: adminKey,
    p_title: event.title,
    p_starts_at: ensureIso(event.starts_at),
    p_ends_at: ensureIso(event.ends_at ?? null),
    p_type: event.type,
    p_location_name: event.location_name ?? null,
    p_lat: event.lat ?? null,
    p_lon: event.lon ?? null,
    p_url: event.url ?? null,
    p_description: event.description ?? null,
    p_image_url: event.image_url ?? null,
    p_image_path: event.image_path ?? null,
  });
}

export async function updateManualEvent(id: string, patch: ManualEventPatch): Promise<ManualEventRow> {
  const adminKey = requireEventsAdminKey();
  return callRpcRow("events_admin_update", {
    admin_key: adminKey,
    p_id: id,
    p_patch: patch,
  });
}

export async function archiveManualEvent(id: string): Promise<ManualEventRow> {
  const adminKey = requireEventsAdminKey();
  return callRpcRow("events_admin_archive", { admin_key: adminKey, p_id: id });
}

export async function unarchiveManualEvent(id: string): Promise<ManualEventRow> {
  const adminKey = requireEventsAdminKey();
  return callRpcRow("events_admin_unarchive", { admin_key: adminKey, p_id: id });
}

export async function deleteManualEvent(id: string): Promise<ManualEventRow> {
  const adminKey = requireEventsAdminKey();
  return callRpcRow("events_admin_delete", { admin_key: adminKey, p_id: id });
}

function safeFileName(name: string): string {
  const cleaned = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-");
  return cleaned || "image.jpg";
}

export async function uploadEventImage(eventId: string, file: File): Promise<{ image_url: string; image_path: string }> {
  const id = String(eventId || "").trim();
  if (!id) throw new Error("event id is required for image upload");

  const safeName = safeFileName(file.name || "image.jpg");
  const path = `events/${id}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from("event-images").upload(path, file, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("event-images").getPublicUrl(path);
  const image_url = String(data?.publicUrl || "");
  const image_path = path;
  if (!image_url || !image_path) throw new Error("Image upload failed");
  return { image_url, image_path };
}

export async function deleteEventImage(path: string): Promise<void> {
  const cleanPath = String(path || "").trim();
  if (!cleanPath) return;
  const { error } = await supabase.storage.from("event-images").remove([cleanPath]);
  if (error) throw error;
}
