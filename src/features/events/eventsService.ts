import { getSupabaseAnonKey, getSupabaseUrl, supabaseFetch, validateSupabaseConfig } from "@/config/supabaseConfig";
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
};

export type ManualEventPatch = Partial<ManualEventInput>;

const READ_COLUMNS = "id,title,starts_at,ends_at,type,location_name,lat,lon,url,description,status,created_at,updated_at,archived_at,deleted_at";

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

export function getEventsAdminUrl(): string {
  const resolvedSupabaseUrl = getSupabaseUrl().replace(/\/+$/, "");
  return `${resolvedSupabaseUrl}/functions/v1/events-admin`;
}

async function callEventsAdminDirect(body: Record<string, unknown>): Promise<any> {
  const url = getEventsAdminUrl();
  const anon = getSupabaseAnonKey();
  if (!anon) {
    throw new Error("Supabase anon key missing (check VITE_SUPABASE_ANON_KEY)");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = String(json?.error || json?.message || text?.slice(0, 200) || `HTTP ${res.status}`);
    const err = new Error(msg) as Error & { status?: number; url?: string };
    err.status = res.status;
    err.url = url;
    throw err;
  }

  return json;
}

export async function listPublicEventsManual(): Promise<ManualEventRow[]> {
  const validation = validateSupabaseConfig();
  if (!validation.ok || !validation.url) {
    throw new Error(validation.error || "Supabase config invalid");
  }

  const endpoint = `${getSupabaseUrl().replace(/\/+$/, "")}/rest/v1/events_manual?select=${encodeURIComponent(READ_COLUMNS)}&status=neq.deleted&order=starts_at.asc`;
  const response = await supabaseFetch(endpoint, { method: "GET" });
  const json = await parseJsonResponse(response);
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
  const key = getEventsAdminKey();
  if (!key) {
    throw new Error("events_admin_key puudub");
  }
  return key;
}

async function callEventsAdmin(action: "create" | "update" | "archive" | "unarchive" | "delete", payload: Record<string, unknown>): Promise<ManualEventRow> {
  const key = requireEventsAdminKey();
  const url = getEventsAdminUrl();
  try {
    const data = await callEventsAdminDirect({ adminKey: key, action, ...payload });
    return mapRow((data as any)?.data || data);
  } catch (error: any) {
    const errorName = String(error?.name || "");
    const message = String(error?.message || "events-admin failed");
    const status = Number(error?.status || 0) || undefined;
    const errorUrl = String(error?.url || url);
    console.error("[events-admin] invoke failed", {
      method: "POST",
      url: errorUrl,
      fn: "events-admin",
      hasAdminKey: Boolean(key),
      status,
      errorName,
      errorMessage: message,
    });
    throw new Error(`HTTP ${status ?? "?"} ${message} [${errorUrl}]`);
  }
}

export async function testEventsAdminHealth(adminKey?: string): Promise<{ ok: boolean; now?: string }> {
  const endpoint = getEventsAdminUrl();
  try {
    const data = await callEventsAdminDirect({ action: "health" });
    return data as { ok: boolean; now?: string };
  } catch (error: any) {
    const errorName = String(error?.name || "");
    const message = String(error?.message || "health check failed");
    const status = Number(error?.status || 0) || undefined;
    const errorUrl = String(error?.url || endpoint);
    console.error("[events-admin] health failed", {
      method: "POST",
      url: errorUrl,
      fn: "events-admin",
      hasAdminKey: Boolean(adminKey?.trim() || getEventsAdminKey()),
      status,
      errorName,
      errorMessage: message,
    });
    throw new Error(`HTTP ${status ?? "?"} ${message} [${errorUrl}]`);
  }
}

export async function createManualEvent(event: ManualEventInput): Promise<ManualEventRow> {
  return callEventsAdmin("create", { event });
}

export async function updateManualEvent(id: string, patch: ManualEventPatch): Promise<ManualEventRow> {
  return callEventsAdmin("update", { id, patch });
}

export async function archiveManualEvent(id: string): Promise<ManualEventRow> {
  return callEventsAdmin("archive", { id });
}

export async function unarchiveManualEvent(id: string): Promise<ManualEventRow> {
  return callEventsAdmin("unarchive", { id });
}

export async function deleteManualEvent(id: string): Promise<ManualEventRow> {
  return callEventsAdmin("delete", { id });
}
