import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_KEY = Deno.env.get("EVENTS_INGEST_KEY"); // reuse same key

// All 369 species
const SPECIES = ["Aed-põõsalind","Aed-roolind","Aedporr","Alk","Alverüdi","Ameerika piilpart","Atlantise tormilind","Aul","Baleaari tormilind","Euroopa kaelustäks","Habekakk","Habeviires","Hahk","Hakk","Hall-kärbsenäpp","Hallhaigur","Hallhani","Hallkibu","Hallpea-rähn","Hallpõsk-pütt","Hallrästas","Hallrüdi","Halltsiitsitaja","Hallvares","Hallõgija","Hangelind","Harakas","Haugaskotkas","Hele-urvalind","Heletilder","Herilaseviu","Hiireviu","Hoburästas","Händkakk","Hänilane","Hõbehaigur","Hõbehaugas","Hõbekajakas","Hüüp","Ida-mustvaeras","Jahipistrik","Jämejalg","Järvekaur","Jääkajakas","Jääkaur","Jääkoskel","Jõgi-ritsiklind","Jõgitiir","Jõgitilder","Jõgivästrik","Kadakatäks","Kaelus-kärbsenäpp","Kaelus-turteltuvi","Kaeluskotkas","Kaelusrästas","Kaelustuvi","Kalakajakas","Kalakotkas","Kalda-rädilind","Kaldapääsuke","Kaljukajakas","Kaljukotkas","Kanada lagle","Kanakull","Kanepilind","Karbuskajakas","Karkjalg","Karmiinleevike","Karvasjalg-kakk","Karvasjalg-viu","Kassikakk","Kiivitaja","Kiripugu-rüdi","Kirjuhahk","Kivikakk","Kivirullija","Kivitäks","Kodukakk","Kodutuvi","Koduvarblane","Koldhaigur","Koldjalg-hõbekajakas","Koldvint","Kormoran","Krüüsel","Kukkurtihane","Kuld-lehelind","Kuldhänilane","Kuldnokk","Kuldtsiitsitaja","Kuninghahk","Kuuse-käbilind","Käblik","Kägu","Käharpelikan","Käosulane","Kääbuskormoran","Kääbuskotkas","Kõnnuõgija","Kõrbe-kivitäks","Kõrbe-põõsalind","Kõrkja-roolind","Kõrvukräts","Kõvernokk-rüdi","Kühmnokk-luik","Künnivares","Laanenäär","Laanepüü","Laanerähn","Laisaba-änn","Lammitilder","Lapi tsiitsitaja","Lasuurtihane","Lauk","Laululuik","Laulurästas","Leeterüdi","Leevike","Liiv-kivitäks","Liivatüll","Linavästrik","Loorkakk","Luitsnokk-iibis","Luitsnokk-part","Lumehani","Lumekakk","Lääne-lehelind","Lääne-pöialpoiss","Lõopistrik","Lõuna-hõbekajakas","Lühinokk-hani","Madukotkas","Mandariinpart","Merikajakas","Merikotkas","Merirüdi","Merisk","Merivart","Mesilasenäpp","Mets-lehelind","Metsis","Metskiur","Metskurvits","Metstilder","Metsvint","Mudanepp","Mudatilder","Must-harksaba","Must-kärbsenäpp","Must-lepalind","Must-toonekurg","Mustjalg-tüll","Mustkael-pütt","Mustkurk-raat","Mustlagle","Mustlauk-õgija","Mustpea-põõsalind","Mustpea-tsiitsitaja","Mustpugu-rästas","Musträhn","Musträstas","Mustsaba-vigle","Musttihane","Mustvaeras","Mustvares","Mustviires","Mägi-kanepilind","Mägikiur","Männi-käbilind","Männileevike","Männitalvike","Mänsak","Naaskelnokk","Naerukajakas","Naerutiir","Niidu-kaelustäks","Niidu-ritsiklind","Niidukiur","Nunn-kivitäks","Nurmkana","Nõgipart","Nõlva-lehelind","Nõmmekiur","Nõmmelõoke","Ohakalind","Ohhoota hõbekajakas","Padu-roolind","Pasknäär","Peegel-tormilind","Pelikan","Peoleo","Piilpart","Piiritaja","Pikksaba-änn","Plütt","Plüü","Polaarkajakas","Porr","Prillvaeras","Pruunselg-põõsalind","Puna-harksaba","Puna-veetallaja","Punajalg-pistrik","Punajalg-tilder","Punakael-lagle","Punakurk-kaur","Punanokk-vart","Punapea-vart","Punapea-õgija","Punarind","Punasaba-õgija","Punaselg-õgija","Purpurhaigur","Puukoristaja","Põhja-kirjurästas","Põhja-lehelind","Põhja-tormipääsu","Põhjatihane","Põhjatsiitsitaja","Põhjavint","Põldlõoke","Põldtsiitsitaja","Põldvarblane","Põldvutt","Pöialpoiss","Rabapistrik","Rabapüü","Raisakotkas","Randkajakas","Randkiur","Randtiir","Rasvatihane","Raudkull","Ristpart","Roherähn","Rohevint","Rohukoskel","Rohunepp","Ronk","Roo-loorkull","Roo-ritsiklind","Roohabekas","Rooruik","Roosa-kuldnokk","Roosakajakas","Roosatiir","Roostepääsuke","Roosterind-tüll","Rootsiitsitaja","Rubiinööbik","Rukkirääk","Ruugerüdi","Rägapart","Rästas-roolind","Räusktiir","Rääkspart","Räästapääsuke","Rüüt","Sabatihane","Salu-lehelind","Salupäll","Salutihane","Sarviklõoke","Sarvikpütt","Siberi lehelind","Siberi raat","Siidhaigur","Siidisaba","Siisike","Sinikael-part","Siniraag","Sinirind","Sinisaba","Sinitihane","Soo-loorkull","Soo-roolind","Sookiur","Sookurg","Soopart","Sooräts","Soorüdi","Stepi-loorkull","Stepikajakas","Stepikiivitaja","Stepikotkas","Stepipistrik","Stepiviu","Suitsupääsuke","Suula","Suur-kirjurähn","Suur-konnakotkas","Suur-laukhani","Suurkoovitaja","Suurnokk-vint","Suurrüdi","Suuränn","Sõtkas","Söödikänn","Tait","Talvike","Tamme-kirjurähn","Teder","Tiigi-roolind","Tikutaja","Triip-ritsiklind","Tuhk-lehelind","Tumetilder","Tundra-rabahani","Tundrakaur","Tundrakiur","Tutkas","Tutt-tihane","Tutt-tiir","Tuttlõoke","Tuttpütt","Tuttvart","Tuuletallaja","Täpikhuik","Tõmmu-lehelind","Tõmmuiibis","Tõmmukajakas","Tõmmuvaeras","Urvalind","Vaaraohani","Vaenukägu","Vainurästas","Valge-toonekurg","Valgepõsk-lagle","Valgeselg-kirjurähn","Valgesilm-vart","Valgetiib-viires","Veetallaja","Veisehaigur","Vesipapp","Vihitaja","Viupart","Väike-kirjurähn","Väike-konnakotkas","Väike-käosulane","Väike-kärbsenäpp","Väike-laukhani","Väike-lehelind","Väike-põõsalind","Väikealk","Väikehuik","Väikehüüp","Väikekajakas","Väikekoovitaja","Väikekoskel","Väikeluik","Väikepistrik","Väikepütt","Väikerüdi","Väiketiir","Väiketrapp","Väiketsiitsitaja","Väiketüll","Välja-loorkull","Välja-väikelõoke","Värbkakk","Värbrüdi","Väänkael","Võsa-ritsiklind","Võsaraat","Vööt-käbilind","Vööt-põõsalind","Vööthani","Vöötkakk","Vöötnokk-kajakas","Vöötsaba-vigle","Õõnetuvi","Ööbik","Ööhaigur","Öösorr"];

