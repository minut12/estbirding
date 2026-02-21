import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REGIONS = ["FI", "SE", "LV", "LT", "PL", "BY", "RU"];
const EBIRD_TOKEN = "9s72dc2jcjlq";
const MAX_RESULTS = 1000;
const BACK_DAYS = 30;
const CONCURRENCY = 5;

// Default eBird codes for Estonian species names
const DEFAULT_EBIRD_CODES: Record<string, string> = {
  "Aed-lepalind": "comred2", "Aed-põõsalind": "garwar1", "Aed-roolind": "blrwar1",
  "Aedporr": "shtre1", "Alk": "razorb", "Alverüdi": "shtsan",
  "Ameerika piilpart": "amewig", "Atlantise tormilind": "scoshe1", "Aul": "lotduc",
  "Baleaari tormilind": "balshe1", "Euroopa kaelustäks": "stonec4",
  "Habekakk": "grgowl", "Habeviires": "whiter2", "Hahk": "comeid",
  "Hakk": "eurjac", "Hall-kärbsenäpp": "spofly1", "Hallhaigur": "graher1",
  "Hallhani": "gragoo", "Hallkibu": "tersan", "Hallpea-rähn": "gyfwoo1",
  "Hallpõsk-pütt": "rengre", "Hallrästas": "feldes1", "Hallrüdi": "semsan",
  "Halltsiitsitaja": "corbun1", "Hallvares": "hoocro1", "Hallõgija": "norshr1",
  "Hangelind": "snobun", "Harakas": "eurmap1", "Haugaskotkas": "boneag2",
  "Hele-urvalind": "hoared1", "Heletilder": "comgre", "Herilaseviu": "euhbuz1",
  "Hiireviu": "combuz1", "Hoburästas": "misthr1", "Händkakk": "uraowl1",
  "Hänilane": "eaywag1", "Hõbehaigur": "greegr", "Hõbehaugas": "henhar1",
  "Hõbekajakas": "hergul", "Hüüp": "grebit1", "Ida-mustvaeras": "blksco2",
  "Jahipistrik": "gyrfal", "Jämejalg": "eutkne1", "Järvekaur": "arcloo",
  "Jääkajakas": "glagul", "Jääkaur": "comloo", "Jääkoskel": "goomer",
  "Jõgi-ritsiklind": "eurwar2", "Jõgitiir": "comter", "Jõgitilder": "comsan",
  "Jõgivästrik": "gyrwag", "Kadakatäks": "whinch1", "Kaelus-kärbsenäpp": "colfly1",
  "Kaelus-turteltuvi": "eucdov", "Kaeluskotkas": "eurgr1", "Kaelusrästas": "rinouz1",
  "Kaelustuvi": "cowpig1", "Kalakajakas": "mewgul", "Kalakotkas": "osprey",
  "Kalda-rädilind": "cetwar1", "Kaldapääsuke": "banswa", "Kaljukajakas": "bklkit",
  "Kaljukotkas": "goleag", "Kanada lagle": "cangoo", "Kanakull": "norgos1",
  "Kanepilind": "eurlin", "Karbuskajakas": "medgul1", "Karkjalg": "bkwsti",
  "Karmiinleevike": "comros", "Karvasjalg-kakk": "borowl", "Karvasjalg-viu": "rolhaw",
  "Kassikakk": "eueowl1", "Kiivitaja": "norlap", "Kiripugu-rüdi": "pecsan",
  "Kirjuhahk": "steeid", "Kivikakk": "litowl1", "Kivirullija": "rudtur",
  "Kivitäks": "norwhe", "Kodukakk": "tawowl1", "Kodutuvi": "rocpig",
  "Koduvarblane": "houspa", "Koldhaigur": "squher1", "Koldjalg-hõbekajakas": "casgul2",
  "Koldvint": "eurser1", "Kormoran": "grecor", "Krüüsel": "blkguj",
  "Kukkurtihane": "lontit3", "Kuld-lehelind": "palwar5", "Kuldhänilane": "citwag",
  "Kuldnokk": "eursta", "Kuldtsiitsitaja": "yebbun", "Kuninghahk": "kineid",
  "Kuuse-käbilind": "redcro", "Käblik": "winwre4", "Kägu": "comcuc",
  "Käharpelikan": "dalpel1", "Käosulane": "ictwar1", "Kääbuskormoran": "pygcor2",
  "Kääbuskotkas": "booeag1", "Kõnnuõgija": "isashr1", "Kõrbe-kivitäks": "deswhe1",
  "Kõrbe-põõsalind": "asdwar1", "Kõrkja-roolind": "sedwar1", "Kõrvukräts": "loeowl",
  "Kõvernokk-rüdi": "cursan", "Kühmnokk-luik": "mutswa", "Künnivares": "rook1",
  "Laanenäär": "sibjay1", "Laanepüü": "hazgro1", "Laanerähn": "tttwo1",
  "Laisaba-änn": "pomjae", "Lammitilder": "marsan", "Lapi tsiitsitaja": "laplon",
  "Lasuurtihane": "azutit2", "Lauk": "eurcoo", "Laululuik": "whoswa",
  "Laulurästas": "sonthr1", "Leeterüdi": "sander", "Leevike": "eurbul",
  "Liiv-kivitäks": "isawhe1", "Liivatüll": "rinplo", "Linavästrik": "whiwag",
  "Loorkakk": "webowl1", "Luitsnokk-iibis": "eurspo1", "Luitsnokk-part": "norsho",
  "Lumehani": "snogoo", "Lumekakk": "snoowl1", "Lääne-lehelind": "webwar1",
  "Lääne-pöialpoiss": "firecr1", "Lõopistrik": "eurhob", "Lõuna-hõbekajakas": "yelgul1",
  "Lühinokk-hani": "pifgoo", "Madukotkas": "shteag1", "Mandariinpart": "manduc",
  "Merikajakas": "gbbgul", "Merikotkas": "wtheag", "Merirüdi": "pursan",
  "Merisk": "euraoy", "Merivart": "gresca", "Mesilasenäpp": "eubeat1",
  "Mets-lehelind": "woowar", "Metsis": "wescap1", "Metskiur": "trepip1",
  "Metskurvits": "eurwoo", "Metstilder": "grered", "Metsvint": "comcha",
  "Mudanepp": "jacksn", "Mudatilder": "woosan", "Must-harksaba": "blakit1",
  "Must-kärbsenäpp": "piefly1", "Must-lepalind": "blared1", "Must-toonekurg": "blasto1",
  "Mustjalg-tüll": "kenplo1", "Mustkael-pütt": "eargre", "Mustkurk-raat": "bltacc1",
  "Mustlagle": "brant", "Mustlauk-õgija": "legshr2", "Mustpea-põõsalind": "blackc1",
  "Mustpea-tsiitsitaja": "blhbun1", "Mustpugu-rästas": "retthr1", "Musträhn": "blawoo1",
  "Musträstas": "eurblk1", "Mustsaba-vigle": "btlgod", "Musttihane": "coltit1",
  "Mustvaeras": "blksco1", "Mustvares": "carcro1", "Mustviires": "blkter",
  "Mägi-kanepilind": "twite1", "Mägikiur": "watpip1", "Männi-käbilind": "parcro2",
  "Männileevike": "pingro", "Männitalvike": "pinbun", "Mänsak": "eugori2",
  "Naaskelnokk": "pieav01", "Naerukajakas": "bkhgul", "Naerutiir": "gubter2",
  "Niidu-kaelustäks": "sibsto1", "Niidu-ritsiklind": "pagwar1", "Niidukiur": "ricpip1",
  "Nunn-kivitäks": "piewhe1", "Nurmkana": "grypar", "Nõgipart": "ambduc",
  "Nõlva-lehelind": "grewar3", "Nõmmekiur": "tawpip1", "Nõmmelõoke": "woolar1",
  "Ohakalind": "eurgol", "Ohhoota hõbekajakas": "slbgul", "Padu-roolind": "padwar1",
  "Pasknäär": "eurjay1", "Peegel-tormilind": "sooshe", "Pelikan": "grwpel1",
  "Peoleo": "comkin1", "Piilpart": "gnwtea", "Piiritaja": "comswi",
  "Pikksaba-änn": "lotjae", "Plütt": "brbsan", "Plüü": "bkbplo",
  "Polaarkajakas": "y00478", "Porr": "comqua1", "Prillvaeras": "sursco",
  "Pruunselg-põõsalind": "grewhi1", "Puna-harksaba": "redkit1", "Puna-veetallaja": "redpha1",
  "Punajalg-pistrik": "reffal1", "Punajalg-tilder": "comred1", "Punakael-lagle": "rebgoo1",
  "Punakurk-kaur": "retloo", "Punanokk-vart": "recpoc", "Punapea-vart": "compoc",
  "Punapea-õgija": "wooshr1", "Punarind": "eurrob1", "Punasaba-õgija": "rutshr2",
  "Punaselg-õgija": "rebshr1", "Purpurhaigur": "purher1", "Puukoristaja": "eurtre1",
  "Põhja-kirjurästas": "scathr2", "Põhja-lehelind": "arcwar1", "Põhja-tormipääsu": "lcspet",
  "Põhjatihane": "wiltit1", "Põhjatsiitsitaja": "rusbun", "Põhjavint": "brambl",
  "Põldlõoke": "skylar", "Põldtsiitsitaja": "ortbun1", "Põldvarblane": "eutspa",
  "Põldvutt": "comqua1", "Pöialpoiss": "goldcr1", "Rabapistrik": "perfal",
  "Rabapüü": "wilpta", "Raisakotkas": "cinvul1", "Randkajakas": "laugul",
  "Randkiur": "rocpip1", "Randtiir": "arcter", "Rasvatihane": "greti1",
  "Raudkull": "eurspa1", "Ristpart": "comshe", "Roherähn": "eugwoo2",
  "Rohevint": "eurgre1", "Rohukoskel": "rebmer", "Rohunepp": "gresni1",
  "Ronk": "norrav", "Roo-loorkull": "wemhar1", "Roo-ritsiklind": "marwar1",
  "Roohabekas": "beapar1", "Rooruik": "watrai1", "Roosa-kuldnokk": "rststa1",
  "Roosakajakas": "rosgul", "Roosatiir": "roster1", "Roostepääsuke": "rehmar1",
  "Roosterind-tüll": "dotplo", "Rootsiitsitaja": "reebun", "Rubiinööbik": "sibrub1",
  "Rukkirääk": "corncr1", "Ruugerüdi": "ruff", "Rägapart": "gargan",
  "Rästas-roolind": "grerwa1", "Räusktiir": "santer1", "Rääkspart": "gadwal",
  "Räästapääsuke": "commrt", "Rüüt": "eugplo", "Sabatihane": "lottit1",
  "Salu-lehelind": "grnwar1", "Salupäll": "hawfin", "Salutihane": "martit1",
  "Sarviklõoke": "shorel", "Sarvikpütt": "grcgre1", "Siberi lehelind": "radwar1",
  "Siberi raat": "sibacc", "Siidhaigur": "litegr", "Siidisaba": "bohwax",
  "Siisike": "eursis", "Sinikael-part": "mallar3", "Siniraag": "btuswi1",
  "Sinirind": "blethr1", "Sinisaba": "retblu1", "Sinitihane": "blutit1",
  "Soo-loorkull": "palhar", "Soo-roolind": "muswar1", "Sookiur": "meapip1",
  "Sookurg": "comcra", "Soopart": "shlduc", "Sooräts": "eurrob1",
  "Soorüdi": "dunlin", "Stepi-loorkull": "stehar1", "Stepikajakas": "stegul2",
  "Stepikiivitaja": "socplo1", "Stepikotkas": "steeag2", "Stepipistrik": "sakfal1",
  "Stepiviu": "lolbuz1", "Suitsupääsuke": "barswa", "Suula": "norgan",
  "Suur-kirjurähn": "grswoo1", "Suur-konnakotkas": "grseag1", "Suur-laukhani": "gwfgoo",
  "Suurkoovitaja": "eurcur", "Suurnokk-vint": "hawfin", "Suurrüdi": "redkno",
  "Suuränn": "gresku1", "Sõtkas": "goosnd", "Söödikänn": "parjae",
  "Tait": "commoo3", "Talvike": "yellow2", "Tamme-kirjurähn": "miswoo1",
  "Teder": "blagro1", "Tiigi-roolind": "eurwar1", "Tikutaja": "comsni",
  "Triip-ritsiklind": "lanwar", "Tuhk-lehelind": "humwar1", "Tumetilder": "spored",
  "Tundra-rabahani": "tunbeg1", "Tundrakaur": "yebloo", "Tundrakiur": "retpip",
  "Turteltuvi": "eutdov", "Tutkas": "smbewl", "Tutt-tihane": "cretit1",
  "Tutt-tiir": "santer1", "Tuttlõoke": "crelar1", "Tuttpütt": "grcgre1",
  "Tuttvart": "tufduc", "Tuuletallaja": "eurkes", "Täpikhuik": "spocra1",
  "Tõmmu-lehelind": "duswar", "Tõmmuiibis": "gloibi", "Tõmmukajakas": "lbbgul",
  "Tõmmuvaeras": "whwsco3", "Urvalind": "redpol1", "Vaaraohani": "egygoo",
  "Vaenukägu": "hoopoe", "Vainurästas": "redwin", "Valge-toonekurg": "whisto1",
  "Valgepõsk-lagle": "bargoo", "Valgeselg-kirjurähn": "whbwoo1",
  "Valgesilm-vart": "ferduc", "Valgetiib-viires": "whwter", "Veetallaja": "renpha",
  "Veisehaigur": "categr1", "Vesipapp": "whtdip1", "Vihitaja": "comgre",
  "Viupart": "eurwig", "Väike-kirjurähn": "leswoo1", "Väike-konnakotkas": "leseag1",
  "Väike-käosulane": "boowar1", "Väike-kärbsenäpp": "rebfly",
  "Väike-laukhani": "lwfgoo", "Väike-lehelind": "comchi1", "Väike-põõsalind": "leswhi4",
  "Väikealk": "razorb", "Väikehuik": "ltrcra1", "Väikehüüp": "litbit1",
  "Väikekajakas": "litgul", "Väikekoovitaja": "whimbr", "Väikekoskel": "smew",
  "Väikeluik": "tunswa", "Väikepistrik": "merlin", "Väikepütt": "litgre1",
  "Väikerüdi": "litsti", "Väiketiir": "litter1", "Väiketrapp": "litbus1",
  "Väiketsiitsitaja": "litbun", "Väiketüll": "ltrplo", "Välja-loorkull": "norhar1",
  "Välja-väikelõoke": "gstlar1", "Värbkakk": "eupowl1", "Värbrüdi": "temsti",
  "Väänkael": "eurrwry", "Võsa-ritsiklind": "cogwar1", "Võsaraat": "dunnoc1",
  "Vööt-käbilind": "whwcro", "Vööt-põõsalind": "barwar1", "Vööthani": "bahgoo",
  "Vöötkakk": "nohowl", "Vöötnokk-kajakas": "ribgul", "Vöötsaba-vigle": "batgod",
  "Õõnetuvi": "stodov1", "Ööbik": "thrnig1", "Ööhaigur": "bcnher", "Öösorr": "eurnig1",
};

