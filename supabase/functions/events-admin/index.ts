import { createClient } from "npm:@supabase/supabase-js@2";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, x-admin-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const ADMIN_KEY = Deno.env.get("EVENTS_ADMIN_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  if (!ADMIN_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    if (!ADMIN_KEY) {
      return json(req, { error: "EVENTS_ADMIN_KEY missing" }, 500);
    }
    return json(req, { error: "server_not_configured" }, 500);
  }

  const providedKey = req.headers.get("x-admin-key") || "";

  if (providedKey !== ADMIN_KEY) {
    return json(req, { error: "unauthorized" }, 401);
  }

  try {
    const { action, payload } = await req.json();
    if (!action || typeof action !== "string") {
      return json(req, { error: "invalid_action" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const columns =
      "id,title,description,start_at,end_at,location_name,lat,lng,category,organizer_name,url,image_url,is_published,is_archived,created_by,created_at,updated_at";

    if (action === "list") {
      const { data, error } = await supabase.from("events").select(columns).order("start_at", {
        ascending: false,
      });
      if (error) return json(req, { error: error.message }, 400);
      return json(req, { ok: true, data: data ?? [] });
    }

    if (action === "create") {
      const row = payload ?? {};
      if (!row.title || !row.start_at) {
        return json(req, { error: "title and start_at are required" }, 400);
      }
      const { data, error } = await supabase
        .from("events")
        .insert(row)
        .select(columns)
        .single();
      if (error) return json(req, { error: error.message }, 400);
      return json(req, { ok: true, data }, 201);
    }

    if (action === "update") {
      const id = payload?.id;
      const patch = payload?.patch;
      if (!id || !patch || typeof patch !== "object") {
        return json(req, { error: "id and patch are required" }, 400);
      }
      const { data, error } = await supabase
        .from("events")
        .update(patch)
        .eq("id", id)
        .select(columns)
        .single();
      if (error) return json(req, { error: error.message }, 400);
      return json(req, { ok: true, data });
    }

    if (action === "delete") {
      const id = payload?.id;
      if (!id) return json(req, { error: "id is required" }, 400);
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) return json(req, { error: error.message }, 400);
      return json(req, { ok: true });
    }

    if (action === "publish") {
      const id = payload?.id;
      const isPublished = payload?.is_published;
      if (!id || typeof isPublished !== "boolean") {
        return json(req, { error: "id and is_published are required" }, 400);
      }
      const { data, error } = await supabase
        .from("events")
        .update({ is_published: isPublished })
        .eq("id", id)
        .select(columns)
        .single();
      if (error) return json(req, { error: error.message }, 400);
      return json(req, { ok: true, data });
    }

    if (action === "archive") {
      const id = payload?.id;
      const isArchived = payload?.is_archived;
      if (!id || typeof isArchived !== "boolean") {
        return json(req, { error: "id and is_archived are required" }, 400);
      }
      const { data, error } = await supabase
        .from("events")
        .update({ is_archived: isArchived })
        .eq("id", id)
        .select(columns)
        .single();
      if (error) return json(req, { error: error.message }, 400);
      return json(req, { ok: true, data });
    }

    return json(req, { error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return json(req, { error: message }, 500);
  }
});

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
