import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-refresh-secret, apikey, authorization",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
};

const DEFAULT_SPECIES: string[] = [
  "Aed-põõsalind","Aed-roolind","Aedporr","Alk","Alverüdi","Ameerika piilpart","Atlantise tormilind","Aul","Baleaari tormilind","Euroopa kaelustäks","Habekakk","Habeviires","Hahk","Hakk","Hall-kärbsenäpp","Hallhaigur","Hallhani","Hallkibu","Hallpea-rähn","Hallpõsk-pütt","Hallrästas","Hallrüdi","Halltsiitsitaja","Hallvares","Hallõgija","Hangelind","Harakas","Haugaskotkas","Hele-urvalind","Heletilder","Herilaseviu","Hiireviu","Hoburästas","Händkakk","Hänilane","Hõbehaigur","Hõbehaugas","Hõbekajakas","Hüüp","Ida-mustvaeras","Jahipistrik","Jämejalg","Järvekaur","Jääkajakas","Jääkaur","Jääkoskel","Jõgi-ritsiklind","Jõgitiir","Jõgitilder","Jõgivästrik","Kadakatäks","Kaelus-kärbsenäpp","Kaelus-turteltuvi","Kaeluskotkas","Kaelusrästas","Kaelustuvi","Kalakajakas","Kalakotkas","Kalda-rädilind","Kaldapääsuke","Kaljukajakas","Kaljukotkas","Kanada lagle","Kanakull","Kanepilind","Karbuskajakas","Karkjalg","Karmiinleevike","Karvasjalg-kakk","Karvasjalg-viu","Kassikakk","Kiivitaja","Kiripugu-rüdi","Kirjuhahk","Kivikakk","Kivirullija","Kivitäks","Kodukakk","Kodutuvi","Koduvarblane","Koldhaigur","Koldjalg-hõbekajakas","Koldvint","Kormoran","Krüüsel","Kukkurtihane","Kuld-lehelind","Kuldhänilane","Kuldnokk","Kuldtsiitsitaja","Kuninghahk","Kuuse-käbilind","Käblik","Kägu","Käharpelikan","Käosulane","Kääbuskormoran","Kääbuskotkas","Kõnnuõgija","Kõrbe-kivitäks","Kõrbe-põõsalind","Kõrkja-roolind","Kõrvukräts","Kõvernokk-rüdi","Kühmnokk-luik","Künnivares","Laanenäär","Laanepüü","Laanerähn","Laisaba-änn","Lammitilder","Lapi tsiitsitaja","Lasuurtihane","Lauk","Laululuik","Laulurästas","Leeterüdi","Leevike","Liiv-kivitäks","Liivatüll","Linavästrik","Loorkakk","Luitsnokk-iibis","Luitsnokk-part","Lumehani","Lumekakk","Lääne-lehelind","Lääne-pöialpoiss","Lõopistrik","Lõuna-hõbekajakas","Lühinokk-hani","Madukotkas","Mandariinpart","Merikajakas","Merikotkas","Merirüdi","Merisk","Merivart","Mesilasenäpp","Mets-lehelind","Metsis","Metskiur","Metskurvits","Metstilder","Metsvint","Mudanepp","Mudatilder","Must-harksaba","Must-kärbsenäpp","Must-lepalind","Must-toonekurg","Mustjalg-tüll","Mustkael-pütt","Mustkurk-raat","Mustlagle","Mustlauk-õgija","Mustpea-põõsalind","Mustpea-tsiitsitaja","Mustpugu-rästas","Musträhn","Musträstas","Mustsaba-vigle","Musttihane","Mustvaeras","Mustvares","Mustviires","Mägi-kanepilind","Mägikiur","Männi-käbilind","Männileevike","Männitalvike","Mänsak","Naaskelnokk","Naerukajakas","Naerutiir","Niidu-kaelustäks","Niidu-ritsiklind","Niidukiur","Nunn-kivitäks","Nurmkana","Nõgipart","Nõlva-lehelind","Nõmmekiur","Nõmmelõoke","Ohakalind","Ohhoota hõbekajakas","Padu-roolind","Pasknäär","Peegel-tormilind","Pelikan","Peoleo","Piilpart","Piiritaja","Pikksaba-änn","Plütt","Plüü","Polaarkajakas","Porr","Prillvaeras","Pruunselg-põõsalind","Puna-harksaba","Puna-veetallaja","Punajalg-pistrik","Punajalg-tilder","Punakael-lagle","Punakurk-kaur","Punanokk-vart","Punapea-vart","Punapea-õgija","Punarind","Punasaba-õgija","Punaselg-õgija","Purpurhaigur","Puukoristaja","Põhja-kirjurästas","Põhja-lehelind","Põhja-tormipääsu","Põhjatihane","Põhjatsiitsitaja","Põhjavint","Põldlõoke","Põldtsiitsitaja","Põldvarblane","Põldvutt","Pöialpoiss","Rabapistrik","Rabapüü","Raisakotkas","Randkajakas","Randkiur","Randtiir","Rasvatihane","Raudkull","Ristpart","Roherähn","Rohevint","Rohukoskel","Rohunepp","Ronk","Roo-loorkull","Roo-ritsiklind","Roohabekas","Rooruik","Roosa-kuldnokk","Roosakajakas","Roosatiir","Roostepääsuke","Roosterind-tüll","Rootsiitsitaja","Rubiinööbik","Rukkirääk","Ruugerüdi","Rägapart","Rästas-roolind","Räusktiir","Rääkspart","Räästapääsuke","Rüüt","Sabatihane","Salu-lehelind","Salupäll","Salutihane","Sarviklõoke","Sarvikpütt","Siberi lehelind","Siberi raat","Siidhaigur","Siidisaba","Siisike","Sinikael-part","Siniraag","Sinirind","Sinisaba","Sinitihane","Soo-loorkull","Soo-roolind","Sookiur","Sookurg","Soopart","Sooräts","Soorüdi","Stepi-loorkull","Stepikajakas","Stepikiivitaja","Stepikotkas","Stepipistrik","Stepiviu","Suitsupääsuke","Suula","Suur-kirjurähn","Suur-konnakotkas","Suur-laukhani","Suurkoovitaja","Suurnokk-vint","Suurrüdi","Suuränn","Sõtkas","Söödikänn","Tait","Talvike","Tamme-kirjurähn","Teder","Tiigi-roolind","Tikutaja","Triip-ritsiklind","Tuhk-lehelind","Tumetilder","Tundra-rabahani","Tundrakaur","Tundrakiur","Tutkas","Tutt-tihane","Tutt-tiir","Tuttlõoke","Tuttpütt","Tuttvart","Tuuletallaja","Täpikhuik","Tõmmu-lehelind","Tõmmuiibis","Tõmmukajakas","Tõmmuvaeras","Urvalind","Vaaraohani","Vaenukägu","Vainurästas","Valge-toonekurg","Valgepõsk-lagle","Valgeselg-kirjurähn","Valgesilm-vart","Valgetiib-viires","Veetallaja","Veisehaigur","Vesipapp","Vihitaja","Viupart","Väike-kirjurähn","Väike-konnakotkas","Väike-käosulane","Väike-kärbsenäpp","Väike-laukhani","Väike-lehelind","Väike-põõsalind","Väikealk","Väikehuik","Väikehüüp","Väikekajakas","Väikekoovitaja","Väikekoskel","Väikeluik","Väikepistrik","Väikepütt","Väikerüdi","Väiketiir","Väiketrapp","Väiketsiitsitaja","Väiketüll","Välja-loorkull","Välja-väikelõoke","Värbkakk","Värbrüdi","Väänkael","Võsa-ritsiklind","Võsaraat","Vööt-käbilind","Vööt-põõsalind","Vööthani","Vöötkakk","Vöötnokk-kajakas","Vöötsaba-vigle","Õõnetuvi","Ööbik","Ööhaigur","Öösorr","Väike-lumehani","Tulipart","Siberi tõmmuvaeras","Lannuvart","Sini-rägapart","Ameerika viupart","Suurtrapp","Stepivuril","Suur-turteltuvi","Kanada kurg","Neitsikurg","Värbhuik","Tundrarüüt","Valgesaba-kiivitaja","Kõrbetüll","Tundra-neppvigle","Ameerika vihitaja","Suur-veetallaja","Älverüdi","Pikkjalg-rüdi","Stepi-pääsujooksur","Kõnnu-pääsujooksur","Harksaba-kajakas","Vandelkajakas","Põhja-tormilind","Vahemere tormilind","Suurpiiritaja","Randpiiritaja","Raipekotkas","Kumai-kaeluskotkas","Kääpakotkas","Stepi-tuuletallaja","Mongoolia kõnnuõgija","Punasaba-kõnnuõgija","Taigatihane","Stepilõoke","Leet-käosulane","Tarna-roolind","Kivipääsuke","Vööt-lehelind","Punakurk-põõsalind","Ruskerästas","Kivisiirak","Mägiraat","Idahänilane","Mongoolia kiur","Taigakiur","Kõrbeleevike","Punapea-tsiitsitaja","Rebassidrik","Ameerika väikeluik","Lääne-mustlagle","Kirde-mustlagle","Grööni suur-laukhani","Aafrika harksaba","Stepi-hallõgija","Lääne-sabatihane","Siseaasia must-lepalind","Mustpea-hänilane","Tõmmu-linavästrik","Mustluik","Eskimo lagle","Mõrsjapart","Sõnnpea-sõtkas","Läänesõtkas","Kübarkoskel","Kuupart","Puna-rägapart","Heleflamingo","Hiid-merikotkas","Tutt-karakaara","Ameerika tuuletallaja",
];

const DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractNewestIsoFromSearch(html: string): string | null {
  // Match YYYY-MM-DD dates
  const isoMatches = html.match(/\b(\d{4})-(\d{2})-(\d{2})\b/g) || [];
  // Match DD.MM.YYYY dates
  const euMatches = html.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g) || [];

  const dates: string[] = [];

  for (const d of isoMatches) {
    const [y, m, day] = d.split("-").map(Number);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
      dates.push(d);
    }
  }

  for (const d of euMatches) {
    const parts = d.split(".");
    const day = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
      dates.push(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }

  if (dates.length === 0) return null;
  dates.sort();
  return dates[dates.length - 1];
}

function extractDetailUrl(html: string, _species: string): string | null {
  const match = html.match(/href=["']?(\/occurrences\/(\d+))/);
  if (match) return `https://elurikkus.ee${match[1]}`;
  // Also try full URLs
  const full = html.match(/https?:\/\/elurikkus\.ee\/occurrences\/(\d+)/);
  if (full) return full[0];
  return null;
}

function extractOcc7FromHtml(html: string): number {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  let count = 0;

  // Parse table rows looking for dates
  const rowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const cellText = match[1].replace(/<[^>]+>/g, "").trim();
    // Try ISO date
    const isoMatch = cellText.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const ts = Date.parse(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00Z`);
      if (Number.isFinite(ts) && now - ts >= 0 && now - ts <= sevenDays) count++;
      continue;
    }
    // Try EU date
    const euMatch = cellText.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (euMatch) {
      const ts = Date.parse(`${euMatch[3]}-${euMatch[2]}-${euMatch[1]}T12:00:00Z`);
      if (Number.isFinite(ts) && now - ts >= 0 && now - ts <= sevenDays) count++;
    }
  }

  return count;
}

async function fetchDetailCoords(
  detailUrl: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const html = await fetchWithTimeout(detailUrl, 10000);

    // Try JSON-like patterns: "lat":59.1234 / "lng":24.5678
    const latJson = html.match(/"lat"\s*:\s*(-?\d+\.?\d*)/);
    const lonJson =
      html.match(/"lng"\s*:\s*(-?\d+\.?\d*)/) ||
      html.match(/"lon"\s*:\s*(-?\d+\.?\d*)/);
    if (latJson && lonJson) {
      const lat = parseFloat(latJson[1]);
      const lon = parseFloat(lonJson[1]);
      if (lat >= 57 && lat <= 60 && lon >= 21 && lon <= 29) {
        return { lat, lon };
      }
    }

    // Try data attributes
    const dataLat = html.match(/data-lat=["'](-?\d+\.?\d*)/);
    const dataLon =
      html.match(/data-lng=["'](-?\d+\.?\d*)/) ||
      html.match(/data-lon=["'](-?\d+\.?\d*)/);
    if (dataLat && dataLon) {
      const lat = parseFloat(dataLat[1]);
      const lon = parseFloat(dataLon[1]);
      if (lat >= 57 && lat <= 60 && lon >= 21 && lon <= 29) {
        return { lat, lon };
      }
    }

    // Try decimal coordinate pairs in Estonia bbox
    const coordPairs = html.matchAll(
      /(\d{2}\.\d{3,7})\s*[,;\s]\s*(\d{2}\.\d{3,7})/g,
    );
    for (const cp of coordPairs) {
      const a = parseFloat(cp[1]);
      const b = parseFloat(cp[2]);
      // lat, lon order
      if (a >= 57 && a <= 60 && b >= 21 && b <= 29) return { lat: a, lon: b };
      // lon, lat order
      if (b >= 57 && b <= 60 && a >= 21 && a <= 29) return { lat: b, lon: a };
    }

    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Auth check
  const secret = req.headers.get("x-refresh-secret") || "";
  const expected = Deno.env.get("ELURIKKUS_REFRESH_SECRET") || "";
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const t0 = Date.now();

  // Parse optional species list from body
  let species: string[] = DEFAULT_SPECIES;
  try {
    const body = await req.json();
    if (body && Array.isArray(body.species) && body.species.length > 0) {
      species = body.species.map((s: unknown) => String(s).trim()).filter(Boolean);
    }
  } catch {
    // Empty or invalid body — use defaults
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase env vars" }),
      { status: 500, headers: corsHeaders },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let updated = 0;
  const errors: { name: string; error: string }[] = [];

  for (let i = 0; i < species.length; i++) {
    const name = species[i];
    try {
      const searchUrl = `https://elurikkus.ee/app/occurrences/search?text=${encodeURIComponent(name)}`;
      const html = await fetchWithTimeout(searchUrl, 10000);

      const t = extractNewestIsoFromSearch(html);
      const occ7 = extractOcc7FromHtml(html);
      const detailUrl = extractDetailUrl(html, name);

      let lat: number | null = null;
      let lon: number | null = null;
      let coordsStatus = "missing";

      if (detailUrl) {
        const coords = await fetchDetailCoords(detailUrl);
        if (coords) {
          lat = coords.lat;
          lon = coords.lon;
          coordsStatus = "public";
        } else {
          coordsStatus = "restricted";
        }
      }

      const { error } = await supabase.from("elurikkus_cache").upsert(
        {
          species_name: name,
          lat,
          lon,
          occ7,
          t,
          coords_status: coordsStatus,
          coords_source: detailUrl ? "detail" : "search",
          open_url: detailUrl || searchUrl,
          search_url: searchUrl,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "species_name" },
      );

      if (error) {
        errors.push({ name, error: `DB: ${error.message}` });
      } else {
        updated++;
      }
    } catch (e) {
      errors.push({ name, error: String(e) });
    }

    if (i < species.length - 1) await delay(DELAY_MS);
  }

  const duration_ms = Date.now() - t0;
  const result = {
    done: species.length,
    updated,
    errors: errors.length,
    error_details: errors.slice(0, 20),
    duration_ms,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: corsHeaders,
  });
});
