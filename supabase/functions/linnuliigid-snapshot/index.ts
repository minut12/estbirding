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

let heartbeatColumnAvailable = true;

function isMissingHeartbeatColumnError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "");
  return msg.includes("heartbeat_at") && msg.toLowerCase().includes("column");
}

async function selectSnapshotRow(supabase: ReturnType<typeof createClient>) {
  if (heartbeatColumnAvailable) {
    const res = await supabase
      .from("linnuliigid_snapshot")
      .select("status, generated_at, progress_done, progress_total, heartbeat_at, running_started_at, points_json, last_error")
      .eq("id", 1)
      .single();
    if (!res.error) return res;
    if (!isMissingHeartbeatColumnError(res.error)) return res;
    console.error("[snapshot] heartbeat_at column missing; continuing without heartbeat support");
    heartbeatColumnAvailable = false;
  }
  return await supabase
    .from("linnuliigid_snapshot")
    .select("status, generated_at, progress_done, progress_total, running_started_at, points_json, last_error")
    .eq("id", 1)
    .single();
}

async function updateSnapshot(
  supabase: ReturnType<typeof createClient>,
  patch: Record<string, unknown>,
) {
  const payload = { ...patch };
  if (!heartbeatColumnAvailable) delete payload.heartbeat_at;
  const res = await supabase
    .from("linnuliigid_snapshot")
    .update(payload)
    .eq("id", 1);
  if (!res.error) return res;
  if (isMissingHeartbeatColumnError(res.error)) {
    console.error("[snapshot] heartbeat_at column missing during update; retrying without it");
    heartbeatColumnAvailable = false;
    const retryPayload = { ...patch };
    delete retryPayload.heartbeat_at;
    return await supabase
      .from("linnuliigid_snapshot")
      .update(retryPayload)
      .eq("id", 1);
  }
  return res;
}

