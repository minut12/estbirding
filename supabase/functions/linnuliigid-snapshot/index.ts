import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey, authorization, x-publish-token",
  "Access-Control-Expose-Headers": "X-EstBirding-Mode, ETag, Last-Modified, X-Snapshot-Generated-At, Content-Length",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "Content-Type": "application/json; charset=utf-8",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_KEY = Deno.env.get("EVENTS_INGEST_KEY"); // reuse same key
const PUBLISH_TOKEN = Deno.env.get("PUBLISH_TOKEN") || "";
const DEBUG_LITE = Deno.env.get("DEBUG_LITE") === "1";
const BUILD_ID = "2026-04-11-diag1";

// All 369 species
const SPECIES = ["Aed-põõsalind","Aed-roolind","Aedporr","Alk","Alverüdi","Ameerika piilpart","Atlantise tormilind","Aul","Baleaari tormilind","Euroopa kaelustäks","Habekakk","Habeviires","Hahk","Hakk","Hall-kärbsenäpp","Hallhaigur","Hallhani","Hallkibu","Hallpea-rähn","Hallpõsk-pütt","Hallrästas","Hallrüdi","Halltsiitsitaja","Hallvares","Hallõgija","Hangelind","Harakas","Haugaskotkas","Hele-urvalind","Heletilder","Herilaseviu","Hiireviu","Hoburästas","Händkakk","Hänilane","Hõbehaigur","Hõbehaugas","Hõbekajakas","Hüüp","Ida-mustvaeras","Jahipistrik","Jämejalg","Järvekaur","Jääkajakas","Jääkaur","Jääkoskel","Jõgi-ritsiklind","Jõgitiir","Jõgitilder","Jõgivästrik","Kadakatäks","Kaelus-kärbsenäpp","Kaelus-turteltuvi","Kaeluskotkas","Kaelusrästas","Kaelustuvi","Kalakajakas","Kalakotkas","Kalda-rädilind","Kaldapääsuke","Kaljukajakas","Kaljukotkas","Kanada lagle","Kanakull","Kanepilind","Karbuskajakas","Karkjalg","Karmiinleevike","Karvasjalg-kakk","Karvasjalg-viu","Kassikakk","Kiivitaja","Kiripugu-rüdi","Kirjuhahk","Kivikakk","Kivirullija","Kivitäks","Kodukakk","Kodutuvi","Koduvarblane","Koldhaigur","Koldjalg-hõbekajakas","Koldvint","Kormoran","Krüüsel","Kukkurtihane","Kuld-lehelind","Kuldhänilane","Kuldnokk","Kuldtsiitsitaja","Kuninghahk","Kuuse-käbilind","Käblik","Kägu","Käharpelikan","Käosulane","Kääbuskormoran","Kääbuskotkas","Kõnnuõgija","Kõrbe-kivitäks","Kõrbe-põõsalind","Kõrkja-roolind","Kõrvukräts","Kõvernokk-rüdi","Kühmnokk-luik","Künnivares","Laanenäär","Laanepüü","Laanerähn","Laisaba-änn","Lammitilder","Lapi tsiitsitaja","Lasuurtihane","Lauk","Laululuik","Laulurästas","Leeterüdi","Leevike","Liiv-kivitäks","Liivatüll","Linavästrik","Loorkakk","Luitsnokk-iibis","Luitsnokk-part","Lumehani","Lumekakk","Lääne-lehelind","Lääne-pöialpoiss","Lõopistrik","Lõuna-hõbekajakas","Lühinokk-hani","Madukotkas","Mandariinpart","Merikajakas","Merikotkas","Merirüdi","Merisk","Merivart","Mesilasenäpp","Mets-lehelind","Metsis","Metskiur","Metskurvits","Metstilder","Metsvint","Mudanepp","Mudatilder","Must-harksaba","Must-kärbsenäpp","Must-lepalind","Must-toonekurg","Mustjalg-tüll","Mustkael-pütt","Mustkurk-raat","Mustlagle","Mustlauk-õgija","Mustpea-põõsalind","Mustpea-tsiitsitaja","Mustpugu-rästas","Musträhn","Musträstas","Mustsaba-vigle","Musttihane","Mustvaeras","Mustvares","Mustviires","Mägi-kanepilind","Mägikiur","Männi-käbilind","Männileevike","Männitalvike","Mänsak","Naaskelnokk","Naerukajakas","Naerutiir","Niidu-kaelustäks","Niidu-ritsiklind","Niidukiur","Nunn-kivitäks","Nurmkana","Nõgipart","Nõlva-lehelind","Nõmmekiur","Nõmmelõoke","Ohakalind","Ohhoota hõbekajakas","Padu-roolind","Pasknäär","Peegel-tormilind","Pelikan","Peoleo","Piilpart","Piiritaja","Pikksaba-änn","Plütt","Plüü","Polaarkajakas","Porr","Prillvaeras","Pruunselg-põõsalind","Puna-harksaba","Puna-veetallaja","Punajalg-pistrik","Punajalg-tilder","Punakael-lagle","Punakurk-kaur","Punanokk-vart","Punapea-vart","Punapea-õgija","Punarind","Punasaba-õgija","Punaselg-õgija","Purpurhaigur","Puukoristaja","Põhja-kirjurästas","Põhja-lehelind","Põhja-tormipääsu","Põhjatihane","Põhjatsiitsitaja","Põhjavint","Põldlõoke","Põldtsiitsitaja","Põldvarblane","Põldvutt","Pöialpoiss","Rabapistrik","Rabapüü","Raisakotkas","Randkajakas","Randkiur","Randtiir","Rasvatihane","Raudkull","Ristpart","Roherähn","Rohevint","Rohukoskel","Rohunepp","Ronk","Roo-loorkull","Roo-ritsiklind","Roohabekas","Rooruik","Roosa-kuldnokk","Roosakajakas","Roosatiir","Roostepääsuke","Roosterind-tüll","Rootsiitsitaja","Rubiinööbik","Rukkirääk","Ruugerüdi","Rägapart","Rästas-roolind","Räusktiir","Rääkspart","Räästapääsuke","Rüüt","Sabatihane","Salu-lehelind","Salupäll","Salutihane","Sarviklõoke","Sarvikpütt","Siberi lehelind","Siberi raat","Siidhaigur","Siidisaba","Siisike","Sinikael-part","Siniraag","Sinirind","Sinisaba","Sinitihane","Soo-loorkull","Soo-roolind","Sookiur","Sookurg","Soopart","Sooräts","Soorüdi","Stepi-loorkull","Stepikajakas","Stepikiivitaja","Stepikotkas","Stepipistrik","Stepiviu","Suitsupääsuke","Suula","Suur-kirjurähn","Suur-konnakotkas","Suur-laukhani","Suurkoovitaja","Suurnokk-vint","Suurrüdi","Suuränn","Sõtkas","Söödikänn","Tait","Talvike","Tamme-kirjurähn","Teder","Tiigi-roolind","Tikutaja","Triip-ritsiklind","Tuhk-lehelind","Tumetilder","Tundra-rabahani","Tundrakaur","Tundrakiur","Tutkas","Tutt-tihane","Tutt-tiir","Tuttlõoke","Tuttpütt","Tuttvart","Tuuletallaja","Täpikhuik","Tõmmu-lehelind","Tõmmuiibis","Tõmmukajakas","Tõmmuvaeras","Urvalind","Vaaraohani","Vaenukägu","Vainurästas","Valge-toonekurg","Valgepõsk-lagle","Valgeselg-kirjurähn","Valgesilm-vart","Valgetiib-viires","Veetallaja","Veisehaigur","Vesipapp","Vihitaja","Viupart","Väike-kirjurähn","Väike-konnakotkas","Väike-käosulane","Väike-kärbsenäpp","Väike-laukhani","Väike-lehelind","Väike-põõsalind","Väikealk","Väikehuik","Väikehüüp","Väikekajakas","Väikekoovitaja","Väikekoskel","Väikeluik","Väikepistrik","Väikepütt","Väikerüdi","Väiketiir","Väiketrapp","Väiketsiitsitaja","Väiketüll","Välja-loorkull","Välja-väikelõoke","Värbkakk","Värbrüdi","Väänkael","Võsa-ritsiklind","Võsaraat","Vööt-käbilind","Vööt-põõsalind","Vööthani","Vöötkakk","Vöötnokk-kajakas","Vöötsaba-vigle","Õõnetuvi","Ööbik","Ööhaigur","Öösorr"];

function isEstoniaCoords(lat: number, lon: number) {
  return lat >= 57 && lat <= 60 && lon >= 21 && lon <= 29;
}

const COUNTY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  harju: { lat: 59.40, lon: 24.80 },
  hiiu: { lat: 58.92, lon: 22.60 },
  ida_viru: { lat: 59.35, lon: 27.42 },
  jõgeva: { lat: 58.75, lon: 26.40 },
  järva: { lat: 58.89, lon: 25.57 },
  lääne: { lat: 58.94, lon: 23.54 },
  lääne_viru: { lat: 59.30, lon: 26.33 },
  põlva: { lat: 58.05, lon: 27.05 },
  pärnu: { lat: 58.38, lon: 24.53 },
  rapla: { lat: 58.99, lon: 24.79 },
  saare: { lat: 58.33, lon: 22.48 },
  tartu: { lat: 58.38, lon: 26.73 },
  valga: { lat: 57.78, lon: 26.04 },
  viljandi: { lat: 58.36, lon: 25.60 },
  võru: { lat: 57.84, lon: 27.00 },
};
const MUNICIPALITY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  tartu: { lat: 58.38, lon: 26.73 },
  tallinn: { lat: 59.44, lon: 24.75 },
  pärnu: { lat: 58.38, lon: 24.50 },
  narva: { lat: 59.38, lon: 28.19 },
  viljandi: { lat: 58.36, lon: 25.60 },
  võru: { lat: 57.84, lon: 27.00 },
  rakvere: { lat: 59.35, lon: 26.36 },
  haapsalu: { lat: 58.94, lon: 23.54 },
  kuressaare: { lat: 58.25, lon: 22.49 },
  jõgeva: { lat: 58.75, lon: 26.40 },
  paide: { lat: 58.88, lon: 25.56 },
  rapla: { lat: 58.99, lon: 24.79 },
  valga: { lat: 57.78, lon: 26.04 },
  põlva: { lat: 58.05, lon: 27.05 },
};
// Extracts "X vald" / "X linn" fragment from free-text locality.
function extractMunicipality(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(
    /([A-Za-zÀ-ž]+(?:-[A-Za-zÀ-ž]+)*(?:\s+[A-Za-zÀ-ž]+(?:-[A-Za-zÀ-ž]+)*)*\s+(?:vald|linn))/i,
  );
  return m ? m[1].trim() : null;
}

