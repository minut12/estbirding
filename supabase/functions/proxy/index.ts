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
  "fbcdn.net",
  "facebook.com",
  "external-preview.redd.it",
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

function inferContentTypeFromPath(pathname: string): string {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}

function sampleFromBytes(bytes: Uint8Array, maxChars = 300): string {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return decoder.decode(bytes.slice(0, maxChars)).trim();
  } catch {
    return "";
  }
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
    const isFacebookCdn = /(^|\.)fbcdn\.net$|(^|\.)facebook\.com$|(^|\.)scontent\./i.test(target.hostname);
    upstream = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,et;q=0.8",
        ...(isFacebookCdn ? { "Referer": "https://www.facebook.com/", "Origin": "https://www.facebook.com" } : {}),
      },
    });
  } catch (e) {
    return json(502, { error: "upstream_fetch_failed", message: String(e) });
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  const rawContentType = (upstream.headers.get("content-type") || "").trim();
  const contentType = rawContentType || inferContentTypeFromPath(target.pathname);
  const sample = sampleFromBytes(bytes, 300);
  const sampleLower = sample.slice(0, 40).toLowerCase();

  if (!upstream.ok) {
    return json(upstream.status, {
      error: "upstream_non_ok",
      status: upstream.status,
      targetUrl: target.toString(),
      snippet: sample.slice(0, 200),
    });
  }

  const isHtmlByType = contentType.toLowerCase().startsWith("text/html");
  const isHtmlByBody = sampleLower.startsWith("<!doctype html") || sampleLower.startsWith("<html");
  if (isHtmlByType || isHtmlByBody) {
    console.log("[proxy] upstream_not_image", {
      status: upstream.status,
      contentType,
      sample: sample.slice(0, 300),
      targetUrl: target.toString(),
    });
    return json(502, {
      error: "upstream_not_image",
      status: upstream.status,
      contentType,
      sample: sample.slice(0, 300),
    });
  }

  return new Response(bytes, {
    status: upstream.status,
    headers: { ...corsHeaders, "content-type": contentType, "Cache-Control": "public, max-age=86400" },
  });
});
