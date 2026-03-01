import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const proxyBase = String(body?.proxyBase || "").trim() || null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({
        error: "Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
      });
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: sources, error: srcErr } = await supabase
      .from("news_sources")
      .select("id, name, slug, type, kind, feed_url, fetch_url, is_active, is_enabled")
      .eq("is_active", true)
      .eq("is_enabled", true);
    let workingSources = (sources || []) as any[];
    if (srcErr || workingSources.length === 0) {
      console.error("[news-refresh] news_sources query failed, using fallback", srcErr);
      const fallback = [
        { slug: "eoy", name: "EOÜ", type: "scrape", fetch_url: "https://www.eoy.ee/ET/uudised/" },
        { slug: "birding_poland", name: "Birding Poland", type: "rss", feed_url: "https://rss.app/feeds/oj8X6cpy0jWL7JNy.xml" },
      ];
      workingSources = fallback;
    }

    const targetSources = (workingSources || []).filter((s: any) => {
      const n = String(s?.name || "").toLowerCase();
      const slug = String(s?.slug || "").toLowerCase();
      const t = String(s?.type || s?.kind || "").toLowerCase();
      return (t === "scrape" && (n.includes("eoü") || n.includes("eoy") || slug.includes("eoy") || slug.includes("eou")))
        || (t === "rss" && (n.includes("birding poland") || slug.includes("birding")));
    });

    const pullRes = await fetch(`${supabaseUrl}/functions/v1/news-pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
      body: JSON.stringify({ force: true, proxyBase }),
    });

    const pullPayload = await pullRes.json().catch(() => ({}));
    if (!pullRes.ok) {
      return new Response(JSON.stringify({ error: pullPayload?.error || `news-pull HTTP ${pullRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
      });
    }

    const allResults = Array.isArray(pullPayload?.results) ? pullPayload.results : [];
    const allowed = new Set(targetSources.map((s: any) => String(s.slug || "").toLowerCase()));
    const sourceNameBySlug = new Map<string, string>(
      targetSources.map((s: any) => [String(s.slug || "").toLowerCase(), String(s.name || s.slug || "")]),
    );
    const filteredResults = allResults.filter((r: any) => allowed.has(String(r?.source || "").toLowerCase()));

    const sourcesSummary = filteredResults.map((r: any) => ({
      source: sourceNameBySlug.get(String(r?.source || "").toLowerCase()) || String(r?.source || ""),
      found: Number(r?.debug?.foundCount ?? r?.fetched ?? 0),
      upserted: Number(r?.debug?.upsertedCount ?? r?.inserted ?? 0),
      newestUrl: r?.debug?.newestUrl || null,
      error: r?.error || null,
    }));

    const foundCount = sourcesSummary.reduce((s: number, r: any) => s + Number(r.found || 0), 0);
    const upsertedCount = sourcesSummary.reduce((s: number, r: any) => s + Number(r.upserted || 0), 0);
    const newestUrl = sourcesSummary.find((s: any) => s?.newestUrl)?.newestUrl || null;

    return new Response(JSON.stringify({
      success: true,
      foundCount,
      upsertedCount,
      newestUrl,
      sources: sourcesSummary,
      results: filteredResults,
    }), {
      headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
    });
  }
});
