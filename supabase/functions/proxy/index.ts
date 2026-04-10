import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function withCors(resp: Response): Response {
  const h = new Headers(resp.headers);
  for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v);
  return new Response(resp.body, { status: resp.status, headers: h });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
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
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);
  if (req.method === "GET" && reqUrl.pathname.endsWith("/proxy") && reqUrl.searchParams.get("ping") === "1") {
    return json({ ok: true, fn: "proxy" });
  }
  const isTranslateRoute = reqUrl.pathname.endsWith("/proxy/translate-et");

    if (isTranslateRoute) {
      if (req.method === "GET" && reqUrl.searchParams.get("ping") === "1") {
        return json({ ok: true, fn: "proxy/translate-et" });
      }

      if (req.method !== "POST") {
        return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
      }

      // Auth check — require valid JWT or service-role key
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return json({ ok: false, error: "UNAUTHORIZED" }, 401);
      }
      const token = authHeader.replace("Bearer ", "");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      if (token !== serviceRoleKey) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data?.user) {
          return json({ ok: false, error: "UNAUTHORIZED" }, 401);
        }
      }

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").trim();
    const targetLang = String(body?.targetLang || "et").trim() || "et";
    const sourceLang = String(body?.sourceLang || "").trim();

    if (!text) return json({ ok: false, error: "MISSING_TEXT" }, 400);
    if (text.length > 12_000) return json({ ok: false, error: "TEXT_TOO_LARGE" }, 413);

    const sysPrompt = `You are a translation engine specializing in bird-related content. Translate the user text to ${targetLang}. Use correct Estonian bird names (eesti linnunimed), never literally translate bird common names. Return ONLY the translation, preserve paragraphs, no commentary.`;
    const userMsg = sourceLang
      ? `Source language: ${sourceLang}\n\nText:\n${text}`
      : `Text:\n${text}`;

    // Prefer Claude
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
    if (anthropicKey) {
      try {
        const model = Deno.env.get("ANTHROPIC_TRANSLATION_MODEL") || "claude-haiku-4-5-20251001";
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            system: sysPrompt,
            messages: [{ role: "user", content: userMsg }],
          }),
        });
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const translatedText = String(claudeData?.content?.[0]?.text || "").trim();
          return json({ ok: true, translatedText }, 200);
        }
        console.warn("[proxy/translate-et] Claude returned", claudeRes.status, "falling back to OpenAI");
      } catch (error) {
        console.warn("[proxy/translate-et] Claude failed, falling back to OpenAI:", String(error).slice(0, 200));
      }
    }

    // OpenAI fallback
    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (!apiKey) return json({ ok: false, error: "API_KEY_MISSING" }, 500);

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
            { role: "system", content: sysPrompt },
            { role: "user", content: userMsg },
          ],
        }),
      });
    } catch (error) {
      return json({ ok: false, error: "OPENAI_ERROR", details: String(error).slice(0, 400) }, 502);
    }

    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      return json({ ok: false, error: "OPENAI_ERROR", status: upstream.status, details: details.slice(0, 400) }, 502);
    }

    const payload = await upstream.json().catch(() => ({}));
    const translatedText = String(payload?.choices?.[0]?.message?.content || "").trim();
    return json({ ok: true, translatedText }, 200);
  }

  if (req.method !== "GET") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const rawUrl = (reqUrl.searchParams.get("url") || "").trim();
  if (!rawUrl) {
    return json({ ok: false, error: "MISSING_URL" }, 400);
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return json({ ok: false, error: "INVALID_URL" }, 400);
  }

  if (target.protocol !== "https:") {
    return json({ ok: false, error: "ONLY_HTTPS_ALLOWED" }, 400);
  }

  if (!isAllowedHost(target.hostname)) {
    return json({ ok: false, error: "DOMAIN_NOT_ALLOWED", host: target.hostname }, 403);
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
    return json({ ok: false, error: "UPSTREAM_FETCH_FAILED", message: String(e) }, 502);
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  const rawContentType = (upstream.headers.get("content-type") || "").trim();
  const contentType = rawContentType || inferContentTypeFromPath(target.pathname);
  const sample = sampleFromBytes(bytes, 300);
  const sampleLower = sample.slice(0, 40).toLowerCase();

  if (!upstream.ok) {
    return json({
      ok: false,
      error: "upstream_non_ok",
      status: upstream.status,
      targetUrl: target.toString(),
      snippet: sample.slice(0, 200),
    }, upstream.status);
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
    return json({
      ok: false,
      error: "upstream_not_image",
      status: upstream.status,
      contentType,
      sample: sample.slice(0, 300),
    }, 502);
  }

  return withCors(new Response(bytes, {
    status: upstream.status,
    headers: { "content-type": contentType, "Cache-Control": "public, max-age=86400" },
  }));
});

