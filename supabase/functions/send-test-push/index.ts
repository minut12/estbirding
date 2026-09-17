// P35: send one test push to an endpoint the caller already owns, so a device
// can prove end-to-end delivery without waiting for a real rare-bird detection.
//
// Anon-callable by design: it takes no species and no arbitrary payload — the
// only thing it can do is push a fixed message to an endpoint that is already
// in push_subscriptions. Knowing the endpoint is itself the credential.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ENDPOINT_LENGTH = 2048;
const RATE_LIMIT_MS = 60_000;

// Best-effort only: edge isolates are recycled, so this throttles a hammering
// device within one isolate's lifetime rather than enforcing a global quota.
const lastSentAt = new Map<string, number>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let endpoint: unknown;
    try {
      ({ endpoint } = await req.json());
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (
      typeof endpoint !== "string" ||
      !endpoint.startsWith("https://") ||
      endpoint.length >= MAX_ENDPOINT_LENGTH
    ) {
      return json({ error: "invalid_endpoint" }, 400);
    }

    const previous = lastSentAt.get(endpoint);
    if (previous !== undefined && Date.now() - previous < RATE_LIMIT_MS) {
      return json(
        { error: "rate_limited", retryAfterMs: RATE_LIMIT_MS - (Date.now() - previous) },
        429,
      );
    }

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@estbirding.ee";
    if (!vapidPublic || !vapidPrivate) {
      return json({ error: "VAPID keys not configured" }, 500);
    }

    try {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    } catch (e) {
      return json({ error: "VAPID setup failed", detail: errorMessage(e) }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint,key_p256dh,key_auth")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) throw error;
    if (!row) return json({ error: "not_subscribed" }, 404);

    lastSentAt.set(endpoint, Date.now());

    const payload = {
      title: "Testteavitus",
      body: "EstBirding teavitused töötavad.",
      url: "/",
      tag: "estbirding-test",
    };

    try {
      const result = await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.key_p256dh, auth: row.key_auth } },
        JSON.stringify(payload),
        { TTL: 60, urgency: "high" },
      );
      console.log("[test-push] Sent:", endpoint.slice(0, 60), "status:", result?.statusCode);
      return json({ ok: true, statusCode: result?.statusCode ?? null });
    } catch (err: unknown) {
      const e = err as { statusCode?: number; body?: string };
      const status = e?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
        console.log("[test-push] Removed expired:", endpoint.slice(0, 60));
        return json({ ok: false, expired: true });
      }
      const detail = String(e?.body || errorMessage(err)).slice(0, 300);
      console.error("[test-push] Send failed:", JSON.stringify({ status: status ?? null, detail }));
      return json({ ok: false, status: status ?? null, detail }, 502);
    }
  } catch (e: unknown) {
    console.error("[test-push] Unhandled:", e);
    return json({ error: errorMessage(e) }, 500);
  }
});
