// Native Web Push (RFC 8030 + RFC 8291 aes128gcm + RFC 8292 VAPID).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- base64url helpers ----------
function b64uToBytes(b64u: string): Uint8Array {
  const s = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToB64u(s: string): string { return bytesToB64u(new TextEncoder().encode(s)); }
function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

// ---------- VAPID JWT (ES256) ----------
async function importVapidPrivateKey(privKeyStr: string, pubB64u: string): Promise<CryptoKey> {
  const trimmed = privKeyStr.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    const b64 = trimmed.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  }
  const d = b64uToBytes(trimmed);
  if (d.length !== 32) throw new Error(`bad VAPID private key length: ${d.length}`);
  const pub = b64uToBytes(pubB64u);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error(`bad VAPID public key length: ${pub.length}`);
  const jwk: JsonWebKey = {
    kty: "EC", crv: "P-256",
    d: bytesToB64u(d),
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    ext: true,
  };
  return await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function makeVapidJwt(audience: string, subject: string, privKey: CryptoKey): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject };
  const signingInput = `${strToB64u(JSON.stringify(header))}.${strToB64u(JSON.stringify(payload))}`;
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privKey, new TextEncoder().encode(signingInput),
  ));
  return `${signingInput}.${bytesToB64u(sig)}`;
}

// ---------- aes128gcm payload encryption (RFC 8291) ----------
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8,
  ));
}

async function encryptPayload(payload: Uint8Array, recipientPubB64u: string, recipientAuthB64u: string) {
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const recipPub = await crypto.subtle.importKey(
    "raw", b64uToBytes(recipientPubB64u),
    { name: "ECDH", namedCurve: "P-256" }, true, [],
  );
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: recipPub }, local.privateKey, 256));
  const auth = b64uToBytes(recipientAuthB64u);
  const recipPubRaw = b64uToBytes(recipientPubB64u);
  const keyInfo = concat(new TextEncoder().encode("WebPush: info\0"), recipPubRaw, localPubRaw);
  const ikm = await hkdf(auth, ecdh, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce }, aesKey, concat(payload, new Uint8Array([0x02])),
  ));
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  const idlen = new Uint8Array([localPubRaw.length]);
  return concat(salt, rs, idlen, localPubRaw, ciphertext);
}

async function sendOne(
  endpoint: string, p256dh: string, authKey: string, payload: string,
  vapidPrivKey: CryptoKey, vapidPubB64u: string, vapidSubject: string,
) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await makeVapidJwt(audience, vapidSubject, vapidPrivKey);
  const body = await encryptPayload(new TextEncoder().encode(payload), p256dh, authKey);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "3600",
      "Authorization": `vapid t=${jwt}, k=${vapidPubB64u}`,
    },
    body,
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { species } = await req.json();
    if (!Array.isArray(species) || species.length === 0) {
      return new Response(JSON.stringify({ error: "species array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@estbirding.ee";
    if (!vapidPublic || !vapidPrivate) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let vapidPrivKey: CryptoKey;
    try {
      vapidPrivKey = await importVapidPrivateKey(vapidPrivate, vapidPublic);
    } catch (e: any) {
      return new Response(JSON.stringify({
        error: "VAPID key import failed",
        detail: e?.message || String(e),
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subscriptions, error } = await supabase.rpc(
      "get_subscriptions_for_species", { species_list: species },
    );
    if (error) throw error;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, expired: 0, errors: 0, note: "no matching subscriptions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[push] Found", subscriptions.length, "subscriptions");

    let sent = 0, expired = 0, errors = 0;
    const errorDetails: any[] = [];

    for (const sub of subscriptions) {
      const matchingSpecies = species.filter((s: string) => (sub.subscribed_species || []).includes(s));
      let dead = false;
      for (const sp of matchingSpecies) {
        if (dead) break;
        try {
          const { status, text } = await sendOne(
            sub.endpoint, sub.key_p256dh, sub.key_auth,
            JSON.stringify({ species: sp }),
            vapidPrivKey, vapidPublic, vapidSubject,
          );
          if (status >= 200 && status < 300) {
            sent++;
            console.log("[push] Sent:", sp, "→", sub.endpoint.slice(0, 60), "status:", status);
          } else if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            expired++; dead = true;
          } else {
            errors++;
            const detail = { species: sp, status, body: text.slice(0, 300) };
            errorDetails.push(detail);
            console.error("[push] Send failed:", JSON.stringify(detail));
          }
        } catch (err: any) {
          errors++;
          const detail = {
            species: sp,
            error: err?.message || String(err),
            name: err?.name,
            stack: (err?.stack || "").split("\n").slice(0, 5).join(" | "),
          };
          errorDetails.push(detail);
          console.error("[push] Exception:", JSON.stringify(detail));
        }
      }
    }

    const result = { sent, expired, errors, errorDetails };
    console.log("[push] Done:", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[push] Unhandled:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
