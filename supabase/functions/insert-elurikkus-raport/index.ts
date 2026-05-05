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

  // ─── Batch 3a — additional year-round residents ──────────────────────
  "Rasvatihane",          // Parus major
  "Sinitihane",           // Cyanistes caeruleus
  "Musttihane",           // Periparus ater
  "Põhjatihane",          // Poecile montanus
  "Salutihane",           // Poecile palustris
  "Sabatihane",           // Aegithalos caudatus
  "Musträstas",           // Turdus merula
  "Käblik",               // Troglodytes troglodytes
  "Talvike",              // Emberiza citrinella
  "Roherähn",             // Picus viridis
  "Hallpea-rähn",         // Picus canus
  "Suur-kirjurähn",       // Dendrocopos major
  "Väike-kirjurähn",      // Dryobates minor
  "Hakk",                 // Coloeus monedula
  "Hallvares",            // Corvus cornix
  "Ronk",                 // Corvus corax
  "Harakas",              // Pica pica
  "Puukoristaja",         // Sitta europaea
  "Porr",                 // Certhia familiaris
  "Suurnokk-vint",        // Coccothraustes coccothraustes
  "Leevike",              // Pyrrhula pyrrhula
  "Siisike",              // Spinus spinus
  "Rohevint",             // Chloris chloris
  "Põldvarblane",         // Passer montanus
  "Hõbekajakas",          // Larus argentatus
  "Merikotkas",           // Haliaeetus albicilla
  "Raudkull",             // Accipiter nisus
  "Hiireviu",             // Buteo buteo
  "Sookurg",              // Grus grus
  "Kühmnokk-luik",        // Cygnus olor
  "Metsis",               // Tetrao urogallus
  "Teder",                // Lyrurus tetrix
  "Laanepüü",             // Tetrastes bonasia
  "Metsvint",             // Fringilla coelebs (partial migrant; bulk overwinter/breed in EE)

  // ─── Batch 3b — early-spring migrants (typical arrival before 21. April) ──
  // Their first_obs_date in current period is wrong because elurikkus_observations
  // is a rolling 28-day cache that doesn't retain their true March/early-April dates.
  "Punarind",             // Erithacus rubecula (mid-March)
  "Laulurästas",          // Turdus philomelos (mid-March)
  "Põldlõoke",            // Alauda arvensis (early March)
  "Linavästrik",          // Motacilla alba (mid-March)
  "Väike-lehelind",       // Phylloscopus collybita (late March)
  "Salu-lehelind",        // Phylloscopus trochilus (early April)
  "Hänilane",             // Motacilla flava (mid-April)
  "Vainurästas",          // Turdus iliacus (late March)
  "Hallrästas",           // Turdus pilaris (late March)
  "Hoburästas",           // Turdus viscivorus (late March)
  "Kuldnokk",             // Sturnus vulgaris (late February)
  "Mustsaba-vigle",       // Limosa limosa (early April)
  "Punajalg-tilder",      // Tringa totanus (late March)
  "Tõmmukajakas",         // Larus fuscus (early March)
  "Suitsupääsuke",        // Hirundo rustica (mid-April)
  "Räästapääsuke",        // Delichon urbicum (mid-April)
  "Kaldapääsuke",         // Riparia riparia (mid-April)
  "Sookiur",              // Anthus pratensis (late March)
  "Naerukajakas",         // Chroicocephalus ridibundus (early March)
  "Kalakajakas",          // Larus canus (early March)
  "Põhjavint",            // Fringilla montifringilla (early April)
  "Piilpart",             // Anas crecca (early March)
  "Soopart",              // Anas acuta (early April)
  "Viupart",              // Mareca penelope (early April)
  "Rääkspart",            // Mareca strepera (early April)
  "Sõtkas",               // Bucephala clangula (early March)
  "Rohukoskel",           // Mergus serrator (late March)
  "Jääkoskel",            // Mergus merganser (early March)
  "Tuttvart",             // Aythya fuligula (early March)
  "Merivart",             // Aythya marila (early March)
  "Lauk",                 // Fulica atra (late March)
  "Kiivitaja",            // Vanellus vanellus (early March)
  "Tikutaja",             // Gallinago gallinago (late March)
  "Rüüt",                 // Pluvialis apricaria (late March)
  "Hallhaigur",           // Ardea cinerea (early April)
  "Hallhani",             // Anser anser (early March)
  "Sinikael-part",        // Anas platyrhynchos (resident-leaning partial migrant)
  "Laululuik",            // Cygnus cygnus (late March)
  "Tuuletallaja",         // Falco tinnunculus (late March)
  "Kalakotkas",           // Pandion haliaetus (early April)
  "Vaenukägu",            // Upupa epops (mid-April)
  "Sinirind",             // Luscinia svecica (mid-April)
  "Pruunselg-põõsalind",  // Curruca communis (mid-April)
  "Mets-lehelind",        // Phylloscopus sibilatrix (mid-April)
  "Mustpea-põõsalind",    // Sylvia atricapilla (mid-April)
  "Liivatüll",            // Charadrius hiaticula (early April)
  "Aul",                  // Clangula hyemalis (winter visitor / passage)
  "Kaelusrästas",         // Turdus torquatus (mid-April)
  "Sarvikpütt",           // Podiceps auritus (mid-April)
  "Hallpõsk-pütt",        // Podiceps grisegena (mid-April)
  "Tundra-rabahani",      // Anser serrirostris (early April)
  "Suur-laukhani",        // Anser albifrons (early April)
  "Valgepõsk-lagle",      // Branta leucopsis (early April)
  "Tuttpütt",             // Podiceps cristatus (early April)
  "Kormoran",             // Phalacrocorax carbo (early April)
  "Lammitilder",          // Tringa stagnatilis (mid-April)
  "Tõmmuvaeras",          // Melanitta fusca (early April)
  "Punapea-vart",         // Aythya ferina (early April)
  "Mägikiur",             // Anthus spinoletta (mid-April)
  "Hõbehaigur",           // Ardea alba (mid-April)
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

  return json({
    ok: true,
    id: data.id,
    generated_at: data.generated_at,
    residents_filtered: residentsFiltered,
  }, 200);
});
