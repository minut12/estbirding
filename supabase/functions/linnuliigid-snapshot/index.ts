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
const SPECIES = ["Aed-pÃµÃµsalind","Aed-roolind","Aedporr","Alk","AlverÃ¼di","Ameerika piilpart","Atlantise tormilind","Aul","Baleaari tormilind","Euroopa kaelustÃ¤ks","Habekakk","Habeviires","Hahk","Hakk","Hall-kÃ¤rbsenÃ¤pp","Hallhaigur","Hallhani","Hallkibu","Hallpea-rÃ¤hn","HallpÃµsk-pÃ¼tt","HallrÃ¤stas","HallrÃ¼di","Halltsiitsitaja","Hallvares","HallÃµgija","Hangelind","Harakas","Haugaskotkas","Hele-urvalind","Heletilder","Herilaseviu","Hiireviu","HoburÃ¤stas","HÃ¤ndkakk","HÃ¤nilane","HÃµbehaigur","HÃµbehaugas","HÃµbekajakas","HÃ¼Ã¼p","Ida-mustvaeras","Jahipistrik","JÃ¤mejalg","JÃ¤rvekaur","JÃ¤Ã¤kajakas","JÃ¤Ã¤kaur","JÃ¤Ã¤koskel","JÃµgi-ritsiklind","JÃµgitiir","JÃµgitilder","JÃµgivÃ¤strik","KadakatÃ¤ks","Kaelus-kÃ¤rbsenÃ¤pp","Kaelus-turteltuvi","Kaeluskotkas","KaelusrÃ¤stas","Kaelustuvi","Kalakajakas","Kalakotkas","Kalda-rÃ¤dilind","KaldapÃ¤Ã¤suke","Kaljukajakas","Kaljukotkas","Kanada lagle","Kanakull","Kanepilind","Karbuskajakas","Karkjalg","Karmiinleevike","Karvasjalg-kakk","Karvasjalg-viu","Kassikakk","Kiivitaja","Kiripugu-rÃ¼di","Kirjuhahk","Kivikakk","Kivirullija","KivitÃ¤ks","Kodukakk","Kodutuvi","Koduvarblane","Koldhaigur","Koldjalg-hÃµbekajakas","Koldvint","Kormoran","KrÃ¼Ã¼sel","Kukkurtihane","Kuld-lehelind","KuldhÃ¤nilane","Kuldnokk","Kuldtsiitsitaja","Kuninghahk","Kuuse-kÃ¤bilind","KÃ¤blik","KÃ¤gu","KÃ¤harpelikan","KÃ¤osulane","KÃ¤Ã¤buskormoran","KÃ¤Ã¤buskotkas","KÃµnnuÃµgija","KÃµrbe-kivitÃ¤ks","KÃµrbe-pÃµÃµsalind","KÃµrkja-roolind","KÃµrvukrÃ¤ts","KÃµvernokk-rÃ¼di","KÃ¼hmnokk-luik","KÃ¼nnivares","LaanenÃ¤Ã¤r","LaanepÃ¼Ã¼","LaanerÃ¤hn","Laisaba-Ã¤nn","Lammitilder","Lapi tsiitsitaja","Lasuurtihane","Lauk","Laululuik","LaulurÃ¤stas","LeeterÃ¼di","Leevike","Liiv-kivitÃ¤ks","LiivatÃ¼ll","LinavÃ¤strik","Loorkakk","Luitsnokk-iibis","Luitsnokk-part","Lumehani","Lumekakk","LÃ¤Ã¤ne-lehelind","LÃ¤Ã¤ne-pÃ¶ialpoiss","LÃµopistrik","LÃµuna-hÃµbekajakas","LÃ¼hinokk-hani","Madukotkas","Mandariinpart","Merikajakas","Merikotkas","MerirÃ¼di","Merisk","Merivart","MesilasenÃ¤pp","Mets-lehelind","Metsis","Metskiur","Metskurvits","Metstilder","Metsvint","Mudanepp","Mudatilder","Must-harksaba","Must-kÃ¤rbsenÃ¤pp","Must-lepalind","Must-toonekurg","Mustjalg-tÃ¼ll","Mustkael-pÃ¼tt","Mustkurk-raat","Mustlagle","Mustlauk-Ãµgija","Mustpea-pÃµÃµsalind","Mustpea-tsiitsitaja","Mustpugu-rÃ¤stas","MustrÃ¤hn","MustrÃ¤stas","Mustsaba-vigle","Musttihane","Mustvaeras","Mustvares","Mustviires","MÃ¤gi-kanepilind","MÃ¤gikiur","MÃ¤nni-kÃ¤bilind","MÃ¤nnileevike","MÃ¤nnitalvike","MÃ¤nsak","Naaskelnokk","Naerukajakas","Naerutiir","Niidu-kaelustÃ¤ks","Niidu-ritsiklind","Niidukiur","Nunn-kivitÃ¤ks","Nurmkana","NÃµgipart","NÃµlva-lehelind","NÃµmmekiur","NÃµmmelÃµoke","Ohakalind","Ohhoota hÃµbekajakas","Padu-roolind","PasknÃ¤Ã¤r","Peegel-tormilind","Pelikan","Peoleo","Piilpart","Piiritaja","Pikksaba-Ã¤nn","PlÃ¼tt","PlÃ¼Ã¼","Polaarkajakas","Porr","Prillvaeras","Pruunselg-pÃµÃµsalind","Puna-harksaba","Puna-veetallaja","Punajalg-pistrik","Punajalg-tilder","Punakael-lagle","Punakurk-kaur","Punanokk-vart","Punapea-vart","Punapea-Ãµgija","Punarind","Punasaba-Ãµgija","Punaselg-Ãµgija","Purpurhaigur","Puukoristaja","PÃµhja-kirjurÃ¤stas","PÃµhja-lehelind","PÃµhja-tormipÃ¤Ã¤su","PÃµhjatihane","PÃµhjatsiitsitaja","PÃµhjavint","PÃµldlÃµoke","PÃµldtsiitsitaja","PÃµldvarblane","PÃµldvutt","PÃ¶ialpoiss","Rabapistrik","RabapÃ¼Ã¼","Raisakotkas","Randkajakas","Randkiur","Randtiir","Rasvatihane","Raudkull","Ristpart","RoherÃ¤hn","Rohevint","Rohukoskel","Rohunepp","Ronk","Roo-loorkull","Roo-ritsiklind","Roohabekas","Rooruik","Roosa-kuldnokk","Roosakajakas","Roosatiir","RoostepÃ¤Ã¤suke","Roosterind-tÃ¼ll","Rootsiitsitaja","RubiinÃ¶Ã¶bik","RukkirÃ¤Ã¤k","RuugerÃ¼di","RÃ¤gapart","RÃ¤stas-roolind","RÃ¤usktiir","RÃ¤Ã¤kspart","RÃ¤Ã¤stapÃ¤Ã¤suke","RÃ¼Ã¼t","Sabatihane","Salu-lehelind","SalupÃ¤ll","Salutihane","SarviklÃµoke","SarvikpÃ¼tt","Siberi lehelind","Siberi raat","Siidhaigur","Siidisaba","Siisike","Sinikael-part","Siniraag","Sinirind","Sinisaba","Sinitihane","Soo-loorkull","Soo-roolind","Sookiur","Sookurg","Soopart","SoorÃ¤ts","SoorÃ¼di","Stepi-loorkull","Stepikajakas","Stepikiivitaja","Stepikotkas","Stepipistrik","Stepiviu","SuitsupÃ¤Ã¤suke","Suula","Suur-kirjurÃ¤hn","Suur-konnakotkas","Suur-laukhani","Suurkoovitaja","Suurnokk-vint","SuurrÃ¼di","SuurÃ¤nn","SÃµtkas","SÃ¶Ã¶dikÃ¤nn","Tait","Talvike","Tamme-kirjurÃ¤hn","Teder","Tiigi-roolind","Tikutaja","Triip-ritsiklind","Tuhk-lehelind","Tumetilder","Tundra-rabahani","Tundrakaur","Tundrakiur","Tutkas","Tutt-tihane","Tutt-tiir","TuttlÃµoke","TuttpÃ¼tt","Tuttvart","Tuuletallaja","TÃ¤pikhuik","TÃµmmu-lehelind","TÃµmmuiibis","TÃµmmukajakas","TÃµmmuvaeras","Urvalind","Vaaraohani","VaenukÃ¤gu","VainurÃ¤stas","Valge-toonekurg","ValgepÃµsk-lagle","Valgeselg-kirjurÃ¤hn","Valgesilm-vart","Valgetiib-viires","Veetallaja","Veisehaigur","Vesipapp","Vihitaja","Viupart","VÃ¤ike-kirjurÃ¤hn","VÃ¤ike-konnakotkas","VÃ¤ike-kÃ¤osulane","VÃ¤ike-kÃ¤rbsenÃ¤pp","VÃ¤ike-laukhani","VÃ¤ike-lehelind","VÃ¤ike-pÃµÃµsalind","VÃ¤ikealk","VÃ¤ikehuik","VÃ¤ikehÃ¼Ã¼p","VÃ¤ikekajakas","VÃ¤ikekoovitaja","VÃ¤ikekoskel","VÃ¤ikeluik","VÃ¤ikepistrik","VÃ¤ikepÃ¼tt","VÃ¤ikerÃ¼di","VÃ¤iketiir","VÃ¤iketrapp","VÃ¤iketsiitsitaja","VÃ¤iketÃ¼ll","VÃ¤lja-loorkull","VÃ¤lja-vÃ¤ikelÃµoke","VÃ¤rbkakk","VÃ¤rbrÃ¼di","VÃ¤Ã¤nkael","VÃµsa-ritsiklind","VÃµsaraat","VÃ¶Ã¶t-kÃ¤bilind","VÃ¶Ã¶t-pÃµÃµsalind","VÃ¶Ã¶thani","VÃ¶Ã¶tkakk","VÃ¶Ã¶tnokk-kajakas","VÃ¶Ã¶tsaba-vigle","Ã•Ãµnetuvi","Ã–Ã¶bik","Ã–Ã¶haigur","Ã–Ã¶sorr"];

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

