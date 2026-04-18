import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const pub = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  return new Response(JSON.stringify({
    pub_len: pub.length,
    pub_preview: pub.slice(0, 20),
    priv_len: priv.length,
    priv_preview: priv.slice(0, 20),
    priv_has_pem: priv.includes("BEGIN"),
    priv_has_newline: priv.includes("\n"),
    priv_first_chars: Array.from(priv.slice(0, 8)).map(c => c.charCodeAt(0)),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
