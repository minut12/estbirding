import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-control-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONTROL_KEY = Deno.env.get("LINNULIIGID_CONTROL_KEY") || "";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isMissingColumnError(err: unknown, col: string) {
  const msg = String((err as { message?: string })?.message || err || "").toLowerCase();
  return msg.includes("column") && msg.includes(col.toLowerCase());
}

async function selectRunningRow(supabase: ReturnType<typeof createClient>) {
  const primary = await supabase
    .from("linnuliigid_snapshot")
    .select("*")
    .eq("status", "running")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!primary.error && primary.data) return primary;
  if (primary.error && !isMissingColumnError(primary.error, "updated_at")) return primary;

  const fallbackRunning = await supabase
    .from("linnuliigid_snapshot")
    .select("*")
    .eq("status", "running")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!fallbackRunning.error && fallbackRunning.data) return fallbackRunning;
  if (fallbackRunning.error) return fallbackRunning;

  return await supabase
    .from("linnuliigid_snapshot")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
}

async function updateRow(
  supabase: ReturnType<typeof createClient>,
  rowId: number,
  patch: Record<string, unknown>,
) {
  const attempt = await supabase
    .from("linnuliigid_snapshot")
    .update(patch)
    .eq("id", rowId)
    .select("*")
    .single();
  if (!attempt.error) return attempt;

  const retry = { ...patch };
  if (isMissingColumnError(attempt.error, "updated_at")) delete retry.updated_at;
  if (isMissingColumnError(attempt.error, "heartbeat_at")) delete retry.heartbeat_at;
  if (Object.keys(retry).length === Object.keys(patch).length) return attempt;
  return await supabase
    .from("linnuliigid_snapshot")
    .update(retry)
    .eq("id", rowId)
    .select("*")
    .single();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  if (CONTROL_KEY) {
    const got = req.headers.get("x-control-key") || "";
    if (got !== CONTROL_KEY) return json(401, { error: "invalid_control_key" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body?.action || "").toLowerCase();
    const nowIso = new Date().toISOString();

    const { data: row, error: rowError } = await selectRunningRow(supabase);
    if (rowError) throw rowError;
    if (!row) return json(404, { error: "no_snapshot_row" });

    const rowId = Number((row as { id?: number }).id || 1);
    const prevError = String((row as { last_error?: string | null }).last_error || "").trim();

    if (action === "force_advance") {
      const toIndex = Math.max(0, Number(body?.toIndex || 0) || 0);
      const reason = String(body?.reason || "manual");
      const currentDone = Number((row as { progress_done?: number }).progress_done || 0);
      const progressTotal = Number((row as { progress_total?: number }).progress_total || 0);
      const nextDone = Math.max(currentDone, toIndex);
      const nextErrorLine = `forced advance to ${nextDone} (${reason}) @ ${nowIso}`;
      const last_error = prevError ? `${prevError}\n${nextErrorLine}` : nextErrorLine;

      const { data: updated, error: updateError } = await updateRow(supabase, rowId, {
        progress_done: nextDone,
        progress_total: progressTotal || null,
        updated_at: nowIso,
        heartbeat_at: nowIso,
        last_error,
      });
      if (updateError) throw updateError;
      return json(200, updated);
    }

    if (action === "force_stop") {
      const reason = String(body?.reason || "manual");
      const nextErrorLine = `forced stop (${reason}) @ ${nowIso}`;
      const last_error = prevError ? `${prevError}\n${nextErrorLine}` : nextErrorLine;

      const { data: updated, error: updateError } = await updateRow(supabase, rowId, {
        status: "stopped",
        updated_at: nowIso,
        heartbeat_at: nowIso,
        last_error,
      });
      if (updateError) throw updateError;
      return json(200, updated);
    }

    return json(400, { error: "unknown_action", action });
  } catch (error) {
    return json(500, { error: String((error as { message?: string })?.message || error) });
  }
});

