import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get enabled RSS sources with feed_url set
    const { data: sources, error: srcErr } = await supabase
      .from("news_sources")
      .select("*")
      .eq("is_active", true)
      .eq("is_enabled", true)
      .not("feed_url", "is", null);

    if (srcErr) throw srcErr;
    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No enabled sources with feed_url", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ source: string; fetched: number; inserted: number; skipped: boolean; error?: string }> = [];

    for (const source of sources) {
      // Check cooldown: skip if last item fetched within COOLDOWN_MS
      if (!force) {
        const { data: recent } = await supabase
          .from("news_items")
          .select("fetched_at")
          .eq("source_slug", source.slug)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .single();

        if (recent?.fetched_at) {
          const elapsed = Date.now() - new Date(recent.fetched_at).getTime();
          if (elapsed < COOLDOWN_MS) {
            results.push({ source: source.slug, fetched: 0, inserted: 0, skipped: true });
            continue;
          }
        }
      }

      try {
        const feedRes = await fetch(source.feed_url!, {
          headers: { "User-Agent": "EstBirding/1.0" },
        });
        if (!feedRes.ok) {
          results.push({ source: source.slug, fetched: 0, inserted: 0, skipped: false, error: `HTTP ${feedRes.status}` });
          continue;
        }

        const text = await feedRes.text();
        const items = parseRss(text).slice(0, 10);

        let inserted = 0;
        for (const item of items) {
          const guid = item.guid || `${source.slug}:${item.link}`;
          const externalId = item.guid || item.link;

          const row = {
            source_id: source.id,
            source_slug: source.slug,
            source_key: source.key || source.slug,
            external_id: externalId,
            title: item.title || "",
            summary: (item.description || "").slice(0, 500),
            content_html: item.contentEncoded || item.description || null,
            body: stripHtml(item.contentEncoded || item.description || ""),
            url: item.link || "",
            permalink_url: item.link || null,
            image_url: item.imageUrl || null,
            published_at: item.pubDate || new Date().toISOString(),
            language: "et",
            guid,
            fetched_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("news_items")
            .upsert(row, { onConflict: "guid" });

          if (!error) inserted++;
          else console.error(`Upsert error for ${guid}:`, error);
        }

        results.push({ source: source.slug, fetched: items.length, inserted, skipped: false });
      } catch (e) {
        results.push({ source: source.slug, fetched: 0, inserted: 0, skipped: false, error: e.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("news-pull error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ── RSS Parser ─────────────────────────────────── */
interface RssItem {
  title: string;
  link: string;
  description: string;
  contentEncoded: string;
  pubDate: string;
  guid: string;
  imageUrl: string | null;
}

function parseRss(xml: string): RssItem[] {
  // Use regex-based parsing since DOMParser isn't available in Deno edge
  const items: RssItem[] = [];

  // Try RSS 2.0 <item> or Atom <entry>
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || match[2] || "";
    const get = (tag: string): string => {
      const r = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const m = block.match(r);
      return (m?.[1] || m?.[2] || "").trim();
    };

    // Extract link (RSS vs Atom)
    let link = get("link");
    if (!link) {
      const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkMatch) link = linkMatch[1];
    }

    // Extract image from enclosure, media:content, or description img
    let imageUrl: string | null = null;
    const enclosure = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
    if (enclosure) imageUrl = enclosure[1];
    if (!imageUrl) {
      const media = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
      if (media) imageUrl = media[1];
    }
    if (!imageUrl) {
      const desc = get("description") || get("content:encoded") || "";
      const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) imageUrl = imgMatch[1];
    }

    items.push({
      title: get("title"),
      link,
      description: get("description"),
      contentEncoded: get("content:encoded") || get("content"),
      pubDate: get("pubDate") || get("published") || get("updated"),
      guid: get("guid") || get("id") || link,
      imageUrl,
    });
  }

  return items;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
}