// NOTE: heartbeat_at is optional. Add it with a migration for best stale-run detection.
async function updateSnapshotRow(
  supabase: ReturnType<typeof createClient>,
  patch: Record<string, unknown>,
) {
  const withHeartbeat = { ...patch, heartbeat_at: new Date().toISOString() };
  const result = await supabase.from("linnuliigid_snapshot").update(withHeartbeat).eq("id", 1);
  if (!result.error) return;
  if (String(result.error.message || "").toLowerCase().includes("heartbeat_at")) {
    await supabase.from("linnuliigid_snapshot").update(patch).eq("id", 1);
    return;
  }
  throw result.error;
}

async function runRefreshChunk(
  supabase: ReturnType<typeof createClient>,
  opts?: { startIndex?: number; maxItems?: number },
) {
  const total = SPECIES.length;
  const maxItems = Math.max(1, Math.min(50, Number(opts?.maxItems || 10)));
  let startIndex = Math.max(0, Math.min(total, Number(opts?.startIndex || 0)));
  let lastError: string | null = null;

  const { data: current } = await supabase
    .from("linnuliigid_snapshot")
    .select("status, progress_done, heartbeat_at, points_json")
    .eq("id", 1)
    .maybeSingle();

  const heartbeatMs = current?.heartbeat_at ? new Date(current.heartbeat_at).getTime() : 0;
  const staleRunning = current?.status === "running" && heartbeatMs > 0 && (Date.now() - heartbeatMs) > 5 * 60 * 1000;
  if (current?.status === "running" && !staleRunning && Number(current?.progress_done || 0) > startIndex) {
    startIndex = Number(current?.progress_done || startIndex);
  }
  if (staleRunning) {
    startIndex = Number(current?.progress_done || startIndex);
  }

  const points: Record<string, { lat?: number; lon?: number; t?: string; occ7?: number; src?: string; visible?: boolean }> =
    (current?.points_json && typeof current.points_json === "object")
      ? current.points_json as Record<string, { lat?: number; lon?: number; t?: string; occ7?: number; src?: string; visible?: boolean }>
      : {};

  await updateSnapshotRow(supabase, {
    status: "running",
    progress_done: startIndex,
    progress_total: total,
    last_error: null,
  });

  let done = startIndex;
  const endIndex = Math.min(total, startIndex + maxItems);
  for (let i = startIndex; i < endIndex; i++) {
    const name = SPECIES[i];
    try {
      const data = await withTimeout(fetchSpeciesData(name), 25000, `species=${name}`);
      const entry: (typeof points)[string] = { src: "Elurikkus", visible: true };
      if (data.latestDate) entry.t = data.latestDate;
      if (data.lat !== null && data.lon !== null) {
        entry.lat = data.lat;
        entry.lon = data.lon;
      }
      entry.occ7 = data.occ7;
      points[name] = entry;
    } catch (e) {
      lastError = `${name}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      done = i + 1;
      await updateSnapshotRow(supabase, {
        points_json: points,
        progress_done: done,
        progress_total: total,
        status: done >= total ? "ready" : "running",
        generated_at: done >= total ? new Date().toISOString() : null,
        last_error: lastError,
      });
    }
    await sleep(120);
  }
  return { done, total, status: done >= total ? "ready" : "running", last_error: lastError };
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
      const maxItems = Math.max(1, Math.min(50, Number(body?.max_items || 10) || 10));
      const result = await runRefreshChunk(supabaseAdmin, { startIndex, maxItems });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
