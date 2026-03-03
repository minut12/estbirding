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
  "fbsbx.com",
  "external-preview.redd.it",
] as const;
const BROWSER_UA = "Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
const proxyCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...proxyCorsHeaders, "content-type": "application/json; charset=utf-8" },
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: proxyCorsHeaders });
  }

  const reqUrl = new URL(req.url);
  const isTranslateRoute = reqUrl.pathname.endsWith("/proxy/translate-et");

    if (isTranslateRoute) {
      if (req.method === "GET" && reqUrl.searchParams.get("ping") === "1") {
        return json(200, { ok: true, fn: "proxy/translate-et" });
      }

      if (req.method !== "POST") {
        return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
      }

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").trim();
    const targetLang = String(body?.targetLang || "et").trim() || "et";
    const sourceLang = String(body?.sourceLang || "").trim();

    if (!text) return json(400, { ok: false, error: "MISSING_TEXT" });
    if (text.length > 12_000) return json(413, { ok: false, error: "TEXT_TOO_LARGE" });

    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (!apiKey) return json(500, { ok: false, error: "OPENAI_API_KEY_MISSING" });

    const system = `You are a translation engine. Translate the user text to ${targetLang}. Return ONLY the translation, preserve paragraphs.`;
    const user = sourceLang
      ? `Source language: ${sourceLang}\n\nText:\n${text}`
      : `Text:\n${text}`;

    let upstream: Response;
    try {
      upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
    } catch (error) {
      return json(502, { ok: false, error: "OPENAI_ERROR", details: String(error).slice(0, 400) });
    }

    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      return json(502, { ok: false, error: "OPENAI_ERROR", status: upstream.status, details: details.slice(0, 400) });
    }

    const payload = await upstream.json().catch(() => ({}));
    const translatedText = String(payload?.choices?.[0]?.message?.content || "").trim();
    return json(200, { ok: true, translatedText });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(405, { error: "method_not_allowed" });
  }

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
    const isFacebookCdn = /(^|\.)fbcdn\.net$|(^|\.)facebook\.com$|(^|\.)fbsbx\.com$|(^|\.)scontent\./i.test(target.hostname);
    const fetchHeaders: Record<string, string> = {
      "User-Agent": BROWSER_UA,
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
    if (isFacebookCdn) {
      fetchHeaders["Referer"] = "https://www.facebook.com/";
      fetchHeaders["Origin"] = "https://www.facebook.com";
    }
    upstream = await fetch(target.toString(), {
      method: req.method,
      redirect: "follow",
      headers: fetchHeaders,
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
    headers: { ...proxyCorsHeaders, "content-type": contentType, "Cache-Control": "public, max-age=86400" },
  });
});

