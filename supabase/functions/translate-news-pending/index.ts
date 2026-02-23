import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenAIConfig } from "../_shared/openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!getOpenAIConfig()) {
      return new Response(JSON.stringify({ error: "Translation not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Number.isFinite(body?.limit) ? Math.max(1, Math.min(50, Number(body.limit))) : 5;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: items, error } = await supabase
      .from("news_items")
      .select("id")
      .eq("archived", false)
      .neq("source_key", "eoy")
      .or("title_et.is.null,body_et.is.null")
      .in("translation_status", ["pending", "error"])
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ success: true, translated: 0, failed: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let translated = 0;
    let failed = 0;
    let skipped = 0;
    let failureStreak = 0;

    for (const item of items) {
      const res = await fetch(`${supabaseUrl}/functions/v1/translate-news-item`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
        },
        body: JSON.stringify({ id: item.id }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.skipped) skipped++;
        else translated++;
        failureStreak = 0;
      } else {
        failed++;
        failureStreak++;
      }

      const backoffMs = failureStreak > 0 ? Math.min(3000, 500 * failureStreak) : 200;
      await sleep(backoffMs);
    }

    return new Response(JSON.stringify({ success: true, translated, failed, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
