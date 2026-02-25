import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-admin-key, apikey, authorization",
};

const ADMIN_KEY = Deno.env.get("EVENTS_ADMIN_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (!ADMIN_KEY) {
    return json({ error: "EVENTS_ADMIN_KEY missing" }, 500);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server_not_configured" }, 500);
  }

  const provided = req.headers.get("x-admin-key") ?? "";
  if (provided !== ADMIN_KEY) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const { action, payload } = await req.json();
    if (!action || typeof action !== "string") {
      return json({ error: "invalid_action" }, 400);
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const columns =
      "id,title,description,start_at,end_at,location_name,lat,lng,category,organizer_name,url,image_url,is_published,is_archived,created_by,created_at,updated_at";

    if (action === "list") {
      const { data, error } = await db.from("events").select(columns).order("start_at", { ascending: false });
      if (error) return json({ error: error.message }, 400);
      return json({ data: data ?? [] }, 200);
    }

    if (action === "create") {
      const row = payload ?? {};
      if (!row.title || !row.start_at) {
        return json({ error: "title and start_at are required" }, 400);
      }
      const { data, error } = await db.from("events").insert(row).select(columns).single();
      if (error) return json({ error: error.message }, 400);
      return json({ data }, 200);
    }

    if (action === "update") {
      const id = payload?.id;
      const patch = payload?.patch;
      if (!id || !patch || typeof patch !== "object") {
        return json({ error: "id and patch are required" }, 400);
      }
      const { data, error } = await db.from("events").update(patch).eq("id", id).select(columns).single();
      if (error) return json({ error: error.message }, 400);
      return json({ data }, 200);
    }

    if (action === "delete") {
      const id = payload?.id;
      if (!id) return json({ error: "id is required" }, 400);
      const { error } = await db.from("events").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true }, 200);
    }

    if (action === "publish") {
      const id = payload?.id;
      const isPublished = payload?.is_published;
      if (!id || typeof isPublished !== "boolean") {
        return json({ error: "id and is_published are required" }, 400);
      }
      const { data, error } = await db
        .from("events")
        .update({ is_published: isPublished })
        .eq("id", id)
        .select(columns)
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ data }, 200);
    }

    if (action === "archive") {
      const id = payload?.id;
      const isArchived = payload?.is_archived;
      if (!id || typeof isArchived !== "boolean") {
        return json({ error: "id and is_archived are required" }, 400);
      }
      const { data, error } = await db
        .from("events")
        .update({ is_archived: isArchived })
        .eq("id", id)
        .select(columns)
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ data }, 200);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
