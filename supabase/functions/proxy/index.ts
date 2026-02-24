const ALLOWED_HOSTS = new Set([
  "elurikkus.ee",
  "www.elurikkus.ee",
  "api.ebird.org",
]);

const ALLOWED_ORIGINS = new Set([
  "https://www.estbirding.ee",
  "https://estbirding.ee",
]);

function redactUrlForLog(value: string): string {
  try {
    const u = new URL(value);
    const hasQuery = Boolean(u.search);
    const hasHash = Boolean(u.hash);
    return `${u.origin}${u.pathname}${hasQuery ? "?<redacted>" : ""}${hasHash ? "#<redacted>" : ""}`;
  } catch {
    return "<invalid-url>";
  }
}

function resolveAllowedOrigin(origin: string | null): string {
  if (!origin) return "*";
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return "*";
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(origin),
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-eBirdApiToken",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function jsonError(status: number, message: string, origin: string | null): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonError(405, "Method not allowed. Use GET, HEAD, or OPTIONS.", origin);
  }

  const reqUrl = new URL(req.url);
  const rawTarget = (reqUrl.searchParams.get("url") || "").trim();
  if (!rawTarget) {
    return jsonError(400, "Missing required query parameter: url", origin);
  }

  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    return jsonError(400, "Invalid url query parameter", origin);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return jsonError(400, "Only http/https target URLs are allowed", origin);
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    console.warn(`[proxy] blocked host target=${redactUrlForLog(rawTarget)} host=${target.hostname}`);
    return jsonError(403, `Host not allowed: ${target.hostname}`, origin);
  }

  const upstreamHeaders = new Headers();
  const ebirdToken = req.headers.get("X-eBirdApiToken");
  if (ebirdToken && target.hostname === "api.ebird.org") {
    upstreamHeaders.set("X-eBirdApiToken", ebirdToken);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upstream error";
    console.warn(`[proxy] upstream fetch failed target=${redactUrlForLog(rawTarget)} message=${message}`);
    return jsonError(502, `Upstream request failed: ${message}`, origin);
  }

  const headers = new Headers(corsHeaders(origin));
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
});
