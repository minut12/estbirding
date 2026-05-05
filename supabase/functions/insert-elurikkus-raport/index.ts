// supabase/functions/insert-elurikkus-raport/index.ts
//
// Inserts a new row into elurikkus_raport. Auth: X-Webhook-Secret header.
// Called by the n8n vaatluste-koordinaator-elurikkus workflow.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-webhook-secret, content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InsertPayload {
  period_start: string;
  period_end: string;
  intro_et?: string | null;
  estonia_entries: unknown[];
  generation_meta?: Record<string, unknown> | null;
  kevadranne_narrative_et?: string | null;
  kevadranne_arrivals?: unknown[];
}

// ─────────────────────────────────────────────────────────────────────────
// RESIDENT_EXCLUSIONS — species the migrant heuristic in the n8n Code node
// misclassifies as spring arrivals. Filtered out at write time so the DB
// row's kevadranne_arrivals never contains them. Categories:
//   - Year-round residents
//   - Winter visitors (depart in spring, do not arrive)
// To override per-species without code change, edit the n8n Code node.
// ─────────────────────────────────────────────────────────────────────────
const RESIDENT_EXCLUSIONS: ReadonlySet<string> = new Set([
  // Year-round residents
  "Rabapistrik",          // Falco peregrinus
  "Kassikakk",            // Bubo bubo
  "Kaelus-turteltuvi",    // Streptopelia decaocto
  "Laanerähn",            // Picoides tridactylus
  "Kõrvukräts",           // Asio otus
  "Mänsak",               // Nucifraga caryocatactes
  "Pasknäär",             // Garrulus glandarius
  "Habekakk",             // Strix nebulosa
  "Värbkakk",             // Glaucidium passerinum
  "Kodukakk",             // Strix aluco
  "Händkakk",             // Strix uralensis
  "Laanenäär",            // Perisoreus infaustus
  "Musträhn",             // Dryocopus martius

  // Winter visitors (depart, not arrive, in spring)
  "Kirjuhahk",            // Polysticta stelleri
  "Hangelind",            // Plectrophenax nivalis
  "Mägi-kanepilind",      // Linaria flavirostris

  // Batch 2 — additional residents (often unreported in winter so heuristic misfires)
  "Nurmkana",             // Perdix perdix
  "Merikajakas",          // Larus marinus
  "Valgeselg-kirjurähn",  // Dendrocopos leucotos
  "Kanakull",             // Accipiter gentilis
  "Tamme-kirjurähn",      // Dendrocoptes medius
  "Kodutuvi",             // Columba livia
  "Hahk",                 // Somateria mollissima
  "Tutt-tihane",          // Lophophanes cristatus
  "Kuuse-käbilind",       // Loxia curvirostra (irruptive, not seasonal migrant)
  "Künnivares",           // Corvus frugilegus (partial migrant, bulk overwinter in EE)

  // Batch 2 — additional winter visitors / passage species
  "Hallõgija",            // Lanius excubitor (mainly winter visitor in EE)
  "Mustvaeras",           // Melanitta nigra (passage migrant; observations ≠ "arrivals")
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("VAATLUSTE_WEBHOOK_SECRET");
  if (!expectedSecret) {
    return json({ error: "Server misconfigured: VAATLUSTE_WEBHOOK_SECRET unset" }, 500);
  }
  const providedSecret = req.headers.get("x-webhook-secret") || "";
  if (providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: InsertPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!payload.period_start || !payload.period_end || !Array.isArray(payload.estonia_entries)) {
    return json(
      { error: "Missing required fields: period_start, period_end, estonia_entries" },
      400,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Filter out species that are residents/winter visitors and shouldn't
  // appear in spring arrivals. n8n Code node misclassifies them; we clean
  // here so the persisted row reflects reality.
  const rawArrivals = Array.isArray(payload.kevadranne_arrivals)
    ? payload.kevadranne_arrivals
    : [];
  const filteredArrivals = rawArrivals.filter((entry: unknown) => {
    if (!entry || typeof entry !== "object") return true; // keep malformed (defensive)
    const name = (entry as { species_et?: unknown }).species_et;
    if (typeof name !== "string" || !name) return true;   // keep if no name (defensive)
    return !RESIDENT_EXCLUSIONS.has(name);
  });
  const residentsFiltered = rawArrivals.length - filteredArrivals.length;

  const { data, error } = await supabase
    .from("elurikkus_raport")
    .insert({
      period_start: payload.period_start,
      period_end: payload.period_end,
      intro_et: payload.intro_et ?? null,
      estonia_entries: payload.estonia_entries,
      generation_meta: payload.generation_meta ?? {},
      kevadranne_narrative_et: payload.kevadranne_narrative_et ?? null,
      kevadranne_arrivals: filteredArrivals,
    })
    .select("id, generated_at")
    .single();

  if (error) {
    console.error("insert failed:", error);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, id: data.id, generated_at: data.generated_at, residents_filtered: residentsFiltered }, 200);
});
