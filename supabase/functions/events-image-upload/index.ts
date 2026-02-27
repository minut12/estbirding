import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "event-images";

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  Vary: "Origin",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
});

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}

function decodeBase64(base64: string): Uint8Array {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function safeName(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9._-]/g, "-");
  return cleaned || "event-image.jpg";
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" }, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "upload").trim().toLowerCase();

    const expectedKey = String(Deno.env.get("EVENTS_ADMIN_KEY") ?? "").trim();
    const providedKey = String(body?.adminKey ?? "").trim();
    if (!expectedKey || !providedKey || providedKey !== expectedKey) {
      return json(401, { ok: false, error: "invalid admin key" }, headers);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { ok: false, error: "missing service env" }, headers);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (action === "delete") {
      const path = String(body?.path ?? "").trim();
      if (!path) return json(400, { ok: false, error: "path is required" }, headers);
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) return json(500, { ok: false, error: error.message }, headers);
      return json(200, { ok: true }, headers);
    }

    const base64 = String(body?.base64 ?? "").trim();
    if (!base64) return json(400, { ok: false, error: "base64 is required" }, headers);

    const mimeType = String(body?.mimeType ?? "image/jpeg").trim() || "image/jpeg";
    const fileName = safeName(body?.fileName);
    const ext = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
    const path = `events/${crypto.randomUUID()}.${ext}`;

    const fileBytes = decodeBase64(base64);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, fileBytes, {
      contentType: mimeType,
      upsert: false,
    });

    if (uploadError) return json(500, { ok: false, error: uploadError.message }, headers);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return json(200, { ok: true, path, publicUrl: data.publicUrl }, headers);
  } catch (error) {
    return json(500, { ok: false, error: String(error) }, headers);
  }
});
