import { corsHeaders, handleOptions } from "../_shared/cors.ts";

// Add more domains here as needed.
const ALLOWED_DOMAINS = [
  "eoy.ee",
  "www.eoy.ee",
  "rss.app",
  "birdingpoland.pl",
  "www.birdingpoland.pl",
  "birdingpoland.com",
  "www.birdingpoland.com",
  "birdingpoland.org",
  "www.birdingpoland.org",
] as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  if (req.method !== "GET") {
    return json(405, { error: "method_not_allowed" });
  }

  const reqUrl = new URL(req.url);
  const rawUrl = (reqUrl.searchParams.get("url") || "").trim();
  if (!rawUrl) {
    return json(400, { error: "missing_url" });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return json(400, { error: "invalid_url" });
  }

  if (target.protocol !== "https:") {
    return json(400, { error: "only_https_allowed" });
  }

  if (!isAllowedHost(target.hostname)) {
    return json(403, { error: "domain_not_allowed", host: target.hostname });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), { method: "GET", redirect: "follow" });
  } catch (e) {
    return json(502, { error: "upstream_fetch_failed", message: String(e) });
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...corsHeaders, "content-type": contentType },
  });
});