function isEstoniaCoords(lat: number, lon: number) {
  return lat >= 57 && lat <= 60 && lon >= 21 && lon <= 29;
}

function toDay(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

// Fetch occurrence data for one species from Elurikkus biocache API
async function fetchSpeciesData(name: string): Promise<{
  lat: number | null;
  lon: number | null;
  latestDate: string | null;
  occ7: number;
}> {
  const searchUrl = `https://elurikkus.ee/biocache-service/occurrences/search?q=${encodeURIComponent(name)}&sort=eventDate&dir=desc&pageSize=50&fq=country:Estonia`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // Try HTML scraping as fallback
      return await fetchSpeciesFromHtml(name);
    }

    const json = await res.json();
    const occurrences = json?.occurrences || [];

    let latestDate: string | null = null;
    let bestMs = -1;
    let occ7 = 0;
    let lat: number | null = null;
    let lon: number | null = null;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const occ of occurrences) {
      // Extract date
      const dateStr =
        occ.eventDate || occ.occurrenceDate || occ.datetime || "";
      const dateMatch = String(dateStr).match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const d = dateMatch[1];
        const ms = toDay(d);
        if (ms && ms > bestMs) {
          bestMs = ms;
          latestDate = d;
        }
        if (ms && ms >= sevenDaysAgo) occ7++;
      }

      // Extract coordinates (prefer newest with Estonian coords)
      if (lat === null) {
        const olat = parseFloat(occ.decimalLatitude);
        const olon = parseFloat(occ.decimalLongitude);
        if (isEstoniaCoords(olat, olon)) {
          lat = olat;
          lon = olon;
        }
      }
    }

    return { lat, lon, latestDate, occ7 };
  } catch (e) {
    clearTimeout(timeout);
    // Fallback to HTML scraping
    return await fetchSpeciesFromHtml(name);
  }
}

