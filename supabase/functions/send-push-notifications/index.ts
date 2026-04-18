import webpush from "https://esm.sh/web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { species } = await req.json();
    if (!Array.isArray(species) || species.length === 0) {
      return new Response(
        JSON.stringify({ error: "species array required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- VAPID setup ---
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT") || "mailto:admin@estbirding.ee";

    if (!vapidPublic || !vapidPrivate) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    // --- Supabase client ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- Find matching subscriptions ---
    const { data: subscriptions, error } = await supabase.rpc(
      "get_subscriptions_for_species",
      { species_list: species },
    );

    if (error) {
      console.error("[push] RPC error:", error);
      throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          sent: 0,
          expired: 0,
          errors: 0,
          note: "no matching subscriptions",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      "[push] Found",
      subscriptions.length,
      "subscriptions for",
      species.length,
      "species",
    );

    // --- Send notifications ---
    let sent = 0;
    let expired = 0;
    let errors = 0;

    for (const sub of subscriptions) {
      const matchingSpecies = species.filter((s: string) =>
        (sub.subscribed_species || []).includes(s)
      );

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.key_p256dh,
          auth: sub.key_auth,
        },
      };

      for (const sp of matchingSpecies) {
        try {
          await webpush.sendNotification(
            pushSubscription,
            JSON.stringify({ species: sp }),
            { TTL: 3600 },
          );
          sent++;
          console.log("[push] Sent:", sp, "→", sub.endpoint.slice(0, 60));
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log(
              "[push] Expired endpoint, deleting:",
              sub.endpoint.slice(0, 60),
            );
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
            expired++;
            break; // dead endpoint — stop trying more species
          } else {
            console.error(
              "[push] Send failed:",
              sp,
              sub.endpoint.slice(0, 60),
              err.message || err,
            );
            errors++;
          }
        }
      }
    }

    const result = { sent, expired, errors };
    console.log("[push] Done:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[push] Unhandled error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
