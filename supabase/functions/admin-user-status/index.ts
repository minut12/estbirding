// redeploy-marker: 2026-10-08 - P97e1 admin-user-status (ban/unban via auth admin API + profiles.status)
//
// Admin-only endpoint to block or unblock a user account.
// - Blocking bans the user in Supabase Auth (long ban_duration) and sets
//   profiles.status = 'disabled'; unblocking lifts the ban and sets 'active'.
// - Admins cannot be blocked, and nobody can change their own status.
// - If the profiles update fails after the auth change, the previous ban state is restored exactly.
// - App-side sign-out of an already signed-in blocked user is handled in P97e2.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants / types
// ---------------------------------------------------------------------------

const ACTION = "admin-user-status";
const BAN_FOREVER = "876000h";
const BAN_NONE = "none";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TargetStatus = "active" | "disabled";

interface StatusRequest {
  userId: string;
  status: TargetStatus;
}

// ---------------------------------------------------------------------------
// CORS + JSON helpers (copied from avatar-candidates, methods narrowed to POST)
// ---------------------------------------------------------------------------

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
});

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Runtime guards
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTargetStatus(value: unknown): value is TargetStatus {
  return value === "active" || value === "disabled";
}

function isStatusRequest(value: unknown): value is StatusRequest {
  if (!isRecord(value)) return false;
  const { userId, status } = value;
  return typeof userId === "string" && UUID_RE.test(userId) && isTargetStatus(status);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" }, headers);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { ok: false, error: "Unauthorized" }, headers);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return json(500, { ok: false, error: "internal_error" }, headers);

    // Caller-scoped client: used ONLY for getUser + admin assert.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json(401, { ok: false, error: "Unauthorized" }, headers);

    const { error: adminError } = await authClient.rpc("events_admin_assert_admin");
    if (adminError) return json(403, { ok: false, error: "forbidden" }, headers);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json(400, { ok: false, error: "invalid_request" }, headers);
    }
    if (!isStatusRequest(rawBody)) return json(400, { ok: false, error: "invalid_request" }, headers);

    const { userId, status } = rawBody;

    if (userId.toLowerCase() === authData.user.id.toLowerCase()) {
      return json(400, { ok: false, error: "cannot change own status" }, headers);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json(500, { ok: false, error: "internal_error" }, headers);

    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Target must exist.
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id, status")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return json(500, { ok: false, error: "internal_error" }, headers);
    if (!profile) return json(404, { ok: false, error: "user not found" }, headers);
    const previousStatus: unknown = profile.status;

    // Admins cannot be blocked (filtered select: works with multiple role rows).
    if (status === "disabled") {
      const { data: adminRows, error: roleError } = await service
        .from("user_roles")
        .select("user_id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .limit(1);
      if (roleError) return json(500, { ok: false, error: "internal_error" }, headers);
      if (adminRows && adminRows.length > 0) {
        return json(409, { ok: false, error: "cannot block an admin" }, headers);
      }
    }

    // Snapshot the current ban state so a failed profile update restores exactly it.
    const { data: authUser, error: getUserError } = await service.auth.admin.getUserById(userId);
    if (getUserError || !authUser?.user) {
      console.error(ACTION, { userId, status, result: "auth_read_failed" });
      return json(502, { ok: false, error: "auth_update_failed" }, headers);
    }
    const bannedUntil = authUser.user.banned_until;
    const wasBanned = typeof bannedUntil === "string" && Date.parse(bannedUntil) > Date.now();

    const { error: banError } = await service.auth.admin.updateUserById(userId, {
      ban_duration: status === "disabled" ? BAN_FOREVER : BAN_NONE,
    });
    if (banError) {
      console.error(ACTION, { userId, status, result: "auth_update_failed" });
      return json(502, { ok: false, error: "auth_update_failed" }, headers);
    }

    const { data: updated, error: updateError } = await service
      .from("profiles")
      .update({ status })
      .eq("id", userId)
      .select("id");
    if (updateError || !updated || updated.length === 0) {
      try {
        const { error: revertError } = await service.auth.admin.updateUserById(userId, {
          ban_duration: wasBanned ? BAN_FOREVER : BAN_NONE,
        });
        if (revertError) console.error(ACTION, { userId, status, result: "revert_failed" });
      } catch {
        console.error(ACTION, { userId, status, result: "revert_threw" });
      }
      console.error(ACTION, { userId, status, previousStatus, wasBanned, result: "profile_update_failed" });
      return json(500, { ok: false, error: "profile_update_failed" }, headers);
    }

    console.log(ACTION, { userId, status, result: "ok" });
    return json(200, { ok: true, status }, headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(ACTION, "internal_error", message);
    return json(500, { ok: false, error: "internal_error" }, headers);
  }
});