// Full species list
const SPECIES = Object.keys(DEFAULT_EBIRD_CODES);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchEbirdJSON(url: string, signal?: AbortSignal) {
  const res = await fetch(url, {
    headers: { "X-eBirdApiToken": EBIRD_TOKEN },
    signal,
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

interface RegionData {
  lat: number;
  lon: number;
  t: string;
  loc: string;
  occ7: number;
}

async function fetchSpeciesAllRegions(
  speciesName: string,
  ebirdCode: string
): Promise<{
  regions: Record<string, RegionData>;
  occ7: number;
  t: string;
  region: string;
  lat: number | null;
  lon: number | null;
}> {
  const regions: Record<string, RegionData> = {};
  let totalOcc7 = 0;
  let latestT = "";
  let latestRegion = "";
  let latestLat: number | null = null;
  let latestLon: number | null = null;

  const urls = REGIONS.map(
    (r) =>
      `https://api.ebird.org/v2/data/obs/${r}/recent/${encodeURIComponent(
        ebirdCode
      )}?back=${BACK_DAYS}&maxResults=${MAX_RESULTS}`
  );

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(url, {
        headers: { "X-eBirdApiToken": EBIRD_TOKEN },
      });
      if (!res.ok) return [];
      return await res.json();
    })
  );

  results.forEach((result, idx) => {
    const region = REGIONS[idx];
    if (result.status !== "fulfilled") return;
    const arr = result.value;
    if (!Array.isArray(arr) || arr.length === 0) return;

    arr.sort((a: any, b: any) =>
      String(b.obsDt || "").localeCompare(String(a.obsDt || ""))
    );

    const now = Date.now();
    let occ7 = 0;
    for (const it of arr) {
      const dt = String(it.obsDt || "").slice(0, 10);
      const d = new Date(dt);
      if (!dt || isNaN(d.getTime())) continue;
      if ((now - d.getTime()) / 86400000 <= 7) occ7++;
    }

    const o = arr[0];
    regions[region] = {
      lat: +o.lat,
      lon: +o.lng,
      t: String(o.obsDt || "").slice(0, 10),
      loc: o.locName || "",
      occ7,
    };
    totalOcc7 += occ7;

    const dt = regions[region].t;
    if (dt && (!latestT || dt > latestT)) {
      latestT = dt;
      latestRegion = region;
      latestLat = regions[region].lat;
      latestLon = regions[region].lon;
    }
  });

  return {
    regions,
    occ7: totalOcc7,
    t: latestT,
    region: latestRegion,
    lat: latestLat,
    lon: latestLon,
  };
}