// Extracts county. Matches both "X maakond" and the informal "Xmaa" form
// (e.g. "Harjumaa", "Ida-Virumaa", "Pärnumaa"), while excluding the very
// common Estonian place-word "küla" which would otherwise collide.
function extractCounty(text: string | null | undefined): string | null {
  if (!text) return null;
  const mk = text.match(
    /([A-Za-zÀ-ž]+(?:-[A-Za-zÀ-ž]+)*(?:\s+[A-Za-zÀ-ž]+(?:-[A-Za-zÀ-ž]+)*)*\s+maakond)/i,
  );
  if (mk) return mk[1].trim();
  const maa = text.match(/\b([A-Za-zÀ-ž]+(?:-[A-Za-zÀ-ž]+)?maa)\b/);
  if (maa && !/küla$/i.test(maa[1])) return maa[1].trim();
  return null;
}

function normalizeName(v: unknown): string {
  return String(v || "").toLowerCase()
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[õ]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveRestrictedCentroid(
  municipality: string | null,
  county: string | null,
): { lat: number; lon: number; coordsSource: "municipality" | "county" } | null {
  const mKey = municipality
    ? normalizeName(municipality)
        .replace(/_linn$/, "").replace(/_vald$/, "").replace(/_alev$/, "").replace(/_alevik$/, "")
        .replace(/_maakond$/, "").replace(/_county$/, "")
    : "";
  const cKey = county
    ? normalizeName(county).replace(/_county$/, "").replace(/_maakond$/, "")
    : "";
  const mCentroid = mKey ? MUNICIPALITY_CENTROIDS[mKey] : null;
  if (mCentroid) return { lat: mCentroid.lat, lon: mCentroid.lon, coordsSource: "municipality" };
  const cCentroid = cKey ? COUNTY_CENTROIDS[cKey] : null;
  if (cCentroid) return { lat: cCentroid.lat, lon: cCentroid.lon, coordsSource: "county" };
  return null;
}

function toDay(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

function parseElurikkusDate(v: string): number {
  const s = String(v || "").trim();
  if (!s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const t = Date.parse(iso);
  if (Number.isFinite(t)) return t;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  const fallback = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  return Number.isFinite(fallback) ? fallback : 0;
}

function formatDateEEFromTs(ts: number): string | null {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

// Fetch occurrence data for one species from Elurikkus biocache API.
// Paginates via &start=<page*pageSize>&pageSize=200 until empty page, item ceiling,
// page ceiling, per-species wall-clock budget, or two consecutive fetch errors.
async function fetchSpeciesData(name: string): Promise<{
  lat: number | null;
  lon: number | null;
  latestDate: string | null;
  occ7: number;
  coordsStatus: "public" | "restricted" | "missing";
  coordsSource: "exact" | "municipality" | "county" | "none";
  locality: string | null;
  municipality: string | null;
  county: string | null;
  individualCount: number | null;
  behavior: string | null;
  collectors: string | null;
  districts: string | null;
  eestiOmavalitsused: string | null;
}> {
  const PAGINATION_MAX_PAGES = 30;
  const PAGINATION_MAX_ITEMS = 1500;
  const PAGINATION_BUDGET_MS = 7000;
  const PAGINATION_INTER_PAGE_MS = 100;
  const PAGINATION_PAGE_TIMEOUT_MS = 8000;
  const PAGE_SIZE = 200;
  const startedAt = Date.now();

  const buildBiocacheUrl = (start: number): string =>
    `https://elurikkus.ee/biocache-service/occurrences/search?q=${encodeURIComponent(name)}&sort=eventDate&dir=desc&pageSize=${PAGE_SIZE}&start=${start}&fq=country:Estonia&_ts=${Date.now()}`;

  const fetchPage = async (pageUrl: string): Promise<{ ok: boolean; status: number; bodyText: string }> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PAGINATION_PAGE_TIMEOUT_MS);
      try {
        const res = await fetch(pageUrl, {
          signal: ctrl.signal,
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
          },
        });
        const bodyText = await res.text();
        clearTimeout(timer);
        return { ok: res.ok, status: res.status, bodyText };
      } catch (e) {
        clearTimeout(timer);
        if (attempt === 0) {
          await sleep(500);
          continue;
        }
        console.warn("[snapshot:biocache] page fetch failed", { species: name, pageUrl, err: String((e as Error)?.message || e) });
        return { ok: false, status: 0, bodyText: "" };
      }
    }
    return { ok: false, status: 0, bodyText: "" };
  };

  try {
    const merged: Record<string, unknown>[] = [];
    let pagesFetched = 0;
    let stopReason: "empty_page" | "max_items" | "max_pages" | "budget_exceeded" | "fetch_error" = "max_pages";
    let firstPageFatal = false;
    let lastPageStatus = 0;

    pageLoop: for (let page = 0; page < PAGINATION_MAX_PAGES; page++) {
      if (page > 0) await sleep(PAGINATION_INTER_PAGE_MS);
      if (Date.now() - startedAt >= PAGINATION_BUDGET_MS) {
        stopReason = "budget_exceeded";
        break pageLoop;
      }
      const pageUrl = buildBiocacheUrl(page * PAGE_SIZE);
      const r = await fetchPage(pageUrl);
      pagesFetched++;
      lastPageStatus = r.status;
      if (!r.ok) {
        if (page === 0) firstPageFatal = true;
        stopReason = "fetch_error";
        console.warn("[snapshot:biocache] stopping pagination", { species: name, page, status: r.status });
        break pageLoop;
      }
      let json: Record<string, unknown> | null = null;
      try {
        json = r.bodyText ? JSON.parse(r.bodyText) : {};
      } catch {
        if (page === 0) firstPageFatal = true;
        stopReason = "fetch_error";
        console.warn("[snapshot:biocache] non-JSON response", { species: name, page });
        break pageLoop;
      }
      const occurrences: Record<string, unknown>[] = Array.isArray(json?.occurrences)
        ? (json.occurrences as Record<string, unknown>[])
        : [];
      if (occurrences.length === 0) {
        if (page === 0) firstPageFatal = true;
        stopReason = "empty_page";
        break pageLoop;
      }
      for (const occ of occurrences) {
        merged.push(occ);
        if (merged.length >= PAGINATION_MAX_ITEMS) break;
      }
      if (merged.length >= PAGINATION_MAX_ITEMS) {
        stopReason = "max_items";
        break pageLoop;
      }
    }

    console.log('[fetchSpeciesData]', name, 'biocache status:', lastPageStatus, 'pagesFetched:', pagesFetched, 'items:', merged.length, 'stopReason:', stopReason);

    // If page 0 totally failed (network / non-OK / non-JSON / empty) — preserve original
    // behavior of falling back to HTML scrape so this species isn't lost.
    if (firstPageFatal && merged.length === 0) {
      return await fetchSpeciesFromHtml(name);
    }

    const normalized = merged
      .map((occ: Record<string, unknown>) => {
        const rawDate = String(
          occ.eventDate || occ.occurrenceDate || occ.observed_at || occ.datetime || "",
        );
        return { occ, rawDate, t: parseElurikkusDate(rawDate) };
      })
      .filter((x: { t: number }) => x.t > 0)
      .sort((a: { t: number }, b: { t: number }) => b.t - a.t);

    const latestTs = normalized[0]?.t || 0;
    const latestDate = latestTs > 0 ? new Date(latestTs).toISOString() : null;

    // Biocache returned data but no parseable dates — preserve original HTML fallback.
    if (!latestDate) {
      return await fetchSpeciesFromHtml(name);
    }
    const occ7 = normalized.filter((x: { t: number }) => x.t >= (Date.now() - 7 * 24 * 60 * 60 * 1000)).length;
    let lat: number | null = null;
    let lon: number | null = null;
    let coordsStatus: "public" | "restricted" | "missing" = "missing";
    let coordsSource: "exact" | "municipality" | "county" | "none" = "none";
    let locality: string | null = null;
    let municipality: string | null = null;
    let county: string | null = null;

    for (const occ of merged) {
      if (!locality) locality = String((occ as Record<string, unknown>).locality || (occ as Record<string, unknown>).locationRemarks || "") || null;
      if (!municipality) municipality = String((occ as Record<string, unknown>).municipality || (occ as Record<string, unknown>).stateProvince || "") || null;
      if (!county) county = String((occ as Record<string, unknown>).county || (occ as Record<string, unknown>).stateProvince || "") || null;
      // Extract coordinates (prefer newest with Estonian coords)
      if (lat === null) {
        const olat = parseFloat(String(occ.decimalLatitude ?? ""));
        const olon = parseFloat(String(occ.decimalLongitude ?? ""));
        if (isEstoniaCoords(olat, olon)) {
          lat = olat;
          lon = olon;
          coordsStatus = "public";
          coordsSource = "exact";
        }
      }
    }
    if (lat === null || lon === null) {
      const centroid = resolveRestrictedCentroid(municipality, county);
      if (centroid) {
        lat = centroid.lat;
        lon = centroid.lon;
        coordsStatus = "restricted";
        coordsSource = centroid.coordsSource;
      } else {
        lat = null;
        lon = null;
        coordsStatus = "missing";
        coordsSource = "none";
      }
    }

    if (DEBUG_LITE && name === "Metsis") {
      console.log("[elurikkus latest]", name, {
        latestRaw: normalized[0]?.rawDate || null,
        latestFmt: latestDate,
        top3: normalized.slice(0, 3).map((x: { t: number }) => new Date(x.t).toISOString()),
        pagesFetched,
        stopReason,
      });
    }

    return { lat, lon, latestDate, occ7, coordsStatus, coordsSource, locality, municipality, county, individualCount: null, behavior: null, collectors: null, districts: null, eestiOmavalitsused: null };
  } catch (e) {
    console.warn("[snapshot:biocache] unexpected error", { species: name, err: String((e as Error)?.message || e) });
    // Fallback to HTML scraping
    return await fetchSpeciesFromHtml(name);
  }
}

