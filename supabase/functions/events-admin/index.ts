import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-admin-key, apikey, authorization",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const ADMIN_KEY = Deno.env.get("EVENTS_ADMIN_KEY");
    if (!ADMIN_KEY) return json(500, { error: "EVENTS_ADMIN_KEY missing" });

    const provided = req.headers.get("x-admin-key") ?? "";
    if (provided !== ADMIN_KEY) return json(401, { error: "unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json(500, { error: "service env missing" });

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => null) as any;
    const action = body?.action;
    const payload = body?.payload ?? {};

    if (!action) return json(400, { error: "missing_action" });

    if (action === "list") {
      const { data, error } = await supabase.from("events").select("*").order("start_at", { ascending: false });
      if (error) return json(500, { error: error.message });
      return json(200, { data });
    }

    if (action === "create") {
      if (!payload?.title || !payload?.start_at) return json(400, { error: "title and start_at required" });
      const { data, error } = await supabase.from("events").insert(payload).select("*").single();
      if (error) return json(500, { error: error.message });
      return json(200, { data });
    }

    if (action === "update") {
      const { id, patch } = payload || {};
      if (!id || !patch) return json(400, { error: "id and patch required" });
      const { data, error } = await supabase.from("events").update(patch).eq("id", id).select("*").single();
      if (error) return json(500, { error: error.message });
      return json(200, { data });
    }

    if (action === "delete") {
      const { id } = payload || {};
      if (!id) return json(400, { error: "id required" });
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) return json(500, { error: error.message });
      return json(200, { data: { ok: true } });
    }

    if (action === "publish") {
      const { id, is_published } = payload || {};
      if (!id || typeof is_published !== "boolean") return json(400, { error: "id and is_published required" });
      const { data, error } = await supabase.from("events").update({ is_published }).eq("id", id).select("*").single();
      if (error) return json(500, { error: error.message });
      return json(200, { data });
    }

    if (action === "archive") {
      const { id, is_archived } = payload || {};
      if (!id || typeof is_archived !== "boolean") return json(400, { error: "id and is_archived required" });
      const { data, error } = await supabase.from("events").update({ is_archived }).eq("id", id).select("*").single();
      if (error) return json(500, { error: error.message });
      return json(200, { data });
    }

    return json(400, { error: "unknown_action", action });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
