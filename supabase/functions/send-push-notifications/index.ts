// Web Push via npm:web-push (battle-tested, handles aes128gcm + VAPID).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expectedSecret = Deno.env.get('VAATLUSTE_WEBHOOK_SECRET');
  if (req.headers.get('x-webhook-secret') !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const {
      species,
      notification_title,
      notification_body,
      notification_url,
      notification_tag,
    } = await req.json();
    if (!Array.isArray(species) || species.length === 0) {
      return new Response(JSON.stringify({ error: "species array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@estbirding.ee";
    if (!vapidPublic || !vapidPrivate) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    } catch (e) {
      return new Response(JSON.stringify({
        error: "VAPID setup failed",
        detail: errorMessage(e),
        vapidPublicLen: vapidPublic.length,
        vapidPrivateLen: vapidPrivate.length,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subscriptions, error } = await supabase.rpc(
      "get_subscriptions_for_species",
      { species_list: species },
    );
    if (error) throw error;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, expired: 0, errors: 0, note: "no matching subscriptions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[push] Found", subscriptions.length, "subscriptions");

    let sent = 0;
    let expired = 0;
    let errors = 0;
    const errorDetails: Array<Record<string, string | number | null>> = [];

    for (const sub of subscriptions) {
      const matchingSpecies = species.filter((s: string) =>
        (sub.subscribed_species || []).includes(s),
      );
      let dead = false;
      for (const sp of matchingSpecies) {
        if (dead) break;
        try {
          const pushSub = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.key_p256dh, auth: sub.key_auth },
          };
          const pushPayload: Record<string, string> = { species: sp };
          if (notification_title) pushPayload.title = notification_title;
          if (notification_body) pushPayload.body = notification_body;
          if (notification_url) pushPayload.url = notification_url;
          if (notification_tag) pushPayload.tag = notification_tag;
          const result = await webpush.sendNotification(
            pushSub,
            JSON.stringify(pushPayload),
            { TTL: 86400, urgency: "high" },
          );
          sent++;
          console.log(
            "[push] Sent:",
            sp,
            "→",
            sub.endpoint.slice(0, 60),
            "status:",
            result?.statusCode,
          );
        } catch (err: unknown) {
          const e = err as { statusCode?: number; body?: string; message?: string };
          const status = e?.statusCode;
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            expired++;
            dead = true;
            console.log("[push] Removed expired:", sub.endpoint.slice(0, 60));
          } else {
            errors++;
            const detail = {
              species: sp,
              status: status ?? null,
              body: String(e?.body || "").slice(0, 300),
              error: errorMessage(err),
            };
            errorDetails.push(detail);
            console.error("[push] Send failed:", JSON.stringify(detail));
          }
        }
      }
    }

    const result = { sent, expired, errors, errorDetails };
    console.log("[push] Done:", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("[push] Unhandled:", e);
    return new Response(JSON.stringify({ error: errorMessage(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