// Fallback: scrape from HTML search page.
// Paginates via &limit=100&offset=<page*100>&orderBy=event_date_naive&orderAscending=false
// (mirrors handleElurikkusSpeciesRequest's scheme) until empty page, item ceiling,
// page ceiling, per-species wall-clock budget, or two consecutive fetch errors.
// Metadata for the newest-occurrence row is extracted from page-0 HTML only.
async function fetchSpeciesFromHtml(name: string): Promise<{
  lat: number | null;
  lon: number | null;
  latestDate: string | null;
  occ7: number;
  coordsStatus: "public" | "restricted" | "missing";
  coordsSource: "exact" | "municipality" | "county" | "none";
  locality: string | null;
  municipality: string | null;
  county: string | null;
  individualCount: number | null;
  behavior: string | null;
  collectors: string | null;
  districts: string | null;
  eestiOmavalitsused: string | null;
}> {
  const PAGINATION_MAX_PAGES = 30;
  const PAGINATION_MAX_ITEMS = 1500;
  const PAGINATION_BUDGET_MS = 7000;
  const PAGINATION_INTER_PAGE_MS = 100;
  const PAGINATION_PAGE_TIMEOUT_MS = 8000;
  const PAGE_SIZE = 100;
  const startedAt = Date.now();

  const buildHtmlUrl = (page: number): string => {
    const u = new URL("https://elurikkus.ee/app/occurrences/search");
    u.searchParams.set("text", name);
    u.searchParams.set("limit", String(PAGE_SIZE));
    u.searchParams.set("offset", String(page * PAGE_SIZE));
    u.searchParams.set("orderBy", "event_date_naive");
    u.searchParams.set("orderAscending", "false");
    u.searchParams.set("_ts", String(Date.now()));
    return u.toString();
  };

  const fetchPage = async (pageUrl: string): Promise<{ ok: boolean; status: number; html: string }> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PAGINATION_PAGE_TIMEOUT_MS);
      try {
        const res = await fetch(pageUrl, {
          signal: ctrl.signal,
          headers: {
            Accept: "text/html",
            "User-Agent": "Mozilla/5.0 (compatible; EstBirding/1.0)",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
          },
        });
        const html = await res.text();
        clearTimeout(timer);
        return { ok: res.ok, status: res.status, html };
      } catch (e) {
        clearTimeout(timer);
        if (attempt === 0) {
          await sleep(500);
          continue;
        }
        console.warn("[snapshot:html] page fetch failed", { species: name, pageUrl, err: String((e as Error)?.message || e) });
        return { ok: false, status: 0, html: "" };
      }
    }
    return { ok: false, status: 0, html: "" };
  };

  console.log('[html-fallback]', name, 'starting');

  try {
    const allDates: string[] = [];
    let firstPageHtml = "";
    let pagesFetched = 0;
    let stopReason: "empty_page" | "max_items" | "max_pages" | "budget_exceeded" | "fetch_error" = "max_pages";
    let firstPageFatal = false;

    pageLoop: for (let page = 0; page < PAGINATION_MAX_PAGES; page++) {
      if (page > 0) await sleep(PAGINATION_INTER_PAGE_MS);
      if (Date.now() - startedAt >= PAGINATION_BUDGET_MS) {
        stopReason = "budget_exceeded";
        break pageLoop;
      }
      const pageUrl = buildHtmlUrl(page);
      const r = await fetchPage(pageUrl);
      pagesFetched++;
      if (!r.ok) {
        if (page === 0) firstPageFatal = true;
        stopReason = "fetch_error";
        console.warn("[snapshot:html] stopping pagination", { species: name, page, status: r.status });
        break pageLoop;
      }
      if (page === 0) firstPageHtml = r.html;
      const before = allDates.length;
      let m: RegExpExecArray | null;
      const reJson = /"(?:eventDate|datetime)"\s*:\s*"?(\d{4}-\d{2}-\d{2})/gi;
      while ((m = reJson.exec(r.html)) !== null) allDates.push(m[1]);
      const reTable = /(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/g;
      while ((m = reTable.exec(r.html)) !== null) allDates.push(m[1]);
      const added = allDates.length - before;
      if (added === 0) {
        stopReason = "empty_page";
        break pageLoop;
      }
      if (allDates.length >= PAGINATION_MAX_ITEMS) {
        stopReason = "max_items";
        break pageLoop;
      }
    }

    // Page 0 entirely failed (network / non-OK) — preserve original res.ok=false branch shape.
    if (firstPageFatal) {
      return { lat: null, lon: null, latestDate: null, occ7: 0, coordsStatus: "missing" as const, coordsSource: "none" as const, locality: null, municipality: null, county: null, individualCount: null, behavior: null, collectors: null, districts: null, eestiOmavalitsused: null };
    }

    const normalized = allDates
      .map((rawDate) => ({ rawDate, t: parseElurikkusDate(rawDate) }))
      .filter((x) => x.t > 0)
      .sort((a, b) => b.t - a.t);
    const latestTs = normalized[0]?.t || 0;
    const latestDate = latestTs > 0 ? new Date(latestTs).toISOString() : null;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const occ7 = normalized.filter((x) => x.t >= sevenDaysAgo).length;

    // Page-wide coord extraction removed: the catch-all regex was returning the first
    // Estonia-looking lat/lon pair anywhere in the embedded SvelteKit hydration payload,
    // which often belonged to a different observation than the visible table row. Rely
    // on municipality/county centroid fallback instead (applied below after metadata scrape).
    let lat: number | null = null;
    let lon: number | null = null;

    // Extract metadata from search-page HTML table (page 0 only — newest occurrence row).
    // Fields requiring the detail page (county, municipality, districts, eestiOmavalitsused)
    // stay null here — the frontend "Refresh from Elurikkus" button populates them on demand.
    let locality: string | null = null;
    let municipality: string | null = null;
    let county: string | null = null;
    let individualCount: number | null = null;
    let behavior: string | null = null;
    let collectors: string | null = null;
    const districts: string | null = null;
    const eestiOmavalitsused: string | null = null;
    try {
      // --- helper: strip HTML tags from a cell ---
      const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").trim();

      // --- find <thead> and extract column names ---
      const theadMatch = firstPageHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
      if (theadMatch) {
        const headerRow = theadMatch[1];
        const thMatches = [...headerRow.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
        const colNames = thMatches.map((m) => stripTags(m[1]).toLowerCase());

        // --- bilingual column finder (EN || ET) ---
        const findCol = (needles: string[]): number =>
          colNames.findIndex((c) => needles.some((n) => c.includes(n)));

        const idxCount = findCol(["individual count", "isendite arv"]);
        const idxBehavior = findCol(["behavior", "käitumine"]);
        const idxLocality = findCol(["locality", "kohanimi"]);
        const idxCollectors = findCol(["collector", "kogunik", "recorded by", "leidja"]);

        // --- extract first <tr> in <tbody> = newest occurrence ---
        const tbodyMatch = firstPageHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
        if (tbodyMatch) {
          const firstTr = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
          if (firstTr) {
            const tdMatches = [...firstTr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
            const cells = tdMatches.map((m) => stripTags(m[1]));

            if (idxCount >= 0 && idxCount < cells.length) {
              const n = parseInt(cells[idxCount], 10);
              if (!isNaN(n)) individualCount = n;
            }
            if (idxBehavior >= 0 && idxBehavior < cells.length && cells[idxBehavior]) {
              behavior = cells[idxBehavior] || null;
            }
            if (idxLocality >= 0 && idxLocality < cells.length && cells[idxLocality]) {
              locality = cells[idxLocality] || null;
            }
            if (idxCollectors >= 0 && idxCollectors < cells.length && cells[idxCollectors]) {
              collectors = cells[idxCollectors] || null;
            }
          }
        }
      }
      // TODO: Detail-page fetching could later be added here with rate-limiting and caching
      // to populate county, municipality, districts, eestiOmavalitsused.
      // Approach: extract the first occurrence URL from the search results table <a href>,
      // fetch it with a 5s timeout, and use regex to extract fields from the detail page.
      // Rate-limit to max 1 detail fetch per 2 seconds to avoid overloading Elurikkus.
      // Cache detail-page results in a separate Supabase table keyed by occurrence URL
      // with a 7-day TTL, so repeated rebuilds don't re-fetch the same pages.
    } catch (metaErr: unknown) {
      console.log("[html-fallback-meta] table parse failed:", metaErr);
    }

    // Derive municipality/county from the scraped locality free-text
    if (locality) {
      municipality = extractMunicipality(locality);
      county = extractCounty(locality);
    }

    // Resolve municipality/county centroid; explicitly null lat/lon when nothing resolves
    // so the merge layer overwrites stale values rather than preserving them.
    let coordsStatus: "public" | "restricted" | "missing" = "missing";
    let coordsSource: "exact" | "municipality" | "county" | "none" = "none";
    if (lat === null || lon === null) {
      const centroid = resolveRestrictedCentroid(municipality, county);
      if (centroid) {
        lat = centroid.lat;
        lon = centroid.lon;
        coordsStatus = "restricted";
        coordsSource = centroid.coordsSource;
      } else {
        lat = null;
        lon = null;
        coordsStatus = "missing";
        coordsSource = "none";
      }
    }

    // TODO: remove after coverage validated
    console.log("[elurikkus-html-parse]", JSON.stringify({
      species: name,
      locality,
      municipality,
      county,
      resolved: coordsSource,
      pagesFetched,
      stopReason,
      occ7,
      datesParsed: allDates.length,
    }));
    return { lat, lon, latestDate, occ7, coordsStatus, coordsSource, locality, municipality, county, individualCount, behavior, collectors, districts, eestiOmavalitsused };
  } catch (e) {
    console.warn("[snapshot:html] unexpected error", { species: name, err: String((e as Error)?.message || e) });
    return { lat: null, lon: null, latestDate: null, occ7: 0, coordsStatus: "missing", coordsSource: "none", locality: null, municipality: null, county: null, individualCount: null, behavior: null, collectors: null, districts: null, eestiOmavalitsused: null };
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
const SNAPSHOT_ETAG_VERSION = "v2";

function buildSnapshotEtag(data: Record<string, unknown>): string {
  const generatedAt = String((data as { generated_at?: string | null })?.generated_at || "");
  const done = Number((data as { progress_done?: number | null })?.progress_done || 0);
  const total = Number((data as { progress_total?: number | null })?.progress_total || 0);
  const status = String((data as { status?: string | null })?.status || "");
  const pointsJson = (data as { points_json?: unknown })?.points_json ?? null;
  const payloadJson = JSON.stringify(pointsJson);
  const payloadBytes = new TextEncoder().encode(payloadJson).length;
  return `"snapshot-${SNAPSHOT_ETAG_VERSION}:${payloadBytes}:${generatedAt}:${status}:${done}:${total}"`;
}

function buildSnapshotResponseHeaders(data: Record<string, unknown>): Record<string, string> {
  const generatedAt = String((data as { generated_at?: string | null })?.generated_at || "");
  return {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "ETag": buildSnapshotEtag(data),
    "X-Snapshot-Generated-At": generatedAt,
  };
}

function buildJsonNoStoreHeaders(): Record<string, string> {
  return { ...corsHeaders, "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache", "Content-Type": "application/json; charset=utf-8" };
}
function buildModeHeaders(mode: "ping" | "elurikkus_species" | "snapshot" | "meta" | "rebuild" | "error"): Record<string, string> {
  return { ...buildJsonNoStoreHeaders(), "X-EstBirding-Mode": mode };
}
function withSignature(mode: "ping" | "elurikkus_species" | "snapshot" | "meta" | "rebuild" | "error", payload: Record<string, unknown>) {
  return { buildId: BUILD_ID, mode, ...payload };
}

type LiveOccItem = {
  observedAt: string;
  observedRaw?: string;
  scientificName?: string;
  commonName?: string;
  individualCount?: number;
  locality?: string;
  lat?: number;
  lon?: number;
  municipality?: string;
  occurrenceUrl?: string;
  coordsStatus: "public" | "restricted" | "missing";
};
type EluSearchRow = {
  dateText: string;
  observedAt: string | null;
  occUrl: string;
  rowText: string;
  ms: number | null;
};

type ElurikkusParsedRecord = {
  id: string;
  date: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  individualCount: number | null;
  behavior: string | null;
  recordedBy: string | null;
  taxonName: string | null;
  commonNameEst: string | null;
  commonNameEng: string | null;
};

type ElurikkusParserDebug = {
  inputWasArray: boolean;
  usedEmbeddedJson: boolean;
  usedTableFallback: boolean;
  embeddedResultCount: number;
  tableRowCount: number;
  freshestParsedDate: string | null;
  freshestParsedLocality: string | null;
  parserWarnings: string[];
};

function stripHtml(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractElurikkusHtml(raw: unknown): { html: string; inputWasArray: boolean } {
  const inputWasArray = Array.isArray(raw);
  const html = Array.isArray(raw) && typeof raw[0] === "string"
    ? raw[0]
    : (typeof raw === "string" ? raw : "");
  return { html: String(html || "").trim(), inputWasArray };
}

function looksLikeHtml(value: string): boolean {
  return /<!doctype html|<html\b|<body\b|<script\b|<table\b/i.test(String(value || ""));
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function normalizeEmbeddedResult(row: Record<string, unknown>): ElurikkusParsedRecord {
  const latitude = Number.parseFloat(String(row.latitude ?? row.decimalLatitude ?? row.lat ?? ""));
  const longitude = Number.parseFloat(String(row.longitude ?? row.decimalLongitude ?? row.lon ?? ""));
  const individualCountRaw = Number.parseFloat(String(row.individual_count ?? row.individualCount ?? row.count ?? ""));
  return {
    id: String(row.id ?? row.uuid ?? row.occurrenceID ?? row.occurrenceId ?? "").trim(),
    date: firstNonEmpty(row.event_datetime_point, row.eventDate, row.event_date, row.occurrenceDate),
    locality: firstNonEmpty(row.locality, row.location, row.locationRemarks, row.municipality, row.county),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    individualCount: Number.isFinite(individualCountRaw) ? individualCountRaw : null,
    behavior: firstNonEmpty(row.behavior, row.occurrenceRemarks),
    recordedBy: firstNonEmpty(row.recorded_by, row.recordedBy, row.collector, row.collectors),
    taxonName: firstNonEmpty(row.taxon_name, row.scientificName, row.scientific_name),
    commonNameEst: firstNonEmpty(row.vernacular_name_et, row.common_name_est, row.commonNameEst),
    commonNameEng: firstNonEmpty(row.vernacular_name_en, row.common_name_eng, row.commonNameEng),
  };
}

function parseEmbeddedSearchPayload(doc: any): { results: ElurikkusParsedRecord[]; count: number; warning?: string } {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/json"][data-sveltekit-fetched]')) as any[];
  const target = scripts.find((script: any) => String(script.getAttribute("data-url") || "").includes("/api/occurrences/search"))
    || scripts[0];
  if (!target) return { results: [], count: 0, warning: "embedded search payload script not found" };
  const outer = safeJsonParse((target as any).textContent || "");
  if (!outer || typeof outer !== "object") return { results: [], count: 0, warning: "embedded outer payload was not valid JSON" };
  const body = (outer as Record<string, unknown>).body;
  const inner = typeof body === "string" ? safeJsonParse(body) : body;
  if (!inner || typeof inner !== "object") return { results: [], count: 0, warning: "embedded inner payload was not valid JSON" };
  const resultRows = Array.isArray((inner as Record<string, unknown>).results) ? (inner as Record<string, unknown>).results as Record<string, unknown>[] : [];
  const count = Number((inner as Record<string, unknown>).count || resultRows.length || 0);
  return {
    results: resultRows.map((row) => normalizeEmbeddedResult(row)).filter((row) => row.date || row.locality || (row.latitude != null && row.longitude != null)),
    count,
  };
}

function parseOccurrenceSearchTable(doc: any): ElurikkusParsedRecord[] {
  const tables = Array.from(doc.querySelectorAll("table")) as any[];
  for (const table of tables) {
    const headers = Array.from((table as any).querySelectorAll("thead th, tr th") as any[]).map((cell: any) => stripHtml(cell.textContent || "").toLowerCase());
    const headerText = headers.join(" | ");
    if (!/(date|kuup|locality|asukoht|collectors|koguja|taxon|teaduslik|common)/i.test(headerText)) continue;
    const rows = Array.from((table as any).querySelectorAll("tbody tr, tr") as any[]).map((row: any) => Array.from((row as any).querySelectorAll("td") as any[]).map((cell: any) => stripHtml(cell.textContent || ""))).filter((cells) => cells.length >= 5);
    const mapped = rows.map((cells, index) => ({
      id: `table-row-${index + 1}`,
      date: firstNonEmpty(cells[0]),
      locality: firstNonEmpty(cells[5], cells[4]),
      latitude: null,
      longitude: null,
      individualCount: Number.isFinite(Number(cells[3])) ? Number(cells[3]) : null,
      behavior: firstNonEmpty(cells[4]),
      recordedBy: firstNonEmpty(cells[6], cells[5]),
      taxonName: firstNonEmpty(cells[1]),
      commonNameEst: firstNonEmpty(cells[2]),
      commonNameEng: null,
    })).filter((row) => row.date || row.locality);
    if (mapped.length) return mapped;
  }
  return [];
}

function summarizeParsedElurikkusRecords(records: ElurikkusParsedRecord[]) {
  const sorted = [...records].sort((left, right) => parseElurikkusDate(String(right.date || "")) - parseElurikkusDate(String(left.date || "")));
  const freshest = sorted[0] || null;
  const freshestTs = freshest ? parseElurikkusDate(String(freshest.date || "")) : 0;
  const localityCounts = new Map<string, number>();
  for (const record of sorted) {
    const locality = String(record.locality || "").trim();
    if (!locality) continue;
    localityCounts.set(locality, Number(localityCounts.get(locality) || 0) + 1);
  }
  return {
    records: sorted,
    freshestElurikkusDate: freshestTs > 0 ? new Date(freshestTs).toISOString() : null,
    freshestElurikkusLocality: freshest ? freshest.locality : null,
    topElurikkusLocalities: Array.from(localityCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([label]) => label),
  };
}

function parseElurikkusSearchPage(raw: unknown): { records: ElurikkusParsedRecord[]; available: boolean; debug: ElurikkusParserDebug } {
  const extracted = extractElurikkusHtml(raw);
  const debug: ElurikkusParserDebug = {
    inputWasArray: extracted.inputWasArray,
    usedEmbeddedJson: false,
    usedTableFallback: false,
    embeddedResultCount: 0,
    tableRowCount: 0,
    freshestParsedDate: null,
    freshestParsedLocality: null,
    parserWarnings: [],
  };
  if (!extracted.html || !looksLikeHtml(extracted.html)) {
    debug.parserWarnings.push("input did not look like HTML");
    return { records: [], available: false, debug };
  }
  const doc = new (globalThis as any).DOMParser().parseFromString(extracted.html, "text/html");
  if (!doc) {
    debug.parserWarnings.push("DOMParser failed to parse HTML");
    return { records: [], available: false, debug };
  }

  const embedded = parseEmbeddedSearchPayload(doc);
  debug.embeddedResultCount = embedded.results.length;
  if (embedded.warning) debug.parserWarnings.push(embedded.warning);
  let records = embedded.results;
  if (embedded.results.length || embedded.count > 0) debug.usedEmbeddedJson = true;

  if (!records.length) {
    const tableRecords = parseOccurrenceSearchTable(doc);
    debug.tableRowCount = tableRecords.length;
    if (tableRecords.length) {
      debug.usedTableFallback = true;
      records = tableRecords;
    }
  }

  const summary = summarizeParsedElurikkusRecords(records);
  debug.freshestParsedDate = summary.freshestElurikkusDate;
  debug.freshestParsedLocality = summary.freshestElurikkusLocality;
  if (!records.length) debug.parserWarnings.push("no valid occurrence rows parsed from embedded JSON or table");
  return {
    records: summary.records,
    available: embedded.count > 0 || summary.records.length > 0,
    debug,
  };
}

function parseElurikkusHtmlItems(html: string): LiveOccItem[] {
  const out: LiveOccItem[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = String(rowMatch[1] || "");
    const cells = Array.from(rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((m) => String(m[1] || ""));
    if (cells.length < 2) continue;
    const firstCell = stripHtml(cells[0]);
    if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/.test(firstCell)) continue;
    const ts = parseElurikkusDate(firstCell);
    if (!(ts > 0)) continue;

    const occLink = rowHtml.match(/<a[^>]+href="([^"]*\/app\/occurrences\/occurrence\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const anyLink = rowHtml.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const linkMatch = occLink || anyLink;
    const scientificName = linkMatch ? stripHtml(linkMatch[2]) : stripHtml(cells[1] || "");
    const occurrenceUrl = linkMatch ? String(linkMatch[1] || "").trim() : "";
    const commonName = stripHtml(cells[2] || "");
    const countRaw = stripHtml(cells[3] || "");
    const localityText = stripHtml(cells[4] || cells[5] || "");
    const countMatch = countRaw.match(/-?\d+/);
    const individualCount = countMatch ? Number.parseInt(countMatch[0], 10) : undefined;
    const municipality = localityText || null;

    const latM = rowHtml.match(/(?:decimalLatitude|lat)[^0-9-]*(-?\d+(?:\.\d+)?)/i);
    const lonM = rowHtml.match(/(?:decimalLongitude|lon)[^0-9-]*(-?\d+(?:\.\d+)?)/i);
    const lat = latM ? Number.parseFloat(latM[1]) : null;
    const lon = lonM ? Number.parseFloat(lonM[1]) : null;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
    const item: LiveOccItem = {
      observedAt: new Date(ts).toISOString(),
      observedRaw: firstCell,
      scientificName: scientificName || undefined,
      commonName: commonName || undefined,
      individualCount: Number.isFinite(individualCount as number) ? individualCount : undefined,
      locality: localityText || undefined,
      coordsStatus: hasCoords ? "public" : "missing",
    };
    if (hasCoords) {
      item.lat = Number(lat);
      item.lon = Number(lon);
    }
    if (municipality) item.municipality = municipality;
    if (occurrenceUrl) item.occurrenceUrl = occurrenceUrl.startsWith("http")
      ? occurrenceUrl
      : `https://elurikkus.ee${occurrenceUrl.startsWith("/") ? "" : "/"}${occurrenceUrl}`;
    out.push(item);
    if (out.length >= 200) break;
  }

  if (!out.length) {
    const dateRe = /"(?:eventDate|occurrenceDate|datetime|observed_at|observedAt)"\s*:\s*"([^"]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = dateRe.exec(html)) !== null) {
      const raw = String(m[1] || "").trim();
      const ts = parseElurikkusDate(raw);
      if (!(ts > 0)) continue;
      out.push({ observedAt: new Date(ts).toISOString(), observedRaw: raw, coordsStatus: "missing" });
      if (out.length >= 200) break;
    }
  }
  out.sort((a, b) => parseElurikkusDate(b.observedAt) - parseElurikkusDate(a.observedAt));
  return out.slice(0, 200);
}

function parseEluDateToMs(dateText: string): number | null {
  const m = String(dateText || "").match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  const hh = Number(m[4]); const mm = Number(m[5]); const ss = Number(m[6] || "0");
  const t = new Date(y, mo - 1, d, hh, mm, ss, 0).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseSearchRowsFromHtml(html: string): EluSearchRow[] {
  const out: EluSearchRow[] = [];
  const tbodyMatch = String(html || "").match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return out;
  const tbody = String(tbodyMatch[1] || "");
  const rows = Array.from(tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/ig));
  for (const rm of rows) {
    const rowHtml = String(rm[1] || "");
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/ig)).map((m) => stripHtml(String(m[1] || "")));
    if (!cells.length) continue;
    const dateText = String(cells[0] || "").trim();
    const aMatch = rowHtml.match(/href=["']([^"']*\/app\/occurrences\/occurrence\/\d+[^"']*)["']/i);
    if (!aMatch) continue;
    const href = String(aMatch[1] || "").trim();
    if (!href) continue;
    const occUrl = href.startsWith("http")
      ? href
      : `https://elurikkus.ee${href.startsWith("/") ? "" : "/"}${href}`;
    const ms = parseEluDateToMs(dateText);
    out.push({
      dateText,
      observedAt: (ms && Number.isFinite(ms)) ? new Date(ms).toISOString() : null,
      occUrl,
      rowText: stripHtml(rowHtml),
      ms,
    });
  }
  return out;
}

function isLikelyEstoniaRow(row: EluSearchRow): boolean {
  const t = String(row.rowText || "").toLowerCase();
  return t.includes("estonia") || t.includes("eesti");
}

function countOcc7FromRows(rows: EluSearchRow[]): number {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.ms || NaN)) continue;
    if ((r.ms as number) >= cutoff) n++;
  }
  return n;
}

