const ALLOWED_ORIGINS = new Set([
  "https://estbirding.ee",
  "https://www.estbirding.ee",
]);

function pickAllowedOrigin(origin: string | null): string {
  if (!origin) return "*";
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (origin.startsWith("http://localhost")) return origin;
  return "*";
}

function corsHeaders(origin: string | null): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": pickAllowedOrigin(origin),
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  });
}

function jsonResponse(status: number, payload: Record<string, unknown>, origin: string | null): Response {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function intInRange(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonResponse(400, { error: "invalid method" }, origin);
  }

  const token = Deno.env.get("EBIRD_API_TOKEN2") || Deno.env.get("EBIRD_API_TOKEN");
  if (!token) {
    console.error("[ebird_recent] missing secret EBIRD_API_TOKEN");
    return jsonResponse(500, { error: "EBIRD_API_TOKEN secret not set" }, origin);
  }

  const reqUrl = new URL(req.url);
  const regionCode = (reqUrl.searchParams.get("regionCode") || "").trim();
  if (!regionCode) {
    return jsonResponse(400, { error: "regionCode is required" }, origin);
  }
  const back = intInRange(reqUrl.searchParams.get("back"), 7, 1, 30);
  const maxResults = intInRange(reqUrl.searchParams.get("maxResults"), 1000, 1, 1000);
  const speciesCode = (reqUrl.searchParams.get("speciesCode") || "").trim();
  const detail = (reqUrl.searchParams.get("detail") || "simple").trim();

  const upstreamUrl = speciesCode
    ? `https://api.ebird.org/v2/data/obs/${encodeURIComponent(regionCode)}/recent/${encodeURIComponent(speciesCode)}?back=${back}&maxResults=${maxResults}&detail=${detail}`
    : `https://api.ebird.org/v2/data/obs/${encodeURIComponent(regionCode)}/recent?back=${back}&maxResults=${maxResults}&detail=${detail}`;
  console.log(`[ebird_recent] request region=${regionCode} back=${back} maxResults=${maxResults} species=${speciesCode ? "yes" : "no"}`);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        "X-eBirdApiToken": token,
        "Accept": "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    console.warn(`[ebird_recent] upstream fetch failed region=${regionCode} message=${message}`);
    return jsonResponse(502, { error: "upstream failed", message }, origin);
  }

  const headers = corsHeaders(origin);
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  else headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
});
