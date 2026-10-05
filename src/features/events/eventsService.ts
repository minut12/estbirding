import { getSupabaseUrl, supabaseFetch, validateSupabaseConfig } from "@/config/supabaseConfig";
import { supabase } from "@/config/supabaseClient";

export type ManualEventType = "estbirding" | "eoy" | "muud";
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

export function normalizeType(value: unknown): ManualEventType {
  const lower = String(value || "").toLowerCase();
  if (lower === "eoy") return "eoy";
  if (lower === "muud") return "muud";
  return "estbirding";
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
  const query = `status=eq.active&order=starts_at.asc`;
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

function ensureIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

// Casts to `any` remain because Supabase TS types haven't been regenerated yet
// after the events_admin_* RPCs were rewritten to drop the admin_key parameter.
async function callRpcRow(functionName: string, args: Record<string, unknown>): Promise<ManualEventRow> {
  const { data, error } = await supabase.rpc(functionName as any, args as any);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapRow(row);
}

export async function testEventsAdminHealth(): Promise<{ ok: boolean; now?: string }> {
  const { data, error } = await supabase.rpc("events_admin_health" as any, {} as any);
  if (error) {
    console.log("[events-admin-rpc] health error", { fn: "events_admin_health", error });
    throw error;
  }
  return (data as { ok: boolean; now?: string }) || { ok: true };
}

export async function createManualEvent(event: ManualEventInput): Promise<ManualEventRow> {
  return callRpcRow("events_admin_create", {
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
  return callRpcRow("events_admin_update", {
    p_id: id,
    p_patch: patch,
  });
}

export async function deleteManualEvent(id: string): Promise<ManualEventRow> {
  return callRpcRow("events_admin_delete", { p_id: id });
}

// ---------------------------------------------------------------------------
// event-from-url Edge Function (admin pastes a URL -> prefilled event fields)
// ---------------------------------------------------------------------------

export type EventFromUrlExtraction = "jsonld" | "facebook" | "llm" | "og-only";
export type EventFromUrlSourceHint = "estbirding" | "eoy" | "muu";

export type EventFromUrlFields = {
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location_name: string | null;
  lat: number | null;
  lon: number | null;
  description: string | null;
  image_url: string | null;
};

export type EventFromUrlResult = {
  ok: true;
  url: string;
  host: string;
  source_hint: EventFromUrlSourceHint;
  extraction: EventFromUrlExtraction;
  fields: EventFromUrlFields;
  warnings: string[];
};

export class EventFromUrlError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "EventFromUrlError";
    this.status = status;
  }
}

const EXTRACTIONS: readonly EventFromUrlExtraction[] = ["jsonld", "facebook", "llm", "og-only"];
const SOURCE_HINTS: readonly EventFromUrlSourceHint[] = ["estbirding", "eoy", "muu"];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new EventFromUrlError(0, `invalid_field:${field}`);
  return value.trim() ? value : null;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new EventFromUrlError(0, `invalid_field:${field}`);
  return value;
}

function parseFields(raw: unknown): EventFromUrlFields {
  if (!isPlainRecord(raw)) throw new EventFromUrlError(0, "invalid_field:fields");
  return {
    title: nullableString(raw.title, "title"),
    starts_at: nullableString(raw.starts_at, "starts_at"),
    ends_at: nullableString(raw.ends_at, "ends_at"),
    location_name: nullableString(raw.location_name, "location_name"),
    lat: nullableNumber(raw.lat, "lat"),
    lon: nullableNumber(raw.lon, "lon"),
    description: nullableString(raw.description, "description"),
    image_url: nullableString(raw.image_url, "image_url"),
  };
}

/** Pure validator for the event-from-url success payload. Throws EventFromUrlError(status 0) on malformed input. */
export function parseEventFromUrlResponse(json: unknown): EventFromUrlResult {
  if (!isPlainRecord(json) || json.ok !== true) throw new EventFromUrlError(0, "malformed_response");
  const extraction = EXTRACTIONS.find((value) => value === json.extraction);
  const sourceHint = SOURCE_HINTS.find((value) => value === json.source_hint);
  if (!extraction) throw new EventFromUrlError(0, "invalid_field:extraction");
  if (!sourceHint) throw new EventFromUrlError(0, "invalid_field:source_hint");
  const warnings = Array.isArray(json.warnings) ? json.warnings.filter((w): w is string => typeof w === "string") : [];
  return {
    ok: true,
    url: typeof json.url === "string" ? json.url : "",
    host: typeof json.host === "string" ? json.host : "",
    source_hint: sourceHint,
    extraction,
    fields: parseFields(json.fields),
    warnings,
  };
}

async function errorFromInvoke(error: unknown): Promise<EventFromUrlError> {
  const maybe = error as { message?: unknown; context?: unknown } | null;
  const fallback = typeof maybe?.message === "string" ? maybe.message : "event_from_url_failed";
  if (!(maybe?.context instanceof Response)) return new EventFromUrlError(0, fallback);
  const status = maybe.context.status;
  try {
    const payload: unknown = await maybe.context.json();
    const message = isPlainRecord(payload) && typeof payload.error === "string" ? payload.error : fallback;
    return new EventFromUrlError(status, message);
  } catch {
    return new EventFromUrlError(status, fallback);
  }
}

/** Calls event-from-url with the signed-in user's JWT (supabase.functions.invoke attaches the session token). */
export async function fetchEventFromUrl(url: string): Promise<EventFromUrlResult> {
  const { data, error } = await supabase.functions.invoke("event-from-url", { body: { url } });
  if (error) throw await errorFromInvoke(error);
  if (isPlainRecord(data) && data.ok === false) {
    throw new EventFromUrlError(0, typeof data.error === "string" ? data.error : "event_from_url_failed");
  }
  return parseEventFromUrlResponse(data);
}
