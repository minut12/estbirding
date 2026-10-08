// redeploy-marker: P104e 2026-10-08
// supabase/functions/run-ebird-job/index.ts
//
// P104e: manual "run now" for the Netlify eBird jobs, so nobody has to handle EBIRD_RELAY_SECRET.
// Call from SQL (m7_call_ef adds x-webhook-secret from vault):
//   select public.m7_call_ef('run-ebird-job', '{"job":"europe","dry":true}');
//   select public.m7_call_ef('run-ebird-job', '{"job":"europe"}');
//   select public.m7_call_ef('run-ebird-job', '{"job":"ee"}');
// The response body is the relay job's JSON; read it from net._http_response by the returned id.
// Auth: x-webhook-secret = VAATLUSTE_WEBHOOK_SECRET. Forwards to EBIRD_RELAY_URL ?job=<ee|europe>[&dry=1]
// with x-relay-secret = EBIRD_RELAY_SECRET (both already set as Supabase secrets).

const RELAY_URL = Deno.env.get("EBIRD_RELAY_URL") || "https://estbirds.netlify.app/api/ebird-relay";
const RELAY_TIMEOUT_MS = 28000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") || "";
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return json(401, { error: "unauthorized" });

  const relaySecret = Deno.env.get("EBIRD_RELAY_SECRET") || "";
  if (!relaySecret) return json(500, { error: "missing_env:EBIRD_RELAY_SECRET" });

  let body: { job?: string; dry?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const job = body?.job === "ee" || body?.job === "europe" ? body.job : "";
  if (!job) return json(400, { error: "job must be 'ee' or 'europe'" });
  const dry = job === "europe" && body?.dry === true;

  const url = RELAY_URL + "?job=" + job + (dry ? "&dry=1" : "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RELAY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-relay-secret": relaySecret, Accept: "application/json" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    console.log("[run-ebird-job]", job, dry ? "dry" : "live", res.status, text.slice(0, 1500));
    return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[run-ebird-job] relay error", job, msg);
    return json(504, { error: "relay_error", detail: msg });
  } finally {
    clearTimeout(timer);
  }
});
