// Temporary debug helper: calls get-species-year-first using server-side secret.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-species-year-first`;
  const secret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") ?? "";
  const body = await req.text();
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
    body: body || JSON.stringify({ species: ["Punarind"], year: 2026, force: true }),
  });
  const text = await res.text();
  return new Response(JSON.stringify({
    status: res.status,
    elapsed_ms: Date.now() - start,
    body: text,
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