async function runRefresh(supabase: ReturnType<typeof createClient>) {
  const total = SPECIES.length;

  await supabase
    .from("europe_snapshot")
    .update({
      status: "running",
      progress_done: 0,
      progress_total: total,
      last_error: null,
    })
    .eq("id", 1);

  const points: Record<string, any> = {};
  let done = 0;
  let lastError: string | null = null;

  // Process in batches
  for (let i = 0; i < SPECIES.length; i += CONCURRENCY) {
    const batch = SPECIES.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (name) => {
        const code = DEFAULT_EBIRD_CODES[name];
        if (!code) return { name, data: null };
        try {
          const data = await fetchSpeciesAllRegions(name, code);
          return { name, data };
        } catch (e) {
          throw new Error(`${name}: ${e instanceof Error ? e.message : e}`);
        }
      })
    );

    for (const r of results) {
      done++;
      if (r.status === "fulfilled" && r.value.data) {
        const { name, data } = r.value;
        points[name] = {
          regions: data.regions,
          occ7: data.occ7,
          t: data.t,
          region: data.region,
          lat: data.lat,
          lon: data.lon,
          visible: true,
        };
      } else if (r.status === "rejected") {
        lastError = r.reason?.message || String(r.reason);
        console.warn("[europe-refresh]", lastError);
      }
    }

    // Update progress
    await supabase
      .from("europe_snapshot")
      .update({ progress_done: done, last_error: lastError })
      .eq("id", 1);

    // Jitter between batches
    await sleep(200 + Math.random() * 300);
  }

  // Write final snapshot
  await supabase
    .from("europe_snapshot")
    .update({
      points_json: points,
      generated_at: new Date().toISOString(),
      status: "ready",
      progress_done: done,
      progress_total: total,
      last_error: lastError,
    })
    .eq("id", 1);

  console.log(
    `[europe-refresh] Complete: ${done}/${total} species processed`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("europe_snapshot")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    if (req.method === "POST") {
      // Public refresh with cooldown
      const { data: current } = await supabaseAdmin
        .from("europe_snapshot")
        .select("status, generated_at")
        .eq("id", 1)
        .single();

      if (current?.generated_at) {
        const elapsed =
          Date.now() - new Date(current.generated_at).getTime();
        const COOLDOWN_MS = 15 * 60 * 1000;
        if (elapsed < COOLDOWN_MS && current.status === "ready") {
          const retryAfter = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
          return new Response(
            JSON.stringify({
              error: "Refresh recently completed. Try again later.",
              retry_after_seconds: retryAfter,
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
      }

      if (current?.status === "running") {
        return new Response(
          JSON.stringify({
            message: "Refresh already in progress",
            status: "running",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const refreshPromise = runRefresh(supabaseAdmin).catch((e) => {
        console.error("[europe-refresh] Fatal error:", e);
        supabaseAdmin
          .from("europe_snapshot")
          .update({
            status: "error",
            last_error: e?.message || String(e),
          })
          .eq("id", 1);
      });

      try {
        // @ts-ignore
        if (
          typeof EdgeRuntime !== "undefined" &&
          // @ts-ignore
          EdgeRuntime.waitUntil
        ) {
          // @ts-ignore
          EdgeRuntime.waitUntil(refreshPromise);
        } else {
          await refreshPromise;
        }
      } catch {
        await refreshPromise;
      }

      return new Response(
        JSON.stringify({ message: "Refresh started", status: "running" }),
        {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Europe snapshot error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