function parseOccurrenceDetailCoords(html: string): { lat?: number; lon?: number; hidden: boolean } {
  const raw = String(html || "");
  if (!raw) return { hidden: false };
  const hidden = /(coordinates?\s+hidden|koordinaadid\s+peidetud|sensitive\s+species|täpsed\s+koordinaadid\s+on\s+peidetud)/i.test(raw);
  function pick(label: string): number | null {
    const re = new RegExp(label + "[\\s\\S]{0,240}?(-?\\d{1,2}(?:[\\.,]\\d+))", "i");
    const m = raw.match(re);
    if (!m) return null;
    const n = Number.parseFloat(String(m[1] || "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  let lat = pick("Latitude|Laius");
  let lon = pick("Longitude|Pikkus");
  if (!(Number.isFinite(lat) && Number.isFinite(lon))) {
    const m = raw.match(/(-?\d{1,2}(?:\.\d+))\s*,\s*(-?\d{1,2}(?:\.\d+))/);
    if (m) {
      const a = Number.parseFloat(m[1]);
      const b = Number.parseFloat(m[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        lat = a;
        lon = b;
      }
    }
  }
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat: Number(lat), lon: Number(lon), hidden };
  return { hidden };
}

async function enrichItemsWithDetailCoords(items: LiveOccItem[], maxChecks = 5): Promise<void> {
  const sorted = items
    .map((it, idx) => ({ it, idx, ts: parseElurikkusDate(it.observedAt || it.observedRaw || "") }))
    .sort((a, b) => b.ts - a.ts);
  let checks = 0;
  for (const row of sorted) {
    if (checks >= maxChecks) break;
    const item = row.it;
    if (!item || !item.occurrenceUrl) continue;
    if (Number.isFinite(item.lat) && Number.isFinite(item.lon) && item.coordsStatus === "public") continue;
    checks++;
    try {
      const res = await fetch(item.occurrenceUrl, {
        method: "GET",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache", "User-Agent": "EstBirding/1.0" },
      });
      const html = await res.text();
      const parsed = parseOccurrenceDetailCoords(html);
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) {
        item.lat = Number(parsed.lat);
        item.lon = Number(parsed.lon);
        item.coordsStatus = "public";
      } else if (parsed.hidden) {
        item.coordsStatus = "restricted";
        delete item.lat;
        delete item.lon;
      } else if (item.coordsStatus !== "public") {
        item.coordsStatus = "missing";
      }
    } catch {
      if (item.coordsStatus !== "public") item.coordsStatus = item.coordsStatus || "missing";
    }
  }
}

async function handleElurikkusSpeciesRequest(req: Request, url: URL): Promise<Response> {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify(withSignature("elurikkus_species", { ok: false, stage: "request", message: "Method not allowed" })),
      { status: 405, headers: buildModeHeaders("elurikkus_species") },
    );
  }

  const species = String(url.searchParams.get("text") || url.searchParams.get("q") || "").trim();
  if (!species) {
    return new Response(
      JSON.stringify(withSignature("elurikkus_species", { ok: false, stage: "request", message: "Missing text query parameter" })),
      { status: 400, headers: buildModeHeaders("elurikkus_species") },
    );
  }
  if (species.length < 2) {
    return new Response(
      JSON.stringify(withSignature("elurikkus_species", { ok: false, stage: "request", message: "text must be at least 2 chars" })),
      { status: 400, headers: buildModeHeaders("elurikkus_species") },
    );
  }

  const force = String(url.searchParams.get("force") || "").trim() === "1";
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const buildPageUrl = (page: number): string => {
    const u = new URL("https://elurikkus.ee/app/occurrences/search");
    u.searchParams.set("text", species);
    u.searchParams.set("limit", "100");
    u.searchParams.set("offset", String(page * 100));
    u.searchParams.set("orderBy", "event_date_naive");
    u.searchParams.set("orderAscending", "false");
    u.searchParams.set("_ts", String(Date.now()));
    if (force) u.searchParams.set("force", "1");
    return u.toString();
  };
  const sourceUrl = buildPageUrl(0);
  const startedAt = Date.now();
  try {
    const MAX_PAGES = 30;
    const MAX_ITEMS = 1500;
    const mergedItems: LiveOccItem[] = [];
    const mergedRows: EluSearchRow[] = [];
    let pagesFetched = 0;
    let paginationStopReason: "empty_page" | "max_pages" | "max_items" | "fetch_error" = "max_pages";
    let totalUpstreamBytes = 0;
    let firstPageHtml = "";
    let firstPageStatus = 0;
    let lastPageStatus = 0;

    const fetchPage = async (pageUrl: string): Promise<{ ok: boolean; status: number; html: string; bytes: number }> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          const res = await fetch(pageUrl, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache",
              "Pragma": "no-cache",
              "User-Agent": "EstBirding/1.0",
            },
            signal: ctrl.signal,
          });
          const html = await res.text();
          clearTimeout(timer);
          const bytes = new TextEncoder().encode(html).length;
          return { ok: res.ok, status: res.status, html, bytes };
        } catch (e) {
          clearTimeout(timer);
          if (attempt === 0) {
            await sleep(500);
            continue;
          }
          console.error("[elurikkus_species] page fetch failed", { pageUrl, err: String((e as Error)?.message || e) });
          return { ok: false, status: 0, html: "", bytes: 0 };
        }
      }
      return { ok: false, status: 0, html: "", bytes: 0 };
    };

    pageLoop: for (let page = 0; page < MAX_PAGES; page++) {
      if (page > 0) await sleep(100);
      const pageUrl = buildPageUrl(page);
      const r = await fetchPage(pageUrl);
      pagesFetched++;
      totalUpstreamBytes += r.bytes;
      lastPageStatus = r.status;
      if (page === 0) {
        firstPageHtml = r.html;
        firstPageStatus = r.status;
      }
      if (!r.ok) {
        paginationStopReason = "fetch_error";
        console.error("[elurikkus_species] stopping pagination after fetch error", { species, page, status: r.status });
        break pageLoop;
      }
      const pageItems = parseElurikkusHtmlItems(r.html);
      const pageRows = parseSearchRowsFromHtml(r.html).filter((row) => Number.isFinite(row.ms || NaN));
      if (pageItems.length === 0 && pageRows.length === 0) {
        paginationStopReason = "empty_page";
        break pageLoop;
      }
      for (const it of pageItems) {
        mergedItems.push(it);
        if (mergedItems.length >= MAX_ITEMS) break;
      }
      for (const row of pageRows) mergedRows.push(row);
      if (mergedItems.length >= MAX_ITEMS) {
        paginationStopReason = "max_items";
        break pageLoop;
      }
    }

    const durationMs = Date.now() - startedAt;
    const items = mergedItems.slice(0, MAX_ITEMS);

    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    const occ7 = items.reduce((n, it) => {
      const t = it.observedAt ? Date.parse(it.observedAt) : NaN;
      return Number.isFinite(t) && t >= cutoff ? n + 1 : n;
    }, 0);

    let dataMaxAt: string | null = null;
    {
      let maxTs = 0;
      for (const it of items) {
        if (!it.observedAt) continue;
        const t = Date.parse(it.observedAt);
        if (Number.isFinite(t) && t > maxTs) { maxTs = t; dataMaxAt = it.observedAt; }
      }
    }

    const parsedSearch = parseElurikkusSearchPage([firstPageHtml]);
    const parsedSummary = summarizeParsedElurikkusRecords(parsedSearch.records);

    const sortedRows = mergedRows.slice().sort((a, b) => Number(b.ms || 0) - Number(a.ms || 0));
    const estRows = sortedRows.filter((r) => isLikelyEstoniaRow(r));
    const newestRows = (estRows.length ? estRows : sortedRows).slice(0, 50);
    if (!dataMaxAt && newestRows.length) {
      dataMaxAt = newestRows[0].observedAt || dataMaxAt;
    }

    let selected: Record<string, unknown> | null = null;
    for (let i = 0; i < Math.min(10, newestRows.length); i++) {
      const row = newestRows[i];
      try {
        const dRes = await fetch(row.occUrl + (row.occUrl.includes("?") ? "&" : "?") + "_ts=" + Date.now(), {
          method: "GET",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache", "User-Agent": "EstBirding/1.0" },
        });
        const dHtml = await dRes.text();
        const c = parseOccurrenceDetailCoords(dHtml);
        const occIdMatch = row.occUrl.match(/occurrence\/(\d+)/i);
        const occId = occIdMatch ? String(occIdMatch[1]) : "";
        if (Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
          selected = {
            occurrenceId: occId,
            url: row.occUrl,
            observedAt: row.observedAt,
            date: row.dateText ? String(row.dateText).slice(0, 10) : null,
            lat: Number(c.lat),
            lon: Number(c.lon),
            coordsStatus: "public",
          };
          break;
        }
        if (c.hidden && !selected) {
          selected = {
            occurrenceId: occId,
            url: row.occUrl,
            observedAt: row.observedAt,
            date: row.dateText ? String(row.dateText).slice(0, 10) : null,
            coordsStatus: "restricted",
          };
        }
      } catch {
        // continue to next row
      }
    }

    const totalMatch = firstPageHtml.match(/returns\s+([\d\s,\.]+)\s+results/i);
    const totalResultsParsed = totalMatch ? Number(String(totalMatch[1] || "").replace(/[^\d]/g, "")) || 0 : 0;
    const totalResults = totalResultsParsed > 0 ? totalResultsParsed : items.length;

    return new Response(
      JSON.stringify(withSignature("elurikkus_species", {
        ok: true,
        query: species,
        species,
        sourceUrl,
        upstreamStatus: firstPageStatus || lastPageStatus,
        upstreamBytes: totalUpstreamBytes,
        durationMs,
        htmlLength: firstPageHtml.length,
        totalResults,
        dataMaxAt,
        occ7,
        elurikkusAvailable: parsedSearch.available,
        elurikkusRecentRecords: parsedSummary.records,
        freshestElurikkusDate: parsedSummary.freshestElurikkusDate,
        freshestElurikkusLocality: parsedSummary.freshestElurikkusLocality,
        topElurikkusLocalities: parsedSummary.topElurikkusLocalities,
        parserDebug: parsedSearch.debug,
        selected,
        sample: firstPageHtml.slice(0, 200),
        items,
        pagesFetched,
        paginationStopReason,
      })),
      { status: 200, headers: buildModeHeaders("elurikkus_species") },
    );
  } catch (error) {
    return new Response(
      JSON.stringify(withSignature("elurikkus_species", {
        ok: false,
        query: species,
        stage: "upstream",
        species,
        sourceUrl,
        upstreamStatus: 0,
        upstreamBytes: 0,
        durationMs: Date.now() - startedAt,
        htmlLength: 0,
        totalResults: 0,
        dataMaxAt: null,
        elurikkusAvailable: false,
        elurikkusRecentRecords: [],
        freshestElurikkusDate: null,
        freshestElurikkusLocality: null,
        topElurikkusLocalities: [],
        parserDebug: {
          inputWasArray: false,
          usedEmbeddedJson: false,
          usedTableFallback: false,
          embeddedResultCount: 0,
          tableRowCount: 0,
          freshestParsedDate: null,
          freshestParsedLocality: null,
          parserWarnings: [String((error as Error)?.message || error)],
        },
        items: [],
        message: String((error as Error)?.message || error),
      })),
      { status: 502, headers: buildModeHeaders("elurikkus_species") },
    );
  }
}

