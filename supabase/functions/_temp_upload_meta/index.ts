import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: dl, error: e1 } = await sb.storage.from("bird-avatars").download("meta/species_meta_v1.json");
  if (e1) return new Response(JSON.stringify({ error: e1.message }), { status: 500 });
  const j = JSON.parse(await dl.text());
  const upd: Record<string, string> = { "Väikealk": "doveki", "Mustpugu-rästas": "datthr1", "Väikehuik": "litcra1" };
  for (const [k, v] of Object.entries(upd)) {
    if (!j.items[k]) return new Response(JSON.stringify({ error: "missing " + k }), { status: 500 });
    j.items[k].ebirdCode = v;
  }
  j.updatedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(j, null, 2)], { type: "application/json" });
  const { error: e2 } = await sb.storage.from("bird-avatars").upload("meta/species_meta_v1.json", blob, {
    contentType: "application/json", cacheControl: "0", upsert: true,
  });
  if (e2) return new Response(JSON.stringify({ error: e2.message }), { status: 500 });
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(upd)) out[k] = j.items[k];
  return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
});
