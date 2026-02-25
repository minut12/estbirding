const ALLOWED_EXACT_HOSTS = new Set([
  "elurikkus.ee",
  "api.ebird.org",
]);

const ALLOWED_ORIGINS = new Set([
  "https://estbirding.ee",
  "https://www.estbirding.ee",
]);

function isAllowedHost(hostname: string): boolean {
  const host = String(hostname || "").toLowerCase();
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  if (host.endsWith(".elurikkus.ee")) return true;
  return false;
}

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

function redactUrlForLog(input: string): string {
  try {
    const u = new URL(input);
    const queryHint = u.search ? "?<redacted>" : "";
    return `${u.origin}${u.pathname}${queryHint}`;
  } catch {
    return "<invalid-url>";
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonResponse(400, { error: "invalid method" }, origin);
  }

  const reqUrl = new URL(req.url);
  const rawTarget = (reqUrl.searchParams.get("url") || "").trim();
  if (!rawTarget) {
    return jsonResponse(400, { error: "missing url" }, origin);
  }

  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    return jsonResponse(400, { error: "invalid url" }, origin);
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return jsonResponse(400, { error: "invalid url" }, origin);
  }

  if (!isAllowedHost(target.hostname)) {
    console.warn(`[proxy] blocked host=${target.hostname} target=${redactUrlForLog(rawTarget)}`);
    return jsonResponse(403, { error: "host not allowed", host: target.hostname }, origin);
  }

  const upstreamHeaders = new Headers();
  const accept = req.headers.get("accept");
  if (accept) upstreamHeaders.set("Accept", accept);
  upstreamHeaders.set("User-Agent", "EstBirding-Proxy/1.0");

  const targetHost = target.hostname.toLowerCase();
  if (targetHost === "api.ebird.org") {
    const token = Deno.env.get("EBIRD_API_TOKEN");
    if (!token) {
      return jsonResponse(500, { error: "EBIRD_API_TOKEN secret not set" }, origin);
    }
    upstreamHeaders.set("X-eBirdApiToken", token);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    console.warn(`[proxy] upstream failed target=${redactUrlForLog(rawTarget)} message=${message}`);
    return jsonResponse(502, { error: "upstream failed", status: 0, message }, origin);
  }

  const finalUrl = upstream.url || target.toString();
  let finalHost = "";
  try {
    finalHost = new URL(finalUrl).hostname;
  } catch {
    finalHost = "";
  }
  if (!isAllowedHost(finalHost)) {
    console.warn(`[proxy] redirect blocked host=${finalHost} target=${redactUrlForLog(rawTarget)}`);
    return jsonResponse(403, { error: "host not allowed", host: finalHost || "unknown" }, origin);
  }

  const headers = corsHeaders(origin);
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
});