function searchParamsToObject(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}

function buildSnapshotMeta(data: Record<string, unknown>) {
  const snapshotGeneratedAt = String((data as { generated_at?: string | null })?.generated_at || "");
  const pointsJson = (data as { points_json?: unknown })?.points_json ?? null;
  const pointsObj = (pointsJson && typeof pointsJson === "object")
    ? pointsJson as Record<string, unknown>
    : null;
  const totalItemsByPoints = pointsObj ? Object.keys(pointsObj).length : 0;
  const totalItems = Math.max(
    Number((data as { progress_total?: number | null })?.progress_total || 0),
    totalItemsByPoints,
  );
  let maxTs = 0;
  let minTs = Number.POSITIVE_INFINITY;
  if (pointsObj) {
    for (const value of Object.values(pointsObj)) {
      const entry = (value && typeof value === "object") ? value as Record<string, unknown> : null;
      const raw = String(entry?.t || entry?.date || entry?.observed_at || entry?.eventDate || "");
      const ts = parseElurikkusDate(raw);
      if (ts > 0) {
        maxTs = Math.max(maxTs, ts);
        minTs = Math.min(minTs, ts);
      }
    }
  }
  const pointsJsonText = JSON.stringify(pointsObj || {});
  const bytes = new TextEncoder().encode(pointsJsonText).length;
  const dataMaxAt = maxTs > 0 ? formatDateEEFromTs(maxTs) : null;
  const dataMinAt = Number.isFinite(minTs) ? formatDateEEFromTs(minTs) : null;
  const snapshotId = `${bytes}:${snapshotGeneratedAt}:${totalItems}:${dataMaxAt || ""}`;
  return { snapshotGeneratedAt, snapshotId, bytes, totalItems, dataMaxAt, dataMinAt };
}