// Run one refresh batch, updating progress after every item.
async function runRefresh(
  supabase: ReturnType<typeof createClient>,
  opts?: { startIndex?: number; runId?: string }
) {
  const total = SPECIES.length;
  const startIndex = Math.max(0, Math.min(total, Number(opts?.startIndex || 0)));
  const runId = opts?.runId || crypto.randomUUID();
  const startedAt = Date.now();
  const MAX_RUN_MS = 60000;
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
  const MAX_RETRIES = 2;
  const INDEX_TIMEOUT_MS = 30000;
  for (let i = startIndex; i < total; i++) {
    const name = SPECIES[i];
    try {
      // Runner watches for takeover marker and skips current index once requested.
      const { data: takeoverRow } = await supabase
        .from("linnuliigid_snapshot")
        .select("last_error")
        .eq("id", 1)
        .maybeSingle();
      const marker = String((takeoverRow as { last_error?: string | null })?.last_error || "");
      if (marker.includes("[force_takeover]")) {
        done++;
        lastError = `${name}: forced takeover skip`;
      } else {
        await Promise.race([
          (async () => {
            let data: Awaited<ReturnType<typeof fetchSpeciesData>> | null = null;
            let lastErr: Error | null = null;
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              try {
                if (attempt > 0) await sleep(400 * Math.pow(2, attempt - 1));
                data = await withTimeout(fetchSpeciesData(name), 12000, `species=${name}`);
                break;
              } catch (e) {
                lastErr = e instanceof Error ? e : new Error(String(e));
              }
            }
            done++;
            if (data) {
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
              lastError = `${name}: ${lastErr?.message || "Unknown fetch error"}`;
              console.warn("[refresh]", lastError);
            }
          })(),
          (async () => {
            await sleep(INDEX_TIMEOUT_MS);
            throw new Error(`INDEX_TIMEOUT index=${i} species=${name}`);
          })(),
        ]);
      }
    } catch (e) {
      done++;
      lastError = `${name}: ${e instanceof Error ? e.message : String(e)}`;
      console.warn("[refresh] item failure", lastError);
    }

    const upd = await updateSnapshot(supabase, {
      points_json: points,
      progress_done: done,
      progress_total: total,
      last_error: lastError,
      heartbeat_at: nowIso(),
      run_id: runId,
    });
    if (upd.error) throw upd.error;
    if (Date.now() - startedAt > MAX_RUN_MS) {
      return { done, total, finished: false, timedOut: true, lastError, points, runId };
    }
  }

  return { done, total, finished: done >= total, timedOut: false, lastError, points, runId };
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
      const action = String(body?.action || "").toLowerCase();

      const startIndex = Math.max(0, Number(body?.start_index || 0) || 0);
      const force = body?.force === true;
      const STALE_MS = 90000;
      const nowMs = Date.now();
      const nowIso = new Date().toISOString();
      const runId = crypto.randomUUID();

      const { data: current, error: currentError } = await selectSnapshotRow(supabaseAdmin);
      if (currentError) throw currentError;

      if (action === "skip" || action === "force_advance") {
        const requestedIndex = Math.max(0, Number(body?.toIndex ?? body?.index ?? 0) || 0);
        const reason = String(body?.reason || "force_advance");
        const currentDone = Number(current?.progress_done || 0);
        const progressTotal = Number(current?.progress_total || SPECIES.length);
        const nextDone = Math.max(currentDone, Math.min(requestedIndex, progressTotal));
        const prevError = String((current as { last_error?: string | null })?.last_error || "").trim();
        const nextErrorLine = `forced advance: to=${nextDone} reason=${reason}`;
        const nextError = prevError ? `${prevError}\n${nextErrorLine}` : nextErrorLine;

        const { error: skipError } = await updateSnapshot(supabaseAdmin, {
          progress_done: nextDone,
          progress_total: progressTotal,
          status: nextDone >= progressTotal ? "ready" : "running",
          last_error: nextError,
          heartbeat_at: nowIso,
          running_started_at: (current as { running_started_at?: string | null })?.running_started_at || nowIso,
          ...(nextDone >= progressTotal ? { generated_at: nowIso } : {}),
        });
        if (skipError) throw skipError;

        const { data: updated, error: updatedError } = await selectSnapshotRow(supabaseAdmin);
        if (updatedError) throw updatedError;
        const points = (updated as { points_json?: unknown })?.points_json || (current as { points_json?: unknown })?.points_json || {};
        return new Response(
          JSON.stringify({
            ok: true,
            action: "force_advance",
            status: updated?.status || (nextDone >= progressTotal ? "ready" : "running"),
            progress_done: Number(updated?.progress_done || nextDone),
            progress_total: Number(updated?.progress_total || progressTotal),
            generated_at: updated?.generated_at || null,
            points_json: points,
            last_error: updated?.last_error || nextError,
            heartbeat_at: heartbeatColumnAvailable ? ((updated as { heartbeat_at?: string | null })?.heartbeat_at || nowIso) : null,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (action === "force_takeover") {
        const reason = String(body?.reason || "takeover");
        const prevError = String((current as { last_error?: string | null })?.last_error || "").trim();
        const takeoverLine = `[force_takeover] ${reason}`;
        const nextError = prevError ? `${prevError}\n${takeoverLine}` : takeoverLine;
        const { error: takeoverError } = await updateSnapshot(supabaseAdmin, {
          status: "running",
          last_error: nextError,
          heartbeat_at: nowIso,
          running_started_at: nowIso,
        });
        if (takeoverError) throw takeoverError;
        const { data: updated, error: updatedError } = await selectSnapshotRow(supabaseAdmin);
        if (updatedError) throw updatedError;
        return new Response(
          JSON.stringify({
            ok: true,
            action: "force_takeover",
            status: updated?.status || "running",
            progress_done: Number(updated?.progress_done || 0),
            progress_total: Number(updated?.progress_total || SPECIES.length),
            last_error: updated?.last_error || nextError,
            heartbeat_at: heartbeatColumnAvailable ? ((updated as { heartbeat_at?: string | null })?.heartbeat_at || nowIso) : null,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (action && action !== "start_refresh") {
        return new Response(
          JSON.stringify({ error: "unknown_action", action }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (current?.generated_at) {
        const elapsed = Date.now() - new Date(current.generated_at).getTime();
        const COOLDOWN_MS = 15 * 60 * 1000;
        if (elapsed < COOLDOWN_MS && current.status === "ready" && !force) {
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

      const heartbeatMs = (current as { heartbeat_at?: string | null })?.heartbeat_at
        ? new Date((current as { heartbeat_at?: string | null }).heartbeat_at as string).getTime()
        : null;
      const staleHeartbeat = !heartbeatMs || (nowMs - heartbeatMs > STALE_MS);
      const allowTakeover = force || staleHeartbeat;
      if (current?.status === "running" && !allowTakeover) {
        return new Response(
          JSON.stringify({
            error: "already running",
            status: "running",
            heartbeat_at: (current as { heartbeat_at?: string | null })?.heartbeat_at || null,
            progress_done: current?.progress_done || 0,
            progress_total: current?.progress_total || SPECIES.length,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const resumeStart = Math.max(startIndex, Number(current?.progress_done || 0) || 0);
      const { error: startError } = await updateSnapshot(supabaseAdmin, {
        status: "running",
        progress_done: resumeStart,
        progress_total: SPECIES.length,
        last_error: null,
        running_started_at: nowIso,
        heartbeat_at: nowIso,
        run_id: runId,
      });
      if (startError) throw startError;

      try {
        const result = await runRefresh(supabaseAdmin, { startIndex: resumeStart, runId });
        const finalStatus = result.finished ? "ready" : "running";
        const { error: finalizeError } = await updateSnapshot(supabaseAdmin, {
          points_json: result.points,
          status: finalStatus,
          progress_done: result.done,
          progress_total: result.total,
          last_error: result.lastError,
          heartbeat_at: new Date().toISOString(),
          run_id: result.runId,
          ...(result.finished ? { generated_at: new Date().toISOString() } : {}),
        });
        if (finalizeError) throw finalizeError;

        const responseBody = {
          status: finalStatus,
          progress_done: result.done,
          progress_total: result.total,
          generated_at: result.finished ? new Date().toISOString() : current?.generated_at || null,
          points_json: result.points,
          last_error: result.lastError,
          heartbeat_at: heartbeatColumnAvailable ? new Date().toISOString() : null,
        };
        return new Response(
          JSON.stringify(responseBody),
          {
            status: result.timedOut && !result.finished ? 202 : 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await updateSnapshot(supabaseAdmin, {
          status: "error",
          last_error: msg,
          heartbeat_at: new Date().toISOString(),
          run_id: runId,
        });
        return new Response(
          JSON.stringify({
            status: "error",
            progress_done: Number(current?.progress_done || 0),
            progress_total: Number(current?.progress_total || SPECIES.length),
            generated_at: current?.generated_at || null,
            points_json: (current as { points_json?: unknown })?.points_json || {},
            last_error: msg,
            heartbeat_at: heartbeatColumnAvailable ? new Date().toISOString() : null,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
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

