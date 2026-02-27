import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
});

function json(status: number, body: unknown, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function parseIsoOrNull(value: unknown): string | null {
  const v = asString(value);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validateEventInput(input: any): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const title = asString(input?.title);
  const startsAt = parseIsoOrNull(input?.starts_at);
  const endsAt = parseIsoOrNull(input?.ends_at);
  const type = asString(input?.type).toLowerCase() === "muud" ? "muud" : "estbirding";

  if (!title) return { ok: false, error: "title is required" };
  if (!startsAt) return { ok: false, error: "starts_at is required and must be valid ISO datetime" };
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    return { ok: false, error: "ends_at must be greater than or equal to starts_at" };
  }

  return {
    ok: true,
    value: {
      title,
      starts_at: startsAt,
      ends_at: endsAt,
      type,
      location_name: asString(input?.location_name) || null,
      lat: parseNumberOrNull(input?.lat),
      lon: parseNumberOrNull(input?.lon),
      url: asString(input?.url) || null,
      description: asString(input?.description) || null,
      updated_at: new Date().toISOString(),
    },
  };
}

function validatePatch(input: any): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const allowed = ["title", "starts_at", "ends_at", "type", "location_name", "lat", "lon", "url", "description"];
  const patchRaw: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input || {}, key)) {
      patchRaw[key] = (input as any)[key];
    }
  }

  if (Object.keys(patchRaw).length === 0) {
    return { ok: false, error: "patch is empty" };
  }

  const base: any = {};
  if (patchRaw.title !== undefined) {
    const title = asString(patchRaw.title);
    if (!title) return { ok: false, error: "title cannot be empty" };
    base.title = title;
  }
  if (patchRaw.starts_at !== undefined) {
    const starts = parseIsoOrNull(patchRaw.starts_at);
    if (!starts) return { ok: false, error: "starts_at must be valid datetime" };
    base.starts_at = starts;
  }
  if (patchRaw.ends_at !== undefined) {
    if (patchRaw.ends_at == null || asString(patchRaw.ends_at) === "") base.ends_at = null;
    else {
      const ends = parseIsoOrNull(patchRaw.ends_at);
      if (!ends) return { ok: false, error: "ends_at must be valid datetime" };
      base.ends_at = ends;
    }
  }
  if (patchRaw.type !== undefined) {
    base.type = asString(patchRaw.type).toLowerCase() === "muud" ? "muud" : "estbirding";
  }
  if (patchRaw.location_name !== undefined) base.location_name = asString(patchRaw.location_name) || null;
  if (patchRaw.lat !== undefined) {
    const lat = parseNumberOrNull(patchRaw.lat);
    if (patchRaw.lat !== null && patchRaw.lat !== "" && lat == null) return { ok: false, error: "lat must be number" };
    base.lat = lat;
  }
  if (patchRaw.lon !== undefined) {
    const lon = parseNumberOrNull(patchRaw.lon);
    if (patchRaw.lon !== null && patchRaw.lon !== "" && lon == null) return { ok: false, error: "lon must be number" };
    base.lon = lon;
  }
  if (patchRaw.url !== undefined) base.url = asString(patchRaw.url) || null;
  if (patchRaw.description !== undefined) base.description = asString(patchRaw.description) || null;

  if (base.starts_at && base.ends_at && new Date(base.ends_at).getTime() < new Date(base.starts_at).getTime()) {
    return { ok: false, error: "ends_at must be greater than or equal to starts_at" };
  }

  base.updated_at = new Date().toISOString();
  return { ok: true, value: base };
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (req.method === "GET") {
      return json(200, { ok: true, fn: "events-admin", now: new Date().toISOString() }, headers);
    }

    if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, headers);

    const body = await req.json().catch(() => ({}));
    const action = asString(body?.action);

    if (action === "health") {
      return json(200, { ok: true, fn: "events-admin", now: new Date().toISOString() }, headers);
    }

    const expectedKey = (Deno.env.get("EVENTS_ADMIN_KEY") ?? "").toString().trim();
    const providedKey = (body?.adminKey ?? "").toString().trim();
    if (!expectedKey || providedKey !== expectedKey) {
      return json(401, { error: "invalid admin key" }, headers);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json(500, { error: "service env missing" }, headers);

    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === "create") {
      const valid = validateEventInput(body?.event);
      if (!valid.ok) return json(400, { error: valid.error }, headers);
      const row = {
        ...valid.value,
        status: "active",
      };
      const { data, error } = await supabase.from("events_manual").insert(row).select("*").single();
      if (error) return json(500, { error: error.message }, headers);
      return json(200, { data }, headers);
    }

    if (action === "update") {
      const id = asString(body?.id);
      if (!id) return json(400, { error: "id is required" }, headers);
      const valid = validatePatch(body?.patch);
      if (!valid.ok) return json(400, { error: valid.error }, headers);
      const { data, error } = await supabase.from("events_manual").update(valid.value).eq("id", id).select("*").single();
      if (error) return json(500, { error: error.message }, headers);
      return json(200, { data }, headers);
    }

    if (action === "archive") {
      const id = asString(body?.id);
      if (!id) return json(400, { error: "id is required" }, headers);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("events_manual")
        .update({ status: "archived", archived_at: now, updated_at: now })
        .eq("id", id)
        .select("*")
        .single();
      if (error) return json(500, { error: error.message }, headers);
      return json(200, { data }, headers);
    }

    if (action === "unarchive") {
      const id = asString(body?.id);
      if (!id) return json(400, { error: "id is required" }, headers);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("events_manual")
        .update({ status: "active", archived_at: null, updated_at: now })
        .eq("id", id)
        .select("*")
        .single();
      if (error) return json(500, { error: error.message }, headers);
      return json(200, { data }, headers);
    }

    if (action === "delete") {
      const id = asString(body?.id);
      if (!id) return json(400, { error: "id is required" }, headers);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("events_manual")
        .update({ status: "deleted", deleted_at: now, updated_at: now })
        .eq("id", id)
        .select("*")
        .single();
      if (error) return json(500, { error: error.message }, headers);
      return json(200, { data }, headers);
    }

    return json(400, { error: "unknown action" }, headers);
  } catch (error) {
    return json(500, { error: String(error) }, headers);
  }
});