function isMissingSnapshotStateTableError(err: unknown): boolean {
  const e = err as { message?: string; code?: string; details?: string; hint?: string } | null;
  const msg = String(e?.message || err || "").toLowerCase();
  const code = String(e?.code || "").toLowerCase();
  // PostgREST: PGRST205 = could not find table in schema cache; 42P01 = undefined_table
  if (code === "pgrst205" || code === "42p01") return true;
  if (!msg.includes("snapshot_state")) return false;
  return (
    msg.includes("relation") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find")
  );
}

async function getSnapshotState(supabase: any, key: string) {
  const res = await supabase
    .from("snapshot_state")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (res.error && isMissingSnapshotStateTableError(res.error)) {
    return { data: null, error: null, missingTable: true };
  }
  return { data: res.data, error: res.error, missingTable: false };
}

async function upsertSnapshotState(supabase: any, key: string, patch: Record<string, unknown>) {
  const payload = { key, ...patch };
  const res = await supabase
    .from("snapshot_state")
    .upsert(payload, { onConflict: "key" });
  if (res.error && isMissingSnapshotStateTableError(res.error)) {
    return { error: null, missingTable: true };
  }
  return { error: res.error, missingTable: false };
}

async function rebuildSnapshotNow(supabaseAdmin: any, currentRow: Record<string, unknown>) {
  const stateKey = "linnuliigid_2026";
  const now = new Date();
  const nowIso = now.toISOString();
  const stateRes = await getSnapshotState(supabaseAdmin, stateKey);
  if (stateRes.error) throw stateRes.error;
  const state = (stateRes.data || {}) as Record<string, unknown>;
  const lastStarted = state.started_at
    ? new Date(String(state.started_at)).getTime()
    : (state.last_build_started_at ? new Date(String(state.last_build_started_at)).getTime() : 0);
  const lastFinished = state.finished_at
    ? new Date(String(state.finished_at)).getTime()
    : (state.last_build_finished_at ? new Date(String(state.last_build_finished_at)).getTime() : 0);
  const building = state.building === true;
  const BUILD_LOCK_MS = 2 * 60 * 1000;
  const BUILD_COOLDOWN_MS = 60 * 1000;
  const currentMeta = buildSnapshotMeta(currentRow);

  if (building && lastStarted > 0 && (now.getTime() - lastStarted) < BUILD_LOCK_MS) {
    return {
      httpStatus: 202,
      body: {
        status: "building",
        snapshotId: String(state.last_snapshot_id || currentMeta.snapshotId || ""),
        dataMaxAt: state.last_data_max_at || currentMeta.dataMaxAt || null,
        upstreamDataMaxAt: state.last_upstream_data_max_at || null,
        snapshotGeneratedAt: currentMeta.snapshotGeneratedAt || null,
        bytes: Number(currentMeta.bytes || 0),
        totalItems: Number(currentMeta.totalItems || 0),
        finishedAt: state.finished_at || state.last_build_finished_at || null,
      },
    };
  }

  if (lastFinished > 0 && (now.getTime() - lastFinished) < BUILD_COOLDOWN_MS) {
    return {
      httpStatus: 200,
      body: {
        status: "cooldown",
        snapshotId: String(state.last_snapshot_id || currentMeta.snapshotId || ""),
        dataMaxAt: state.last_data_max_at || currentMeta.dataMaxAt || null,
        upstreamDataMaxAt: state.last_upstream_data_max_at || null,
        snapshotGeneratedAt: currentMeta.snapshotGeneratedAt || null,
        bytes: Number(currentMeta.bytes || 0),
        totalItems: Number(currentMeta.totalItems || 0),
        finishedAt: state.finished_at || state.last_build_finished_at || null,
      },
    };
  }

  await upsertSnapshotState(supabaseAdmin, stateKey, {
    building: true,
    started_at: nowIso,
    last_build_started_at: nowIso,
  });

  const runId = crypto.randomUUID();
  const { error: startError } = await updateSnapshot(supabaseAdmin, {
    status: "running",
    progress_done: 0,
    progress_total: SPECIES.length,
    last_error: null,
    running_started_at: nowIso,
    heartbeat_at: nowIso,
    run_id: runId,
  });
  if (startError) throw startError;

  try {
    const result = await runRefresh(supabaseAdmin, { startIndex: 0, runId });
    const finishedAt = new Date().toISOString();
    const finalStatus = result.finished ? "ready" : "running";
    const { error: finalizeError } = await updateSnapshot(supabaseAdmin, {
      points_json: result.points,
      status: finalStatus,
      progress_done: result.done,
      progress_total: result.total,
      last_error: result.lastError,
      heartbeat_at: finishedAt,
      run_id: result.runId,
      ...(result.finished ? { generated_at: finishedAt } : {}),
    });
    if (finalizeError) throw finalizeError;

    const { data: updatedRow } = await supabaseAdmin
      .from("linnuliigid_snapshot")
      .select("*")
      .eq("id", 1)
      .single();
    const rebuiltMeta = buildSnapshotMeta((updatedRow || currentRow) as Record<string, unknown>);
    await upsertSnapshotState(supabaseAdmin, stateKey, {
      building: false,
      finished_at: finishedAt,
      last_build_finished_at: finishedAt,
      last_snapshot_id: rebuiltMeta.snapshotId,
      last_data_max_at: rebuiltMeta.dataMaxAt,
      last_upstream_data_max_at: result.upstreamDataMaxAt || null,
    });
    return {
      httpStatus: 200,
      body: {
        status: "rebuilt",
        snapshotId: rebuiltMeta.snapshotId,
        dataMaxAt: rebuiltMeta.dataMaxAt,
        upstreamDataMaxAt: result.upstreamDataMaxAt || null,
        snapshotGeneratedAt: rebuiltMeta.snapshotGeneratedAt,
        bytes: Number(rebuiltMeta.bytes || 0),
        totalItems: Number(rebuiltMeta.totalItems || 0),
        finishedAt,
      },
    };
  } catch (rebuildError) {
    await upsertSnapshotState(supabaseAdmin, stateKey, {
      building: false,
      finished_at: new Date().toISOString(),
      last_build_finished_at: new Date().toISOString(),
    });
    throw rebuildError;
  }
}

