import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, x-admin-key, apikey, authorization, x-ingest-key, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickAdminEventColumns(input: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  const allowed = [
    "title",
    "description",
    "start_at",
    "end_at",
    "location_name",
    "lat",
    "lng",
    "category",
    "organizer_name",
    "url",
    "image_url",
    "is_published",
    "is_archived",
  ];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) row[key] = input[key];
  }
  return row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (typeof action === "string" && action.startsWith("admin_")) {
      const adminKey = req.headers.get("x-admin-key") ?? "";
      const expectedAdminKey = Deno.env.get("EVENTS_ADMIN_KEY");
      if (!expectedAdminKey || adminKey !== expectedAdminKey) {
        return json(401, { error: "unauthorized" });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) {
        return json(500, { error: "service env missing" });
      }
      const supabase = createClient(supabaseUrl, serviceKey);
      const payload = body?.payload ?? {};

      if (action === "admin_list") {
        const { data, error } = await supabase.from("events").select("*").order("start_at", { ascending: false });
        if (error) return json(500, { error: error.message });
        return json(200, { data });
      }

      if (action === "admin_create") {
        const insertPayload = pickAdminEventColumns(payload || {});
        if (!insertPayload?.title || !insertPayload?.start_at) {
          return json(400, { error: "title and start_at required" });
        }
        const { data, error } = await supabase.from("events").insert(insertPayload).select("*").single();
        if (error) return json(500, { error: error.message });
        return json(200, { data });
      }

      if (action === "admin_update") {
        const { id, patch } = payload || {};
        if (!id || !patch) return json(400, { error: "id and patch required" });
        const updatePatch = pickAdminEventColumns(patch || {});
        const { data, error } = await supabase.from("events").update(updatePatch).eq("id", id).select("*").single();
        if (error) return json(500, { error: error.message });
        return json(200, { data });
      }

      if (action === "admin_delete") {
        const { id } = payload || {};
        if (!id) return json(400, { error: "id required" });
        const { error } = await supabase.from("events").delete().eq("id", id);
        if (error) return json(500, { error: error.message });
        return json(200, { data: { ok: true } });
      }

      if (action === "admin_archive") {
        const { id, is_archived } = payload || {};
        if (!id || typeof is_archived !== "boolean") return json(400, { error: "id and is_archived required" });
        const { data, error } = await supabase
          .from("events")
          .update({ is_archived })
          .eq("id", id)
          .select("*")
          .single();
        if (error) return json(500, { error: error.message });
        return json(200, { data });
      }

      if (action === "admin_publish") {
        const { id, is_published } = payload || {};
        if (!id || typeof is_published !== "boolean") return json(400, { error: "id and is_published required" });
        const { data, error } = await supabase
          .from("events")
          .update({ is_published })
          .eq("id", id)
          .select("*")
          .single();
        if (error) return json(500, { error: error.message });
        return json(200, { data });
      }

      return json(400, { error: "unknown_action", action });
    }

    // Validate ingest key
    const ingestKey = req.headers.get("x-ingest-key");
    const expectedKey = Deno.env.get("EVENTS_INGEST_KEY");
    if (!expectedKey || ingestKey !== expectedKey) {
      return json(401, { error: "Unauthorized" });
    }

    const { source_slug, items } = body;

    if (!source_slug || !Array.isArray(items) || items.length === 0) {
      return json(400, { error: "source_slug and items[] are required" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get source
    const { data: source, error: srcErr } = await supabase
      .from("events_sources")
      .select("id, slug")
      .eq("slug", source_slug)
      .single();

    if (srcErr || !source) {
      return json(404, { error: `Source "${source_slug}" not found` });
    }

    const category = source_slug === "estbirding" ? "estbirding" : "other";

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const item of items) {
      if (!item.title || !item.start_at) {
        errors++;
        continue;
      }

      const guid = item.guid || `${source_slug}:${item.url || item.title + item.start_at}`;

      const row = {
        source_id: source.id,
        source_slug,
        category,
        title: item.title,
        description: item.description || "",
        content_html: item.content_html || null,
        location_name: item.location_name || null,
        location_lat: item.location_lat ?? null,
        location_lon: item.location_lon ?? null,
        start_at: item.start_at,
        end_at: item.end_at || null,
        all_day: item.all_day ?? false,
        url: item.url || null,
        image_url: item.image_url || null,
        registration_url: item.registration_url || null,
        tags: item.tags || null,
        language: item.language || "et",
        guid,
        is_cancelled: item.is_cancelled ?? false,
      };

      const { error, status } = await supabase
        .from("events")
        .upsert(row, { onConflict: "guid" });

      if (!error) {
        if (status === 201) inserted++;
        else updated++;
      } else {
        console.error(`Upsert error for ${guid}:`, error);
        errors++;
      }
    }

    return json(200, { success: true, inserted, updated, errors });
  } catch (error) {
    console.error("events-ingest error:", error);
    return json(500, { error: error.message });
  }
});
