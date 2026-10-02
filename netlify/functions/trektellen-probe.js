// Reachability probe for trektellen.nl from Netlify's egress.
//
// Why it exists: we want to know whether Netlify Functions can fetch the
// Trektellen site totals page (Cloudflare-fronted) without being challenged.
// The cf-ray / cf-mitigated / server headers and the body markers tell us
// whether we got the real table or a Cloudflare interstitial.
//
// Guarded by x-relay-secret so the probe can't be used as an open proxy.
//
// No retries and no caching: a retry would muddy the signal, and a cached
// answer is worthless for a reachability question.

export const handler = async function (event) {
  const json = (obj, statusCode = 200) => ({
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  });

  // Header names may arrive in any case; match case-insensitively.
  const headers = (event && event.headers) || {};
  const headerKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === "x-relay-secret",
  );
  const provided = headerKey ? headers[headerKey] : undefined;
  const secret = process.env.TREKTELLEN_PROBE_SECRET;
  if (!secret || provided !== secret) {
    return json({ ok: false, reason: "unauthorized" }, 401);
  }

  const url = "https://trektellen.nl/site/totals/1480/2026";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const started = Date.now();

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "EstBirds/1.0 (+https://estbirds.netlify.app)",
        Accept: "text/html",
      },
      signal: controller.signal,
    });
    // Read as text: a Cloudflare challenge is HTML too, so the markers below
    // are what distinguish the real totals table from an interstitial.
    const body = await res.text();
    return json({
      status: res.status,
      ok: res.ok,
      body_len: body.length,
      cf_ray: res.headers.get("cf-ray"),
      cf_mitigated: res.headers.get("cf-mitigated"),
      server: res.headers.get("server"),
      has_table: body.includes("Presence"),
      has_brant: body.includes("Brant"),
      sample: body.slice(0, 300),
      region: process.env.AWS_REGION ?? null,
      took_ms: Date.now() - started,
    });
  } catch (e) {
    const aborted = Boolean(e && e.name === "AbortError");
    return json({
      status: null,
      ok: false,
      error: aborted
        ? "AbortError: timeout after 10000ms"
        : `${(e && e.name) || "Error"}: ${(e && e.message) || String(e)}`,
      aborted,
      region: process.env.AWS_REGION ?? null,
      took_ms: Date.now() - started,
    });
  } finally {
    clearTimeout(timer);
  }
};