function isMissingHeartbeatColumnError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "");
  return msg.includes("heartbeat_at") && msg.toLowerCase().includes("column");
}

async function selectSnapshotRow(supabase: any) {
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
  supabase: any,
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

// Run one refresh batch. When speciesFilter is set (debug-only), only process that one species.
async function runRefresh(
  supabase: any,
  opts?: { startIndex?: number; runId?: string; speciesFilter?: string }
) {
  const speciesFilter = opts?.speciesFilter?.trim().toLowerCase() || "";
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
      lat?: number | null;
      lon?: number | null;
      t?: string;
      occ7?: number;
      src?: string;
      visible?: boolean;
      coords_status?: "public" | "restricted" | "missing";
      coords_source?: "exact" | "municipality" | "county" | "none";
      locality?: string | null;
      municipality?: string | null;
      county?: string | null;
      individualCount?: number | null;
      behavior?: string | null;
      collectors?: string | null;
      districts?: string | null;
      eestiOmavalitsused?: string | null;
    }
  > = (existingRow?.points_json && typeof existingRow.points_json === "object")
    ? existingRow.points_json as Record<string, { lat?: number | null; lon?: number | null; t?: string; occ7?: number; src?: string; visible?: boolean; coords_status?: "public" | "restricted" | "missing"; coords_source?: "exact" | "municipality" | "county" | "none"; locality?: string | null; municipality?: string | null; county?: string | null; individualCount?: number | null; behavior?: string | null; collectors?: string | null; districts?: string | null; eestiOmavalitsused?: string | null; }>
    : {};

  // --- NOTIFICATION PREP: snapshot previous points (t + occ7 only) for later comparison ---
  const previousPoints: Record<string, { t?: string; occ7?: number }> = {};
  try {
    for (const [k, v] of Object.entries(points)) {
      const vv = v as { t?: string; occ7?: number };
      previousPoints[k] = { t: vv?.t, occ7: vv?.occ7 };
    }
    console.log("[notify-prep] Snapshot previous state:", Object.keys(previousPoints).length, "species");
  } catch (e) {
    console.warn("[notify-prep] Could not snapshot previous points:", (e as Error).message);
  }

  let done = startIndex;
  let lastError: string | null = null;
  let upstreamMaxTs = 0;
  const MAX_RETRIES = 2;
  const INDEX_TIMEOUT_MS = 30000;
  for (let i = startIndex; i < total; i++) {
    const name = SPECIES[i];
    // Skip species not matching filter (debug single-species mode)
    if (speciesFilter && name.toLowerCase() !== speciesFilter) {
      done++;
      continue;
    }
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
              const srcTs = parseElurikkusDate(String(data.latestDate || ""));
              if (srcTs > upstreamMaxTs) upstreamMaxTs = srcTs;
              const entry: (typeof points)[string] = {
                src: "Elurikkus",
                visible: points[name]?.visible ?? true,
              };
              // Bug 2 fix: preserve existing t when new fetch returns no date, so snapshot doesn't lose stale date
              if (data.latestDate) {
                entry.t = data.latestDate;
              } else if (points[name]?.t) {
                entry.t = points[name].t;
              }
              // Always write lat/lon explicitly (including null) so the merge layer
              // overwrites stale numeric values rather than preserving them.
              entry.lat = data.lat ?? null;
              entry.lon = data.lon ?? null;
              entry.occ7 = data.occ7;
              entry.coords_status = data.coordsStatus;
              entry.coords_source = data.coordsSource;
              entry.locality = data.locality;
              entry.municipality = data.municipality;
              entry.county = data.county;
              if (data.individualCount != null) entry.individualCount = data.individualCount;
              if (data.behavior) entry.behavior = data.behavior;
              if (data.collectors) entry.collectors = data.collectors;
              if (data.districts) entry.districts = data.districts;
              if (data.eestiOmavalitsused) entry.eestiOmavalitsused = data.eestiOmavalitsused;
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
      return {
        done, total, finished: false, timedOut: true, lastError, points, runId,
        upstreamDataMaxAt: upstreamMaxTs > 0 ? new Date(upstreamMaxTs).toISOString() : null,
      };
    }
  }

  // --- NOTIFICATION TRIGGER: detect newly spotted species after a full refresh ---
  if (done >= total) {
    try {
      console.log(`[notify-check] done=${done} total=${total}`);
      const newlySpottedSpecies: string[] = [];
      for (const [name, newData] of Object.entries(points)) {
        const nd = newData as { t?: string; occ7?: number };
        const prev = previousPoints[name];

        if (!prev) {
          if (nd.t || (nd.occ7 || 0) > 0) {
            newlySpottedSpecies.push(name);
          }
          continue;
        }

        if (nd.t && nd.t !== prev.t && nd.t > (prev.t || "")) {
          newlySpottedSpecies.push(name);
          continue;
        }

        if ((nd.occ7 || 0) > 0 && (prev.occ7 || 0) === 0) {
          newlySpottedSpecies.push(name);
        }
      }

      if (newlySpottedSpecies.length > 0) {
        console.log(
          "[notify] Newly spotted:",
          newlySpottedSpecies.length,
          "species:",
          newlySpottedSpecies.slice(0, 15).join(", "),
        );
        const notifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notifications`;
        const notifyRes = await fetch(notifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": Deno.env.get("VAATLUSTE_WEBHOOK_SECRET") ?? "",
          },
          body: JSON.stringify({ species: newlySpottedSpecies }),
        });
        const notifyResult = await notifyRes.json().catch(() => ({}));
        console.log("[notify] Push result:", JSON.stringify(notifyResult));
      } else {
        console.log("[notify] No newly spotted species in this refresh");
      }
    } catch (e) {
      // CRITICAL: must NEVER break the snapshot refresh
      console.warn("[notify] Push notification trigger failed:", (e as Error).message);
    }
  }

  return {
    done, total, finished: done >= total, timedOut: false, lastError, points, runId,
    upstreamDataMaxAt: upstreamMaxTs > 0 ? new Date(upstreamMaxTs).toISOString() : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const u = new URL(req.url);
  const sp = u.searchParams;
  const mode = String(sp.get("mode") || sp.get("m") || "").trim().toLowerCase();
  const text = String(sp.get("text") || sp.get("q") || "").trim();
  const ping = sp.get("ping") === "1" || mode === "ping" || mode === "echo";
  console.log("[linnuliigid-snapshot] url=", u.toString(), "mode=", mode, "text=", text, "meta=", sp.get("meta"));
  if (ping) {
    return new Response(
      JSON.stringify(withSignature("ping", {
        ok: true,
        serverTime: new Date().toISOString(),
        received: {
          url: u.toString(),
          params: searchParamsToObject(sp),
        },
      })),
      { status: 200, headers: buildModeHeaders("ping") },
    );
  }
  const isElurikkusSpeciesMode = mode === "elurikkus_species";
  if (isElurikkusSpeciesMode) {
    return await handleElurikkusSpeciesRequest(req, u);
  }

  if (!SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify(withSignature("error", { ok: false, error: "SERVICE_ROLE_KEY missing" })), {
      status: 500,
      headers: buildModeHeaders("error"),
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const isMetaRequest = sp.get("meta") === "1";

  try {
    if (req.method === "GET" || req.method === "HEAD") {
      // Return current snapshot
      const { data, error } = await supabaseAdmin
        .from("linnuliigid_snapshot")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) throw error;
      const meta = buildSnapshotMeta(data as Record<string, unknown>);
      const isRebuildRequest = req.method === "GET" && sp.get("rebuild") === "1";
      if (isRebuildRequest) {
        const rebuild = await rebuildSnapshotNow(supabaseAdmin, data as Record<string, unknown>);
        const body = withSignature("rebuild", { ...(rebuild.body || {}) });
        return new Response(
          JSON.stringify(body),
          { status: rebuild.httpStatus, headers: buildModeHeaders("rebuild") }
        );
      }

      if (req.method === "GET" && isMetaRequest) {
        const metaBody = {
          ok: true,
          snapshotId: meta.snapshotId,
          snapshotGeneratedAt: meta.snapshotGeneratedAt,
          dataMaxAt: meta.dataMaxAt,
          bytes: meta.bytes,
          totalItems: meta.totalItems,
        };
        return new Response(
          JSON.stringify(withSignature("meta", metaBody)),
          {
            status: 200,
            headers: buildModeHeaders("meta"),
          }
        );
      }

      const responseHeaders = { ...buildSnapshotResponseHeaders(data as Record<string, unknown>), "X-EstBirding-Mode": "snapshot" };
      if (req.method === "HEAD") {
        return new Response(null, { status: 200, headers: responseHeaders });
      }

      const responseBody = {
        ok: true,
        ...(data as Record<string, unknown>),
        snapshotId: meta.snapshotId,
        snapshotBytes: meta.bytes,
        totalItems: meta.totalItems,
        snapshotGeneratedAt: meta.snapshotGeneratedAt,
        dataMaxAt: meta.dataMaxAt,
        dataMinAt: meta.dataMinAt,
      };
      return new Response(JSON.stringify(withSignature("snapshot", responseBody)), {
        headers: responseHeaders,
      });
    }

    if (req.method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = await req.json();
      } catch {
        body = {};
      }
      const isPublishRequest = sp.get("publish") === "1";
      if (isPublishRequest) {
        const providedToken = String(req.headers.get("x-publish-token") || "");
        if (!PUBLISH_TOKEN || providedToken !== PUBLISH_TOKEN) {
          return new Response(
            JSON.stringify(withSignature("error", { ok: false, error: "unauthorized_publish" })),
            { status: 401, headers: buildModeHeaders("error") }
          );
        }
        const nowIso = new Date().toISOString();
        const pointsJson = (body && typeof body.points_json === "object" && body.points_json)
          ? (body.points_json as Record<string, unknown>)
          : {};
        const generatedAt = String(body.generated_at || nowIso);
        const { error: publishError } = await updateSnapshot(supabaseAdmin, {
          points_json: pointsJson,
          status: "ready",
          progress_done: SPECIES.length,
          progress_total: SPECIES.length,
          generated_at: generatedAt,
          last_error: null,
          heartbeat_at: nowIso,
          running_started_at: nowIso,
        });
        if (publishError) throw publishError;
        const { data: updated, error: updatedError } = await selectSnapshotRow(supabaseAdmin);
        if (updatedError) throw updatedError;
        const meta = buildSnapshotMeta((updated || {}) as Record<string, unknown>);
        return new Response(
          JSON.stringify(withSignature("snapshot", {
            ok: true,
            action: "publish",
            snapshotId: meta.snapshotId,
            snapshotGeneratedAt: meta.snapshotGeneratedAt,
            dataMaxAt: meta.dataMaxAt,
            bytes: meta.bytes,
            totalItems: meta.totalItems,
          })),
          { status: 200, headers: buildModeHeaders("snapshot") }
        );
      }
      const action = String(body?.action || "").toLowerCase();
      const isRebuildPost = sp.get("rebuild") === "1"
        || action === "rebuild"
        || (action === "" && !Object.prototype.hasOwnProperty.call(body, "start_index"));

      const startIndex = Math.max(0, Number(body?.start_index || 0) || 0);
      const force = body?.force === true;
      // Debug-only: filter rebuild to a single species by name
      const speciesFilter = typeof body?.species === "string" ? body.species : "";
      const STALE_MS = 90000;
      const nowMs = Date.now();
      const nowIso = new Date().toISOString();
      const runId = crypto.randomUUID();

      const { data: current, error: currentError } = await selectSnapshotRow(supabaseAdmin);
      if (currentError) throw currentError;

      if (isRebuildPost) {
        const rebuild = await rebuildSnapshotNow(supabaseAdmin, (current || {}) as Record<string, unknown>);
        const bodyWithMode = withSignature("rebuild", { ...(rebuild.body || {}) });
        return new Response(
          JSON.stringify(bodyWithMode),
          { status: rebuild.httpStatus, headers: buildModeHeaders("rebuild") }
        );
      }

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
          JSON.stringify(withSignature("snapshot", {
            ok: true,
            action: "force_advance",
            status: updated?.status || (nextDone >= progressTotal ? "ready" : "running"),
            progress_done: Number(updated?.progress_done || nextDone),
            progress_total: Number(updated?.progress_total || progressTotal),
            generated_at: updated?.generated_at || null,
            points_json: points,
            last_error: updated?.last_error || nextError,
            heartbeat_at: heartbeatColumnAvailable ? ((updated as { heartbeat_at?: string | null })?.heartbeat_at || nowIso) : null,
          })),
          {
            status: 200,
            headers: buildModeHeaders("snapshot"),
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
          JSON.stringify(withSignature("snapshot", {
            ok: true,
            action: "force_takeover",
            status: updated?.status || "running",
            progress_done: Number(updated?.progress_done || 0),
            progress_total: Number(updated?.progress_total || SPECIES.length),
            last_error: updated?.last_error || nextError,
            heartbeat_at: heartbeatColumnAvailable ? ((updated as { heartbeat_at?: string | null })?.heartbeat_at || nowIso) : null,
          })),
          {
            status: 200,
            headers: buildModeHeaders("snapshot"),
          }
        );
      }
      if (action && action !== "start_refresh") {
        return new Response(
          JSON.stringify(withSignature("snapshot", { ok: false, error: "unknown_action", action })),
          { status: 400, headers: buildModeHeaders("snapshot") }
        );
      }

      if (current?.generated_at) {
        const elapsed = Date.now() - new Date(current.generated_at).getTime();
        const COOLDOWN_MS = 15 * 60 * 1000;
        if (elapsed < COOLDOWN_MS && current.status === "ready" && !force) {
          const retryAfter = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
          return new Response(
            JSON.stringify(withSignature("snapshot", {
              ok: false,
              error: "Refresh recently completed. Try again later.",
              retry_after_seconds: retryAfter,
            })),
            {
              status: 429,
              headers: buildModeHeaders("snapshot"),
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
          JSON.stringify(withSignature("snapshot", {
            ok: false,
            error: "already running",
            status: "running",
            heartbeat_at: (current as { heartbeat_at?: string | null })?.heartbeat_at || null,
            progress_done: current?.progress_done || 0,
            progress_total: current?.progress_total || SPECIES.length,
          })),
          {
            status: 409,
            headers: buildModeHeaders("snapshot"),
          }
        );
      }

      // Resume if already running (mid-batch continuation). Fresh start if previous was ready/empty.
      const isResume = current?.status === "running";
      const resumeStart = (speciesFilter || !isResume) ? 0 : Math.max(startIndex, Number(current?.progress_done || 0) || 0);
      const { error: startError } = await updateSnapshot(supabaseAdmin, {
        status: "running",
        progress_done: isResume ? (current?.progress_done || 0) : 0,
        progress_total: SPECIES.length,
        last_error: null,
        running_started_at: nowIso,
        heartbeat_at: nowIso,
        run_id: runId,
      });
      if (startError) throw startError;

      try {
        const result = await runRefresh(supabaseAdmin, { startIndex: resumeStart, runId, speciesFilter });
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
          JSON.stringify(withSignature("snapshot", responseBody)),
          {
            status: result.timedOut && !result.finished ? 202 : 200,
            headers: buildModeHeaders("snapshot"),
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
          JSON.stringify(withSignature("snapshot", {
            ok: false,
            status: "error",
            progress_done: Number(current?.progress_done || 0),
            progress_total: Number(current?.progress_total || SPECIES.length),
            generated_at: current?.generated_at || null,
            points_json: (current as { points_json?: unknown })?.points_json || {},
            last_error: msg,
            heartbeat_at: heartbeatColumnAvailable ? new Date().toISOString() : null,
          })),
          {
            status: 500,
            headers: buildModeHeaders("snapshot"),
          }
        );
      }
    }
    return new Response(JSON.stringify(withSignature("error", { ok: false, error: "Method not allowed" })), {
      status: 405,
      headers: buildModeHeaders("error"),
    });
  } catch (error: unknown) {
    console.error("Snapshot error:", error);
    return new Response(JSON.stringify(withSignature("error", { ok: false, error: (error as Error).message })), {
      status: 500,
      headers: buildModeHeaders("error"),
    });
  }
});

