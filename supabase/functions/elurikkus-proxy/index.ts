const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "public, max-age=300",
};

const ALLOWED_PREFIXES = [
  "https://elurikkus.ee/biocache-service/",
  "https://elurikkus.ee/app/occurrences/",
  "https://elurikkus.ee/api/occurrences/",
  "https://elurikkus.ee/api/occurrences",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);
    const targetUrl = reqUrl.searchParams.get("url");

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate URL against allowlist
    const isAllowed = ALLOWED_PREFIXES.some((prefix) => targetUrl.startsWith(prefix));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "URL not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Accept": "text/html, application/json, */*",
        "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)",
      },
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") || "text/html",
      },
    });
  } catch (error: unknown) {
    console.error("Proxy error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