// Fallback: scrape from HTML search page
async function fetchSpeciesFromHtml(name: string): Promise<{
  lat: number | null;
  lon: number | null;
  latestDate: string | null;
  occ7: number;
}> {
  const url = `https://elurikkus.ee/app/occurrences/search?text=${encodeURIComponent(name)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return { lat: null, lon: null, latestDate: null, occ7: 0 };

    const html = await res.text();

    // Extract dates
    const allDates: string[] = [];
    let m: RegExpExecArray | null;
    const reJson = /"(?:eventDate|datetime)"\s*:\s*"?(\d{4}-\d{2}-\d{2})/gi;
    while ((m = reJson.exec(html)) !== null) allDates.push(m[1]);
    const reTable = /(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/g;
    while ((m = reTable.exec(html)) !== null) allDates.push(m[1]);

    const unique = [...new Set(allDates)];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let bestMs = -1;
    let latestDate: string | null = null;
    let occ7 = 0;

    for (const d of unique) {
      const ms = toDay(d);
      if (ms && ms > bestMs) {
        bestMs = ms;
        latestDate = d;
      }
      if (ms && ms >= sevenDaysAgo) occ7++;
    }

    // Extract coords
    let lat: number | null = null;
    let lon: number | null = null;
    const coordPatterns = [
      /"decimalLatitude"\s*:\s*(-?\d+\.\d+)[^\d-]+?"decimalLongitude"\s*:\s*(-?\d+\.\d+)/i,
      /([5-6]\d\.\d+)\s*[;,\s]\s*(2\d\.\d+)/,
    ];
    for (const re of coordPatterns) {
      const cm = html.match(re);
      if (cm) {
        const a = parseFloat(cm[1]),
          b = parseFloat(cm[2]);
        if (isEstoniaCoords(a, b)) {
          lat = a;
          lon = b;
          break;
        }
        if (isEstoniaCoords(b, a)) {
          lat = b;
          lon = a;
          break;
        }
      }
    }

    return { lat, lon, latestDate, occ7 };
  } catch {
    clearTimeout(timeout);
    return { lat: null, lon: null, latestDate: null, occ7: 0 };
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms) as unknown as number;
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

// Run the full refresh, updating progress in DB
async function runRefresh(
  supabase: ReturnType<typeof createClient>,
  opts?: { startIndex?: number; runId?: string }
) {
  const total = SPECIES.length;
  const startIndex = Math.max(0, Math.min(total, Number(opts?.startIndex || 0)));
  const runId = opts?.runId || crypto.randomUUID();
  const startedAt = Date.now();
  const MAX_RUN_MS = 90000;
  const nowIso = () => new Date().toISOString();

  const { data: existingRow } = await supabase
    .from("linnuliigid_snapshot")
    .select("points_json")
    .eq("id", 1)
    .maybeSingle();
  const points: Record<
    string,
    {
      lat?: number;
      lon?: number;
      t?: string;
      occ7?: number;
      src?: string;
      visible?: boolean;
    }
  > = (existingRow?.points_json && typeof existingRow.points_json === "object")
    ? existingRow.points_json as Record<string, { lat?: number; lon?: number; t?: string; occ7?: number; src?: string; visible?: boolean; }>
    : {};

  let done = startIndex;
  let lastError: string | null = null;
  const CONCURRENCY = 5;
  const JITTER_MIN = 150;
  const JITTER_MAX = 250;
  const MAX_RETRIES = 2;

  // Process in batches of CONCURRENCY
  for (let i = startIndex; i < SPECIES.length; i += CONCURRENCY) {
    const batch = SPECIES.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (name) => {
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            if (attempt > 0) await sleep(1000 * Math.pow(2, attempt - 1));
            return { name, data: await withTimeout(fetchSpeciesData(name), 15000, `species=${name}`) };
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e));
          }
        }
        throw lastErr || new Error("Unknown error for " + name);
      })
    );

    for (const r of results) {
      done++;
      if (r.status === "fulfilled") {
        const { name, data } = r.value;
        const entry: (typeof points)[string] = {
          src: "Elurikkus",
          visible: true,
        };
        if (data.latestDate) entry.t = data.latestDate;
        if (data.lat !== null && data.lon !== null) {
          entry.lat = data.lat;
          entry.lon = data.lon;
        }
        entry.occ7 = data.occ7;
        points[name] = entry;
      } else {
        lastError = `${batch[results.indexOf(r)]}: ${r.reason?.message || r.reason}`;
        console.warn("[refresh]", lastError);
      }
    }

    // Update progress every batch
    await supabase
      .from("linnuliigid_snapshot")
      .update({
        points_json: points,
        progress_done: done,
        last_error: lastError,
        heartbeat_at: nowIso(),
        run_id: runId,
      })
      .eq("id", 1);

    if (Date.now() - startedAt > MAX_RUN_MS) {
      console.log(`[refresh] Time budget reached at ${done}/${total}; leaving status=running`);
      return;
    }

    // Jitter between batches
    await sleep(JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN));
  }

  // Write final snapshot
  await supabase
    .from("linnuliigid_snapshot")
    .update({
      points_json: points,
      generated_at: new Date().toISOString(),
      status: "ready",
      progress_done: done,
      progress_total: total,
      last_error: lastError,
      heartbeat_at: nowIso(),
      run_id: runId,
    })
    .eq("id", 1);

  console.log(`[refresh] Complete: ${done}/${total} species processed`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (req.method === "GET") {
      // Return current snapshot
      const { data, error } = await supabaseAdmin
        .from("linnuliigid_snapshot")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30",
        },
      });
    }

    if (req.method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        body = {};
      }
      const startIndex = Math.max(0, Number(body?.start_index || 0) || 0);
      const force = body?.force === true;
      const STALE_MS = 120000;
      const RUNNING_STUCK_MS = 5 * 60 * 1000;
      const nowMs = Date.now();
      const nowIso = new Date().toISOString();
      const runId = crypto.randomUUID();
      // Public refresh with cooldown — no key required
      // Check if already running or recently completed (15 min cooldown)
      const { data: current } = await supabaseAdmin
        .from("linnuliigid_snapshot")
        .select("status, generated_at, progress_done, progress_total, heartbeat_at, running_started_at")
        .eq("id", 1)
        .single();

      if (current?.generated_at) {
        const elapsed = Date.now() - new Date(current.generated_at).getTime();
        const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
        if (elapsed < COOLDOWN_MS && current.status === "ready") {
          const retryAfter = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
          return new Response(
            JSON.stringify({
              error: "Refresh recently completed. Try again later.",
              retry_after_seconds: retryAfter,
            }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      const heartbeatMs = current?.heartbeat_at ? new Date(current.heartbeat_at).getTime() : null;
      const runningStartedMs = current?.running_started_at ? new Date(current.running_started_at).getTime() : null;
      const staleHeartbeat = !heartbeatMs || (nowMs - heartbeatMs > STALE_MS);
      const staleRun = !runningStartedMs || (nowMs - runningStartedMs > RUNNING_STUCK_MS);
      const allowTakeover = force || (current?.status === "running" && staleHeartbeat && staleRun);
      if (current?.status === "running" && !allowTakeover) {
        return new Response(
          JSON.stringify({
            message: "Refresh already in progress",
            status: "running",
            heartbeat_at: current?.heartbeat_at || null,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const resumeStart = Math.max(startIndex, Number(current?.progress_done || 0) || 0);
      const runningStartedAt = (force || staleRun)
        ? nowIso
        : (current?.running_started_at || nowIso);

      const { error: startError } = await supabaseAdmin
        .from("linnuliigid_snapshot")
        .update({
          status: "running",
          progress_done: resumeStart,
          progress_total: SPECIES.length,
          last_error: null,
          running_started_at: runningStartedAt,
          heartbeat_at: nowIso,
          run_id: runId,
        })
        .eq("id", 1);
      if (startError) throw startError;

      // Run refresh (this will take a while but edge functions support up to 150s)
      // Use waitUntil pattern: respond immediately, run in background
      // Actually, for simplicity, we run inline and let the client poll status
      // But we should respond quickly... Let's use EdgeRuntime.waitUntil if available

      // Start refresh in background
      const refreshPromise = runRefresh(supabaseAdmin, { startIndex: resumeStart, runId }).catch((e) => {
        console.error("[refresh] Fatal error:", e);
        supabaseAdmin
          .from("linnuliigid_snapshot")
          .update({
            status: "error",
            last_error: e?.message || String(e),
            heartbeat_at: new Date().toISOString(),
          })
          .eq("id", 1);
      });

      // Try to use waitUntil for background processing
      try {
        // @ts-ignore - Deno Deploy specific
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(refreshPromise);
        }
      } catch {
        // no-op
      }

      return new Response(
        JSON.stringify({
          message: force && isStale ? "Refresh takeover started" : "Refresh started",
          status: "running",
          start_index: resumeStart,
          force,
          auto_takeover: !force && current?.status === "running" && staleHeartbeat && staleRun,
          run_id: runId,
        }),
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
    console.error("Snapshot error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
