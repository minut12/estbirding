// Phase-0 probe, finally run from Netlify.
//
// Why it exists: the Supabase Edge Function `ebird_recent` gets HTTP 418 from
// api.ebird.org — reproducible on BOTH the old and new projects, with a token
// that returns 200 from a normal machine. eBird appears to block Supabase's
// egress. This probe answers whether Netlify's egress is treated differently.
//
// 200 => Netlify Scheduled Functions can act as the eBird relay (M7).
// 418/403 => Netlify is blocked too; another relay is needed.
//
// No retries and no caching: a retry would muddy the signal, and a cached
// answer is worthless for a reachability question.

export const handler = async function () {
  const json = (obj, statusCode = 200) => ({
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  });

  const token = (process.env.EBIRD_API_TOKEN || "").trim();
  if (!token) return json({ ok: false, reason: "no token" }, 500);

  const url =
    "https://api.ebird.org/v2/data/obs/EE/recent?back=1&maxResults=1";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const started = Date.now();

  try {
    const res = await fetch(url, {
      headers: { "X-eBirdApiToken": token, Accept: "application/json" },
      signal: controller.signal,
    });
    // Read as text: a blocked response is usually not JSON, and we want to see
    // whatever the body actually is rather than throw on a parse error.
    const raw = await res.text();
    return json({
      status: res.status,
      ok: res.ok,
      sample: raw.slice(0, 300),
      region: process.env.AWS_REGION || null,
      took_ms: Date.now() - started,
    });
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    return json({
      status: null,
      ok: false,
      sample: aborted ? "timeout after 8000ms" : String((e && e.message) || e),
      region: process.env.AWS_REGION || null,
      took_ms: Date.now() - started,
    });
  } finally {
    clearTimeout(timer);
  }
};
