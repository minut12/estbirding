const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feed_url } = await req.json();
    if (!feed_url) {
      return new Response(JSON.stringify({ error: "Missing feed_url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(feed_url, {
      headers: { "User-Agent": "EstBirding/1.0" },
    });
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `HTTP ${res.status}`, items: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const text = await res.text();
    const items = parseRssPreview(text).slice(0, 3);

    return new Response(
      JSON.stringify({ items }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, items: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseRssPreview(xml: string): Array<{ title: string; pubDate: string }> {
  const items: Array<{ title: string; pubDate: string }> = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || match[2] || "";
    const get = (tag: string): string => {
      const r = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const m = block.match(r);
      return (m?.[1] || m?.[2] || "").trim();
    };
    items.push({
      title: get("title"),
      pubDate: get("pubDate") || get("published") || get("updated"),
    });
  }

  return items;
}
