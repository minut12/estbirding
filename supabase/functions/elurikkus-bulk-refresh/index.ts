import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-refresh-secret, apikey, authorization",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
};

const DEFAULT_SPECIES: string[] = [
  "Aed-põõsalind","Aed-roolind","Aedporr","Alk","Alverüdi","Ameerika piilpart","Atlantise tormilind","Aul","Baleaari tormilind","Euroopa kaelustäks","Habekakk","Habeviires","Hahk","Hakk","Hall-kärbsenäpp","Hallhaigur","Hallhani","Hallkibu","Hallpea-rähn","Hallpõsk-pütt","Hallrästas","Hallrüdi","Halltsiitsitaja","Hallvares","Hallõgija","Hangelind","Harakas","Haugaskotkas","Hele-urvalind","Heletilder","Herilaseviu","Hiireviu","Hoburästas","Händkakk","Hänilane","Hõbehaigur","Hõbehaugas","Hõbekajakas","Hüüp","Ida-mustvaeras","Jahipistrik","Jämejalg","Järvekaur","Jääkajakas","Jääkaur","Jääkoskel","Jõgi-ritsiklind","Jõgitiir","Jõgitilder","Jõgivästrik","Kadakatäks","Kaelus-kärbsenäpp","Kaelus-turteltuvi","Kaeluskotkas","Kaelusrästas","Kaelustuvi","Kalakajakas","Kalakotkas","Kalda-rädilind","Kaldapääsuke","Kaljukajakas","Kaljukotkas","Kanada lagle","Kanakull","Kanepilind","Karbuskajakas","Karkjalg","Karmiinleevike","Karvasjalg-kakk","Karvasjalg-viu","Kassikakk","Kiivitaja","Kiripugu-rüdi","Kirjuhahk","Kivikakk","Kivirullija","Kivitäks","Kodukakk","Kodutuvi","Koldhaigur","Koldjalg-hõbekajakas","Koldvint","Kormoran","Krüüsel","Kukkurtihane","Kuld-lehelind","Kuldhänilane","Kuldnokk","Kuldtsiitsitaja","Kuninghahk","Kuuse-käbilind","Käblik","Kägu","Käharpelikan","Käosulane","Kääbuskormoran","Kääbuskotkas","Kõnnuõgija","Kõrbe-kivitäks","Kõrbe-põõsalind","Kõrkja-roolind","Kõrvukräts","Kõvernokk-rüdi","Kühmnokk-luik","Künnivares","Laanenäär","Laanepüü","Laanerähn","Laisaba-änn","Lammitilder","Lapi tsiitsitaja","Lasuurtihane","Lauk","Laululuik","Laulurästas","Leeterüdi","Leevike","Liiv-kivitäks","Liivatüll","Linavästrik","Loorkakk","Luitsnokk-iibis","Luitsnokk-part","Lumehani","Lumekakk","Lääne-lehelind","Lääne-pöialpoiss","Lõopistrik","Lõuna-hõbekajakas","Lühinokk-hani","Madukotkas","Mandariinpart","Merikajakas","Merikotkas","Merirüdi","Merisk","Merivart","Mesilasenäpp","Mets-lehelind","Metsis","Metskiur","Metskurvits","Metstilder","Metsvint","Mudanepp","Mudatilder","Must-harksaba","Must-kärbsenäpp","Must-lepalind","Must-toonekurg","Mustjalg-tüll","Mustkael-pütt","Mustkurk-raat","Mustlagle","Mustlauk-õgija","Mustpea-põõsalind","Mustpea-tsiitsitaja","Mustpugu-rästas","Musträhn","Musträstas","Mustsaba-vigle","Musttihane","Mustvaeras","Mustvares","Mustviires","Mägi-kanepilind","Mägikiur","Männi-käbilind","Männileevike","Männitalvike","Mänsak","Naaskelnokk","Naerukajakas","Naerutiir","Niidu-kaelustäks","Niidu-ritsiklind","Niidukiur","Nunn-kivitäks","Nurmkana","Nõgipart","Nõlva-lehelind","Nõmmekiur","Nõmmelõoke","Ohakalind","Ohhoota hõbekajakas","Padu-roolind","Pasknäär","Peegel-tormilind","Pelikan","Peoleo","Piilpart","Piiritaja","Pikksaba-änn","Plütt","Plüü","Polaarkajakas","Porr","Prillvaeras","Pruunselg-põõsalind","Puna-harksaba","Puna-veetallaja","Punajalg-pistrik","Punajalg-tilder","Punakael-lagle","Punakurk-kaur","Punanokk-vart","Punapea-vart","Punapea-õgija","Punarind","Punasaba-õgija","Punaselg-õgija","Purpurhaigur","Puukoristaja","Põhja-kirjurästas","Põhja-lehelind","Põhja-tormipääsu","Põhjatihane","Põhjatsiitsitaja","Põhjavint","Põldlõoke","Põldtsiitsitaja","Põldvarblane","Põldvutt","Pöialpoiss","Rabapistrik","Rabapüü","Raisakotkas","Randkajakas","Randkiur","Randtiir","Rasvatihane","Raudkull","Ristpart","Roherähn","Rohevint","Rohukoskel","Rohunepp","Ronk","Roo-loorkull","Roo-ritsiklind","Roohabekas","Rooruik","Roosa-kuldnokk","Roosakajakas","Roosatiir","Roostepääsuke","Roosterind-tüll","Rootsiitsitaja","Rubiinööbik","Rukkirääk","Ruugerüdi","Rägapart","Rästas-roolind","Räusktiir","Rääkspart","Räästapääsuke","Rüüt","Sabatihane","Salu-lehelind","Salupäll","Salutihane","Sarviklõoke","Sarvikpütt","Siberi lehelind","Siberi raat","Siidhaigur","Siidisaba","Siisike","Sinikael-part","Siniraag","Sinirind","Sinisaba","Sinitihane","Soo-loorkull","Soo-roolind","Sookiur","Sookurg","Soopart","Sooräts","Soorüdi","Stepi-loorkull","Stepikajakas","Stepikiivitaja","Stepikotkas","Stepipistrik","Stepiviu","Suitsupääsuke","Suula","Suur-kirjurähn","Suur-konnakotkas","Suur-laukhani","Suurkoovitaja","Suurnokk-vint","Suurrüdi","Suuränn","Sõtkas","Söödikänn","Tait","Talvike","Tamme-kirjurähn","Teder","Tiigi-roolind","Tikutaja","Triip-ritsiklind","Tuhk-lehelind","Tumetilder","Tundra-rabahani","Tundrakaur","Tundrakiur","Tutkas","Tutt-tihane","Tutt-tiir","Tuttlõoke","Tuttpütt","Tuttvart","Tuuletallaja","Täpikhuik","Tõmmu-lehelind","Tõmmuiibis","Tõmmukajakas","Tõmmuvaeras","Urvalind","Vaaraohani","Vaenukägu","Vainurästas","Valge-toonekurg","Valgepõsk-lagle","Valgeselg-kirjurähn","Valgesilm-vart","Valgetiib-viires","Veetallaja","Veisehaigur","Vesipapp","Vihitaja","Viupart","Väike-kirjurähn","Väike-konnakotkas","Väike-käosulane","Väike-kärbsenäpp","Väike-laukhani","Väike-lehelind","Väike-põõsalind","Väikealk","Väikehuik","Väikehüüp","Väikekajakas","Väikekoovitaja","Väikekoskel","Väikeluik","Väikepistrik","Väikepütt","Väikerüdi","Väiketiir","Väiketrapp","Väiketsiitsitaja","Väiketüll","Välja-loorkull","Välja-väikelõoke","Värbkakk","Värbrüdi","Väänkael","Võsa-ritsiklind","Võsaraat","Vööt-käbilind","Vööt-põõsalind","Vööthani","Vöötkakk","Vöötnokk-kajakas","Vöötsaba-vigle","Õõnetuvi","Ööbik","Ööhaigur","Öösorr","Väike-lumehani","Tulipart","Siberi tõmmuvaeras","Lannuvart","Sini-rägapart","Ameerika viupart","Suurtrapp","Stepivuril","Suur-turteltuvi","Kanada kurg","Neitsikurg","Värbhuik","Tundrarüüt","Valgesaba-kiivitaja","Kõrbetüll","Tundra-neppvigle","Ameerika vihitaja","Suur-veetallaja","Älverüdi","Pikkjalg-rüdi","Stepi-pääsujooksur","Kõnnu-pääsujooksur","Harksaba-kajakas","Vandelkajakas","Põhja-tormilind","Vahemere tormilind","Suurpiiritaja","Randpiiritaja","Raipekotkas","Kumai-kaeluskotkas","Kääpakotkas","Stepi-tuuletallaja","Mongoolia kõnnuõgija","Punasaba-kõnnuõgija","Taigatihane","Stepilõoke","Leet-käosulane","Tarna-roolind","Kivipääsuke","Vööt-lehelind","Punakurk-põõsalind","Ruskerästas","Kivisiirak","Mägiraat","Idahänilane","Mongoolia kiur","Taigakiur","Kõrbeleevike","Punapea-tsiitsitaja","Rebassidrik","Ameerika väikeluik","Lääne-mustlagle","Kirde-mustlagle","Grööni suur-laukhani","Aafrika harksaba","Stepi-hallõgija","Lääne-sabatihane","Siseaasia must-lepalind","Mustpea-hänilane","Tõmmu-linavästrik","Mustluik","Eskimo lagle","Mõrsjapart","Sõnnpea-sõtkas","Läänesõtkas","Kübarkoskel","Kuupart","Puna-rägapart","Heleflamingo","Hiid-merikotkas","Tutt-karakaara","Ameerika tuuletallaja",
];

const DELAY_MS = 600;

// Centroid tables duplicated from linnuliigid-snapshot (consolidation TBD).
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
  // Birding hotspots (peninsulas, capes, nature reserves)
  sorve: { lat: 57.92, lon: 22.05 },
  poosaspea: { lat: 59.23, lon: 23.55 },
  puise: { lat: 58.85, lon: 23.50 },
  pakri: { lat: 59.39, lon: 24.05 },
  kopu: { lat: 58.92, lon: 22.20 },
  vilsandi: { lat: 58.38, lon: 21.83 },
  kaina: { lat: 58.83, lon: 22.78 },
  matsalu: { lat: 58.74, lon: 23.71 },
  audru: { lat: 58.40, lon: 24.34 },
  // Missing municipalities
  haademeeste: { lat: 58.07, lon: 24.50 },
  laane_nigula: { lat: 58.95, lon: 23.81 },
  // Towns / smaller cities
  maardu: { lat: 59.476, lon: 25.025 },
  sillamae: { lat: 59.395, lon: 27.766 },
  kohtla_jarve: { lat: 59.40, lon: 27.28 },
  keila: { lat: 59.305, lon: 24.418 },
  saue: { lat: 59.32, lon: 24.55 },
  poltsamaa: { lat: 58.65, lon: 25.97 },
  turi: { lat: 58.81, lon: 25.43 },
  elva: { lat: 58.22, lon: 26.42 },
  mustvee: { lat: 58.85, lon: 26.93 },
  tapa: { lat: 59.27, lon: 25.96 },
  antsla: { lat: 57.83, lon: 26.54 },
  otepaa: { lat: 58.06, lon: 26.49 },
  kallaste: { lat: 58.66, lon: 27.16 },
};

function normalizeName(v: unknown): string {
  return String(v || "").toLowerCase()
    .replace(/[ä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[õ]/g, "o")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractMunicipalityFromLocality(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(
    /([A-Za-zÀ-ž]+(?:-[A-Za-zÀ-ž]+)*(?:\s+[A-Za-zÀ-ž]+(?:-[A-Za-zÀ-ž]+)*)*\s+(?:vald|linn))/i,
  );
  return m ? m[1].trim() : null;
}

interface ResolvedPick {
  obs: ParsedObservation;
  idx: number;
  lat: number;
  lon: number;
  coords_source: string;
  coords_status: string;
}

function pickResolvedObs(observations: ParsedObservation[]): ResolvedPick | null {
  for (let i = 0; i < observations.length; i++) {
    const o = observations[i];
    if (Number.isFinite(o.lat as number) && Number.isFinite(o.lon as number)) {
      return { obs: o, idx: i, lat: o.lat as number, lon: o.lon as number, coords_source: "exact", coords_status: "public" };
    }
    if (o.locality) {
      const mKey = normalizeName(o.locality)
        .replace(/_linn$/, "").replace(/_vald$/, "").replace(/_alev$/, "").replace(/_alevik$/, "");
      const mCentroid = mKey ? MUNICIPALITY_CENTROIDS[mKey] : null;
      if (mCentroid) {
        return { obs: o, idx: i, lat: mCentroid.lat, lon: mCentroid.lon, coords_source: "municipality_centroid", coords_status: "restricted" };
      }
      const lower = o.locality.toLowerCase();
      let subHit: { lat: number; lon: number } | null = null;
      for (const key of Object.keys(MUNICIPALITY_CENTROIDS)) {
        if (lower.includes(key)) { subHit = MUNICIPALITY_CENTROIDS[key]; break; }
      }
      if (subHit) {
        return { obs: o, idx: i, lat: subHit.lat, lon: subHit.lon, coords_source: "municipality_centroid", coords_status: "restricted" };
      }
    }
    if (o.county) {
      const cKey = normalizeName(o.county).replace(/_county$/, "").replace(/_maakond$/, "");
      const cCentroid = cKey ? COUNTY_CENTROIDS[cKey] : null;
      if (cCentroid) {
        return { obs: o, idx: i, lat: cCentroid.lat, lon: cCentroid.lon, coords_source: "county_centroid", coords_status: "restricted" };
      }
    }
  }
  return null;
}

interface ParsedObservation {
  sub_id: string | null;
  observed_at: string; // ISO date YYYY-MM-DD
  locality: string | null;
  municipality: string | null;
  county: string | null;
  lat: number | null;
  lon: number | null;
  observer: string | null;
  individual_count: number | null;
  behavior: string | null;
}

interface ObservationParseResult {
  observations: ParsedObservation[];
  skippedNoDate: number;
  skippedFuture: number;
}

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

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanCellText(cellHtml: string): string {
  return decodeEntities(cellHtml
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*$/g, "")
    .trim());
}

function parseEstonianDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    const day = Number(d), month = Number(m), year = Number(y);
    if (year >= 2000 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:\b|\s|T)/);
  if (isoDate) {
    const y = Number(isoDate[1]), m = Number(isoDate[2]), d = Number(isoDate[3]);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
    }
  }

  const isoTimestamp = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoTimestamp) return isoTimestamp[1];
  return null;
}

function parseCoordsFromCell(text: string): { lat: number | null; lon: number | null } {
  const pair = text.match(/(-?\d{1,3}\.\d{2,7})\s*[,;\s]\s*(-?\d{1,3}\.\d{2,7})/);
  if (pair) {
    const a = parseFloat(pair[1]);
    const b = parseFloat(pair[2]);
    if (a >= 57 && a <= 60 && b >= 21 && b <= 29) return { lat: a, lon: b };
    if (b >= 57 && b <= 60 && a >= 21 && a <= 29) return { lat: b, lon: a };
  }
  return { lat: null, lon: null };
}

function normalizeHeaderLabel(cellHtml: string): string {
  return cleanCellText(cellHtml).toLowerCase();
}

function buildColumnIndex(cells: string[]): Record<string, number> {
  const colIndex: Record<string, number> = {};
  cells.forEach((cell, i) => {
    const label = normalizeHeaderLabel(cell);
    if (label.includes("vaatleja") || label.includes("observer") || label.includes("collector")) {
      colIndex.observer = i;
    } else if (label.includes("kuupäev") || label.includes("date") || label.includes("observed")) {
      colIndex.observed_at = i;
    } else if (label.includes("asukoht") || label.includes("locality") || label.includes("place")) {
      colIndex.locality = i;
    } else if (label.includes("maakond") || label.includes("county")) {
      colIndex.county = i;
    } else if (label.includes("arv") || label.includes("count") || label.includes("isendi")) {
      colIndex.individual_count = i;
    } else if (label.includes("käitumine") || label.includes("behavior")) {
      colIndex.behavior = i;
    }
  });
  return colIndex;
}

function parseObservationsFromHtml(html: string, species?: string): ObservationParseResult {
  const todayIso = new Date().toISOString().slice(0, 10);
  const observations: ParsedObservation[] = [];
  let skippedNoDate = 0;
  let skippedFuture = 0;
  let colIndex: Record<string, number> = {};

  // JSON pre-pass: extract real GPS from SvelteKit-fetched JSON block
  const sveltekitRe = /<script type="application\/json" data-sveltekit-fetched data-url="https:\/\/elurikkus\.ee\/api\/occurrences\/search"[^>]*>([\s\S]*?)<\/script>/;
  const m = html.match(sveltekitRe);
  const coordsBySubId = new Map<string, { lat: number | null; lon: number | null; municipality: string | null; county: string | null; locality: string | null }>();
  if (m) {
    try {
      const envelope = JSON.parse(m[1]);
      const inner = typeof envelope.body === "string" ? JSON.parse(envelope.body) : envelope.body;
      for (const r of (inner?.results ?? [])) {
        const id = r?.id != null ? String(r.id) : "";
        if (!id) continue;
        const lat = Number(r.latitude);
        const lon = Number(r.longitude);
        coordsBySubId.set(id, {
          lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
          lon: Number.isFinite(lon) && lon !== 0 ? lon : null,
          municipality: r.municipality || null,
          county: r.county || null,
          locality: r.locality || null,
        });
      }
    } catch (_e) {
      // leave map empty; row parser still extracts text fields
    }
  }

  // Iterate <tr>...</tr>
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    // Extract cells
    const cells: string[] = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }
    if (cells.length === 0) continue;

    const isHeaderRow = /<th\b/i.test(rowHtml);
    if (isHeaderRow) {
      colIndex = buildColumnIndex(cells);
      continue;
    }

    const cellTexts = cells.map((c) => cleanCellText(c));

    const dateText = colIndex.observed_at !== undefined ? cellTexts[colIndex.observed_at] : cellTexts.find((t) => parseEstonianDate(t));
    const observed_at = parseEstonianDate(dateText);
    if (!observed_at) {
      if (cellTexts.some(Boolean)) skippedNoDate++;
      continue;
    }
    if (observed_at > todayIso) {
      skippedFuture++;
      continue;
    }

    // sub_id from /occurrences/<id> link or data-record-id
    let sub_id: string | null = null;
    const subFromLink = rowHtml.match(/\/occurrences\/(?:occurrence\/)?(\d+)/);
    if (subFromLink) sub_id = subFromLink[1];
    if (!sub_id) {
      const dataAttr = rowHtml.match(/data-record-id=["']([^"']+)/i);
      if (dataAttr) sub_id = dataAttr[1];
    }

    // Coords
    let lat: number | null = null;
    let lon: number | null = null;
    for (const c of cells) {
      const coords = parseCoordsFromCell(stripHtml(c));
      if (coords.lat !== null && coords.lon !== null) {
        lat = coords.lat;
        lon = coords.lon;
        break;
      }
    }

    const countText = colIndex.individual_count !== undefined ? cellTexts[colIndex.individual_count] : "";
    const count = countText.match(/\d{1,4}/)?.[0];
    const individual_count = count ? parseInt(count, 10) : null;
    const observer = colIndex.observer !== undefined ? cellTexts[colIndex.observer] || null : null;
    const locality = colIndex.locality !== undefined ? cellTexts[colIndex.locality] || null : null;
    const county = colIndex.county !== undefined ? cellTexts[colIndex.county] || null : null;
    const behavior = colIndex.behavior !== undefined ? cellTexts[colIndex.behavior] || null : null;

    const finalLocality = locality && locality.length <= 200 ? locality : null;

    // Merge JSON pre-pass coords/fields when available
    const j = sub_id ? coordsBySubId.get(String(sub_id)) : null;
    let mergedLat = lat;
    let mergedLon = lon;
    let mergedLocality: string | null = finalLocality;
    let mergedMunicipality: string | null = extractMunicipalityFromLocality(finalLocality);
    let mergedCounty: string | null = county && county.length <= 100 ? county : null;
    if (j) {
      if (j.lat != null && j.lon != null) {
        mergedLat = j.lat;
        mergedLon = j.lon;
      }
      mergedLocality = j.locality || mergedLocality || j.municipality || j.county || null;
      mergedMunicipality = j.municipality || mergedMunicipality || null;
      mergedCounty = j.county || mergedCounty || null;
    }

    observations.push({
      sub_id,
      observed_at,
      locality: mergedLocality,
      municipality: mergedMunicipality,
      county: mergedCounty,
      lat: mergedLat,
      lon: mergedLon,
      observer: observer && observer.length <= 200 ? observer : null,
      individual_count,
      behavior,
    });
  }
  console.log("[elu-parse]", species ?? "(unknown)", "jsonHits:", coordsBySubId.size, "rows:", observations.length);
  return { observations, skippedNoDate, skippedFuture };
}

function extractNewestIsoFromSearch(html: string): string | null {
  const todayIso = new Date().toISOString().slice(0, 10);
  const isoMatches = html.match(/\b(\d{4})-(\d{2})-(\d{2})\b/g) || [];
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

  const filtered = dates.filter((d) => d <= todayIso);
  if (filtered.length === 0) return null;
  filtered.sort();
  return filtered[filtered.length - 1];
}

function extractDetailUrl(html: string, _species: string): string | null {
  const match = html.match(/href=["']?(\/occurrences\/(\d+))/);
  if (match) return `https://elurikkus.ee${match[1]}`;
  const full = html.match(/https?:\/\/elurikkus\.ee\/occurrences\/(\d+)/);
  if (full) return full[0];
  return null;
}

function countWithin7Days(observations: ParsedObservation[]): number {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const o of observations) {
    const ts = Date.parse(`${o.observed_at}T12:00:00Z`);
    if (Number.isFinite(ts) && now - ts >= 0 && now - ts <= sevenDays) count++;
  }
  return count;
}

async function fetchDetailCoords(
  detailUrl: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const html = await fetchWithTimeout(detailUrl, 10000);

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

    const coordPairs = html.matchAll(
      /(\d{2}\.\d{3,7})\s*[,;\s]\s*(\d{2}\.\d{3,7})/g,
    );
    for (const cp of coordPairs) {
      const a = parseFloat(cp[1]);
      const b = parseFloat(cp[2]);
      if (a >= 57 && a <= 60 && b >= 21 && b <= 29) return { lat: a, lon: b };
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

  let species: string[];
  let bodyOffset = 0;
  const body = await req.json().catch(() => ({}));


  const secret = req.headers.get("x-refresh-secret") || "";
  const expected = Deno.env.get("ELURIKKUS_REFRESH_SECRET") || "";
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const t0 = Date.now();

  // ==================== SIZE MODE (read-only counting) ====================
  if (body?.mode === "size") {
    const ELU_API = "https://elurikkus.ee/api/occurrences/search";
    const YEARS = 3;
    const REQ_DELAY_MS = 300;
    const BUDGET_MS = 50000;
    const REQ_TIMEOUT_MS = 15000;

    const asOfStr: string = (typeof body?.as_of === "string" && body.as_of)
      || new Date().toISOString().slice(0, 10);
    const asOfDate = new Date(`${asOfStr}T00:00:00Z`);
    if (!Number.isFinite(asOfDate.getTime())) {
      return new Response(JSON.stringify({ error: "invalid as_of" }), { status: 400, headers: corsHeaders });
    }
    const fromDate = new Date(Date.UTC(
      asOfDate.getUTCFullYear() - YEARS,
      asOfDate.getUTCMonth(),
      asOfDate.getUTCDate(),
    ));
    const isoDay = (d: Date) => d.toISOString().slice(0, 10);
    const fromStr = isoDay(fromDate);
    const toStr = isoDay(asOfDate);

    // Working list rule: explicit `species` array wins; else if either `offset` or
    // `limit` is supplied we slice DEFAULT_SPECIES; else the working list is the
    // FULL DEFAULT_SPECIES array. `done` reflects completion of THIS working list.
    // A returned cursor / next_index is only valid when resent with identical
    // `species` / `offset` / `limit` as the request that produced it.
    let sizeSpecies: string[];
    const reqOffset: number | null = typeof body.offset === "number" ? Math.max(0, body.offset) : null;
    const reqLimit: number | null = typeof body.limit === "number" ? Math.max(1, Math.min(DEFAULT_SPECIES.length, body.limit)) : null;
    if (Array.isArray(body.species) && body.species.length > 0) {
      sizeSpecies = body.species.map((s: unknown) => String(s).trim()).filter(Boolean);
    } else if (reqOffset !== null || reqLimit !== null) {
      const off = reqOffset ?? 0;
      const lim = reqLimit ?? DEFAULT_SPECIES.length;
      sizeSpecies = DEFAULT_SPECIES.slice(off, off + lim);
    } else {
      sizeSpecies = DEFAULT_SPECIES.slice();
    }

    const results: Array<{ species: string; count: number | null; ok: boolean }> = [];
    const errors: string[] = [];
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let processed = 0;
    let done = true;
    let nextIndex: number | null = null;

    for (let i = 0; i < sizeSpecies.length; i++) {
      if (Date.now() - t0 > BUDGET_MS) {
        done = false;
        nextIndex = i;
        break;
      }
      const name = sizeSpecies[i];
      const reqBody = {
        q: `_text_:"${name}" AND event_date:[${fromStr} TO ${toStr}]`,
        fq: {},
        pagination: { offset: 0, limit: 1, order: { by: "event_datetime_point", ascending: false } },
        facets: [],
        fields: null,
      };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
      try {
        const res = await fetch(ELU_API, {
          method: "POST",
          headers: { "content-type": "application/json", "accept": "application/json" },
          body: JSON.stringify(reqBody),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const snippet = (await res.text().catch(() => "")).slice(0, 300);
          errors.push(`${name}: HTTP ${res.status} ${snippet}`);
          results.push({ species: name, count: null, ok: false });
        } else {
          const j = await res.json().catch(() => null) as { count?: unknown } | null;
          const c = j && typeof j.count === "number" ? j.count : null;
          if (c === null) {
            errors.push(`${name}: missing numeric count`);
            results.push({ species: name, count: null, ok: false });
          } else {
            results.push({ species: name, count: c, ok: true });
          }
        }
      } catch (e) {
        errors.push(`${name}: ${(e as Error).message}`);
        results.push({ species: name, count: null, ok: false });
      } finally {
        clearTimeout(timer);
      }
      processed++;
      if (i < sizeSpecies.length - 1) await delay(REQ_DELAY_MS);
    }

    results.sort((a, b) => (b.count ?? -1) - (a.count ?? -1));
    const okResults = results.filter((r) => r.ok);
    const totalRows = okResults.reduce((s, r) => s + (r.count || 0), 0);
    const estMb = Math.round((totalRows * 0.3 / 1024) * 10) / 10;

    return new Response(JSON.stringify({
      mode: "size",
      as_of: asOfStr,
      from: fromStr,
      to: toStr,
      done,
      next_index: done ? null : nextIndex,
      req_offset: reqOffset,
      req_limit: reqLimit,
      species_counted: processed,
      ok_count: okResults.length,
      failed_count: processed - okResults.length,
      total_rows: totalRows,
      est_mb: estMb,
      results,
      errors: errors.slice(0, 100),
      duration_ms: Date.now() - t0,
    }), { headers: { ...corsHeaders, "content-type": "application/json" }, status: 200 });
  }

  // ==================== BACKFILL MODE ====================
  if (body?.mode === "backfill") {
    const ELU_API = "https://elurikkus.ee/api/occurrences/search";
    const BACKFILL_YEARS = 3;
    const PAGE_LIMIT = 500;
    const MAX_OFFSET = 9500;
    const SPLIT_THRESHOLD = 9500;
    const REQ_DELAY_MS = 400;
    const BUDGET_MS = 50000;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env vars" }), { status: 500, headers: corsHeaders });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cursor = body?.cursor ?? null;
    const asOfStr: string = (cursor && typeof cursor.as_of === "string" && cursor.as_of)
      || (typeof body?.as_of === "string" && body.as_of)
      || new Date().toISOString().slice(0, 10);
    const asOfDate = new Date(`${asOfStr}T00:00:00Z`);
    if (!Number.isFinite(asOfDate.getTime())) {
      return new Response(JSON.stringify({ error: "invalid as_of" }), { status: 400, headers: corsHeaders });
    }
    const floorDate = new Date(Date.UTC(
      asOfDate.getUTCFullYear() - BACKFILL_YEARS,
      asOfDate.getUTCMonth(),
      asOfDate.getUTCDate(),
    ));

    // Working list rule: explicit `species` array wins; else if either `offset` or
    // `limit` is supplied we slice DEFAULT_SPECIES; else the working list is the
    // FULL DEFAULT_SPECIES array. `done` reflects completion of THIS working list.
    // A returned cursor is only valid when resent with identical
    // `species` / `offset` / `limit` as the request that produced it.
    let backfillSpecies: string[];
    const reqOffset: number | null = typeof body.offset === "number" ? Math.max(0, body.offset) : null;
    const reqLimit: number | null = typeof body.limit === "number" ? Math.max(1, Math.min(DEFAULT_SPECIES.length, body.limit)) : null;
    if (Array.isArray(body.species) && body.species.length > 0) {
      backfillSpecies = body.species.map((s: unknown) => String(s).trim()).filter(Boolean);
    } else if (reqOffset !== null || reqLimit !== null) {
      const off = reqOffset ?? 0;
      const lim = reqLimit ?? DEFAULT_SPECIES.length;
      backfillSpecies = DEFAULT_SPECIES.slice(off, off + lim);
    } else {
      backfillSpecies = DEFAULT_SPECIES.slice();
    }

    const stats = {
      requests: 0,
      windows_processed: 0,
      rows_seen: 0,
      rows_upserted: 0,
      name_mismatches: 0,
      future_dated: 0,
      truncated_windows: 0,
    };
    const backfillErrors: string[] = [];
    const species_processed: string[] = [];

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const budgetExceeded = () => Date.now() - t0 > BUDGET_MS;

    function buildYearWindows(): { from: Date; to: Date }[] {
      const out: { from: Date; to: Date }[] = [];
      const startY = asOfDate.getUTCFullYear();
      const endY = floorDate.getUTCFullYear();
      for (let y = startY; y >= endY; y--) {
        const yStart = new Date(Date.UTC(y, 0, 1));
        const yEnd = new Date(Date.UTC(y, 11, 31));
        const from = yStart.getTime() < floorDate.getTime() ? floorDate : yStart;
        const to = yEnd.getTime() > asOfDate.getTime() ? asOfDate : yEnd;
        if (from.getTime() <= to.getTime()) out.push({ from, to });
      }
      return out;
    }

    function buildMonthWindows(from: Date, to: Date): { from: Date; to: Date }[] {
      const out: { from: Date; to: Date }[] = [];
      let y = to.getUTCFullYear();
      let m = to.getUTCMonth();
      while (true) {
        const monStart = new Date(Date.UTC(y, m, 1));
        const monEnd = new Date(Date.UTC(y, m + 1, 0));
        const f = monStart.getTime() < from.getTime() ? from : monStart;
        const t = monEnd.getTime() > to.getTime() ? to : monEnd;
        if (f.getTime() <= t.getTime()) out.push({ from: f, to: t });
        if (monStart.getTime() <= from.getTime()) break;
        m -= 1;
        if (m < 0) { m = 11; y -= 1; }
      }
      return out;
    }

    function buildDayWindows(from: Date, to: Date): { from: Date; to: Date }[] {
      const out: { from: Date; to: Date }[] = [];
      for (let ts = to.getTime(); ts >= from.getTime(); ts -= 86400000) {
        const d = new Date(ts);
        out.push({ from: d, to: d });
      }
      return out;
    }

    async function eluSearch(name: string, from: string, to: string, offset: number, limit: number) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(ELU_API, {
          method: "POST",
          headers: { "content-type": "application/json", "accept": "application/json" },
          body: JSON.stringify({
            q: `_text_:"${name}" AND event_date:[${from} TO ${to}]`,
            fq: {},
            pagination: { offset, limit, order: { by: "event_datetime_point", ascending: false } },
            facets: [],
            fields: null,
          }),
          signal: controller.signal,
        });
        stats.requests++;
        const text = await res.text();
        if (res.status !== 200) {
          return { status: res.status, count: 0, results: [] as any[], error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
        }
        try {
          const json = JSON.parse(text);
          return { status: 200, count: Number(json?.count ?? 0), results: (json?.results ?? []) as any[], error: undefined as string | undefined };
        } catch (e) {
          return { status: 200, count: 0, results: [] as any[], error: `JSON parse: ${String(e)}` };
        }
      } catch (e) {
        stats.requests++;
        return { status: 0, count: 0, results: [] as any[], error: String(e) };
      } finally {
        clearTimeout(timer);
      }
    }

    const trunc = (s: string | null, n: number) => (s == null ? null : (s.length > n ? s.slice(0, n) : s));

    function mapRow(name: string, r: any) {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      const locRaw = (typeof r.locality === "string" && r.locality)
        || (typeof r.municipality === "string" && r.municipality)
        || (typeof r.county === "string" && r.county)
        || null;
      const county = typeof r.county === "string" ? r.county : null;
      let observer: string | null = null;
      if (Array.isArray(r.recorded_by)) observer = r.recorded_by.map((x: unknown) => String(x)).join(", ");
      const ic = Number(r.individual_count);
      return {
        sub_id: String(r.id),
        species_name: name,
        species_lat: null,
        observed_at: r.event_date,
        lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
        lon: Number.isFinite(lon) && lon !== 0 ? lon : null,
        locality: trunc(locRaw, 200),
        county: trunc(county, 100),
        observer: trunc(observer, 200),
        individual_count: Number.isFinite(ic) ? ic : null,
        behavior: r.behavior ?? null,
        fetched_at: new Date().toISOString(),
      };
    }

    async function upsertBatch(rows: any[]) {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from("elurikkus_observations")
          .upsert(chunk, { onConflict: "sub_id" });
        if (error) {
          backfillErrors.push(`upsert: ${error.message}`);
        } else {
          stats.rows_upserted += chunk.length;
        }
      }
    }

    function consumeStats(name: string, results: any[]) {
      const nameLc = name.toLowerCase();
      for (const x of results) {
        stats.rows_seen++;
        const cn = String(x.common_name_est ?? "").toLowerCase();
        if (cn && cn !== nameLc) stats.name_mismatches++;
        if (typeof x.event_date === "string" && x.event_date > asOfStr) stats.future_dated++;
      }
    }

    let outCursor: any = null;
    let done = true;

    let startSpeciesIdx = 0;
    if (cursor && typeof cursor.speciesIdx === "number") startSpeciesIdx = Math.max(0, cursor.speciesIdx);

    speciesLoop: for (let sIdx = startSpeciesIdx; sIdx < backfillSpecies.length; sIdx++) {
      const name = backfillSpecies[sIdx];
      species_processed.push(name);

      const cursorWindowFrom: string | null = (sIdx === startSpeciesIdx && cursor?.windowFrom) ? String(cursor.windowFrom) : null;
      const resumeOffset: number = (sIdx === startSpeciesIdx && typeof cursor?.offset === "number") ? cursor.offset : 0;
      let active = cursorWindowFrom == null;

      const processWindow = async (w: { from: Date; to: Date }): Promise<boolean> => {
        if (budgetExceeded()) {
          outCursor = { as_of: asOfStr, speciesIdx: sIdx, windowFrom: iso(w.from), offset: 0 };
          done = false;
          return false;
        }
        const fromStr = iso(w.from);
        const toStr = iso(w.to);

        // Resume: skip leaves newer than cursor (never spend a request on them).
        if (!active && cursorWindowFrom && fromStr > cursorWindowFrom) return true;

        const initialOffset = (!active && cursorWindowFrom === fromStr) ? resumeOffset : 0;

        if (stats.requests > 0) await delay(REQ_DELAY_MS);
        if (budgetExceeded()) {
          outCursor = { as_of: asOfStr, speciesIdx: sIdx, windowFrom: fromStr, offset: initialOffset };
          done = false;
          return false;
        }

        const r = await eluSearch(name, fromStr, toStr, initialOffset, PAGE_LIMIT);
        stats.windows_processed++;
        if (r.error) backfillErrors.push(`${name} [${fromStr}..${toStr}]@${initialOffset}: ${r.error}`);

        if (r.count === 0) {
          if (cursorWindowFrom === fromStr) active = true;
          return true;
        }

        // Split oversized windows (only when we haven't started paging).
        if (r.count > SPLIT_THRESHOLD && initialOffset === 0) {
          const spanDays = Math.round((w.to.getTime() - w.from.getTime()) / 86400000) + 1;
          let subs: { from: Date; to: Date }[] | null = null;
          if (spanDays > 31) subs = buildMonthWindows(w.from, w.to);
          else if (spanDays > 1) subs = buildDayWindows(w.from, w.to);
          else {
            // Day-leaf: cannot split further. Truncate at cap.
            stats.truncated_windows++;
            console.warn(`[elu-backfill] TRUNCATED day-window ${name} ${fromStr} count=${r.count}`);
            subs = null;
          }
          if (subs) {
            for (const sw of subs) {
              const ok = await processWindow(sw);
              if (!ok) return false;
            }
            if (cursorWindowFrom === fromStr) active = true;
            return true;
          }
        }

        // Page the current window; r already holds the first page at initialOffset.
        consumeStats(name, r.results);
        await upsertBatch(r.results.filter((x) => typeof x.event_date === "string" && x.event_date <= asOfStr).map((x) => mapRow(name, x)));

        let offset = initialOffset + PAGE_LIMIT;
        while (offset < r.count && offset <= MAX_OFFSET) {
          if (budgetExceeded()) {
            outCursor = { as_of: asOfStr, speciesIdx: sIdx, windowFrom: fromStr, offset };
            done = false;
            return false;
          }
          await delay(REQ_DELAY_MS);
          const pr = await eluSearch(name, fromStr, toStr, offset, PAGE_LIMIT);
          if (pr.error) backfillErrors.push(`${name} [${fromStr}..${toStr}]@${offset}: ${pr.error}`);
          if (pr.results.length === 0) break;
          consumeStats(name, pr.results);
          await upsertBatch(pr.results.filter((x) => typeof x.event_date === "string" && x.event_date <= asOfStr).map((x) => mapRow(name, x)));
          offset += PAGE_LIMIT;
        }

        if (cursorWindowFrom === fromStr) active = true;
        return true;
      };

      const yearWindows = buildYearWindows();
      for (const yw of yearWindows) {
        const ok = await processWindow(yw);
        if (!ok) break speciesLoop;
      }

      if (sIdx < backfillSpecies.length - 1) await delay(REQ_DELAY_MS);
    }

    const duration_ms = Date.now() - t0;
    return new Response(JSON.stringify({
      mode: "backfill",
      as_of: asOfStr,
      done,
      cursor: done ? null : outCursor,
      req_offset: reqOffset,
      req_limit: reqLimit,
      species_processed,
      requests: stats.requests,
      windows_processed: stats.windows_processed,
      rows_seen: stats.rows_seen,
      rows_upserted: stats.rows_upserted,
      name_mismatches: stats.name_mismatches,
      future_dated: stats.future_dated,
      truncated_windows: stats.truncated_windows,
      errors: backfillErrors.slice(0, 50),
      duration_ms,
    }), { status: 200, headers: corsHeaders });
  }
  // ==================== END BACKFILL MODE ====================





  if (body && Array.isArray(body.species) && body.species.length > 0) {
    species = body.species.map((s: unknown) => String(s).trim()).filter(Boolean);
  } else {
    const offset = typeof body.offset === "number" ? Math.max(0, body.offset) : 0;
    const limit = typeof body.limit === "number" ? Math.min(100, Math.max(1, body.limit)) : DEFAULT_SPECIES.length;
    bodyOffset = offset;
    species = DEFAULT_SPECIES.slice(offset, offset + limit);
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
  let totalObsParsed = 0;
  let totalWithSubId = 0;
  let totalWithoutSubId = 0;
  let totalObsFailed = 0;
  let totalSkippedNoDate = 0;
  let totalSkippedFuture = 0;
  let coordsPreserved = 0;
  let totalObsInserted = 0;
  let totalObsUpdated = 0;
  let totalCacheUpserts = 0;
  const errors: { name: string; error: string }[] = [];

  for (let i = 0; i < species.length; i++) {
    const name = species[i];
    try {
      const searchUrl = `https://elurikkus.ee/app/occurrences/search?text=${encodeURIComponent(name)}`;
      const html = await fetchWithTimeout(searchUrl, 10000);

      // Parse per-observation rows from the HTML
      const parseResult = parseObservationsFromHtml(html, name);
      const observations = parseResult.observations;
      totalSkippedNoDate += parseResult.skippedNoDate;
      // Sort by observed_at desc (string ISO sort works)
      observations.sort((a, b) => (a.observed_at < b.observed_at ? 1 : a.observed_at > b.observed_at ? -1 : 0));
      const mostRecent = observations[0] ?? null;

      // Existing summary fields
      const t = (mostRecent?.observed_at) || extractNewestIsoFromSearch(html);
      const occ7 = observations.length > 0
        ? countWithin7Days(observations)
        : (() => {
            // Fallback to legacy date-only counting if observation parsing yielded nothing
            const now = Date.now();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            let count = 0;
            const rowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
            let m;
            while ((m = rowPattern.exec(html)) !== null) {
              const cellText = m[1].replace(/<[^>]+>/g, "").trim();
              const iso = cellText.match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (iso) {
                const ts = Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`);
                if (Number.isFinite(ts) && now - ts >= 0 && now - ts <= sevenDays) count++;
                continue;
              }
              const eu = cellText.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
              if (eu) {
                const ts = Date.parse(`${eu[3]}-${eu[2]}-${eu[1]}T12:00:00Z`);
                if (Number.isFinite(ts) && now - ts >= 0 && now - ts <= sevenDays) count++;
              }
            }
            return count;
          })();

      const detailUrl = extractDetailUrl(html, name);

      const resolved = pickResolvedObs(observations);
      const picked = resolved?.obs ?? null;
      const metaSource = picked ?? mostRecent;

      console.log('[elu-cache]', name, '→', {
        picked_idx: resolved?.idx ?? -1,
        total_obs: observations.length,
        coords_source: resolved?.coords_source ?? 'none',
        locality: metaSource?.locality ?? null,
        lat: resolved?.lat ?? null,
        lon: resolved?.lon ?? null,
        observed_at: metaSource?.observed_at ?? null,
      });

      // === GUARD: never downgrade an existing 'exact' cache row to a lower-precision source ===
      const { data: existing } = await supabase
        .from('elurikkus_cache')
        .select('coords_source, lat, lon')
        .eq('species_name', name)
        .maybeSingle();

      console.log('[elu-cache]', name, 'existing:', {
        source: existing?.coords_source ?? '(no row)',
        lat: existing?.lat ?? null,
      });

      const existingIsExact =
        existing?.coords_source === 'exact' &&
        Number.isFinite(existing?.lat) &&
        Number.isFinite(existing?.lon);

      if (existingIsExact && (resolved?.coords_source ?? 'none') !== 'exact') {
        console.log('[elu-cache] SKIP-PRESERVE-EXACT', name,
          '(existing exact GPS, new resolution =', (resolved?.coords_source ?? 'none') + ')');
        continue;
      }

      // === WRITE 1: elurikkus_cache — atomic from picked obs (or mostRecent meta if none resolved) ===
      const cacheRow = {
        species_name: name,
        lat: resolved?.lat ?? null,
        lon: resolved?.lon ?? null,
        occ7,
        t: metaSource?.observed_at ?? t ?? null,
        coords_status: resolved?.coords_status ?? "missing",
        coords_source: resolved?.coords_source ?? "none",
        locality: metaSource?.locality ?? null,
        municipality: metaSource?.municipality ?? null,
        county: metaSource?.county ?? null,
        open_url: detailUrl || searchUrl,
        search_url: searchUrl,
        individual_count: metaSource?.individual_count ?? null,
        behavior: metaSource?.behavior ?? null,
        collectors: metaSource?.observer ?? null,
        fetched_at: new Date().toISOString(),
      };

      const { error: cacheErr } = await supabase
        .from("elurikkus_cache")
        .upsert(cacheRow, { onConflict: "species_name" });

      if (cacheErr) {
        errors.push({ name, error: `cache: ${cacheErr.message}` });
      } else {
        updated++;
        totalCacheUpserts++;
      }

      // === WRITE 2: elurikkus_observations (per-observation rows) ===
      const nowIso = new Date().toISOString();
      const obsRowsWithSubId = observations
        .filter((o) => o.sub_id)
        .map((o) => ({
          species_name: name,
          species_lat: null,
          observed_at: o.observed_at,
          locality: o.locality,
          county: o.county,
          lat: o.lat,
          lon: o.lon,
          observer: o.observer,
          individual_count: o.individual_count,
          behavior: o.behavior,
          sub_id: o.sub_id,
          fetched_at: nowIso,
        }));

      const obsRowsWithoutSubId = observations
        .filter((o) => !o.sub_id)
        .map((o) => ({
          species_name: name,
          species_lat: null,
          observed_at: o.observed_at,
          locality: o.locality,
          county: o.county,
          lat: o.lat,
          lon: o.lon,
          observer: o.observer,
          individual_count: o.individual_count,
          behavior: o.behavior,
          sub_id: null,
          fetched_at: nowIso,
        }));

      totalObsParsed += observations.length;
      totalWithSubId += obsRowsWithSubId.length;
      totalWithoutSubId += obsRowsWithoutSubId.length;

      if (obsRowsWithSubId.length > 0) {
        const { data: subIdData, error: subIdErr } = await supabase
          .from("elurikkus_observations")
          .upsert(obsRowsWithSubId, { onConflict: "sub_id" })
          .select("id");
        if (subIdErr) {
          totalObsFailed += obsRowsWithSubId.length;
          console.error(`[elurikkus-obs sub_id upsert] ${name}: ${subIdErr.message}`);
          errors.push({ name, error: `obs sub_id: ${subIdErr.message}` });
        } else {
          totalObsInserted += subIdData?.length ?? obsRowsWithSubId.length;
        }
      }

      if (obsRowsWithoutSubId.length > 0) {
        for (const row of obsRowsWithoutSubId) {
          let existingQuery = supabase
            .from("elurikkus_observations")
            .select("id")
            .eq("species_name", row.species_name)
            .eq("observed_at", row.observed_at);
          existingQuery = row.locality === null ? existingQuery.is("locality", null) : existingQuery.eq("locality", row.locality);
          existingQuery = row.observer === null ? existingQuery.is("observer", null) : existingQuery.eq("observer", row.observer);

          const { data: existing, error: lookupErr } = await existingQuery.maybeSingle();
          if (lookupErr) {
            totalObsFailed++;
            console.error(`[elurikkus-obs natural-key upsert] ${name}: lookup failed: ${lookupErr.message}`);
            errors.push({ name, error: `obs natural lookup: ${lookupErr.message}` });
            continue;
          }

          if (existing?.id) {
            const { error: updateErr } = await supabase
              .from("elurikkus_observations")
              .update(row)
              .eq("id", existing.id);
            if (updateErr) {
              totalObsFailed++;
              console.error(`[elurikkus-obs natural-key upsert] ${name}: update failed: ${updateErr.message}`);
              errors.push({ name, error: `obs natural update: ${updateErr.message}` });
            } else {
              totalObsUpdated++;
            }
          } else {
            const { error: insertErr } = await supabase
              .from("elurikkus_observations")
              .insert(row);
            if (insertErr) {
              totalObsFailed++;
              console.error(`[elurikkus-obs natural-key upsert] ${name}: insert failed: ${insertErr.message}`);
              errors.push({ name, error: `obs natural insert: ${insertErr.message}` });
            } else {
              totalObsInserted++;
            }
          }
        }
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
    offset: bodyOffset,
    total_species: DEFAULT_SPECIES.length,
    observations_parsed: totalObsParsed,
    observations_with_sub_id: totalWithSubId,
    observations_without_sub_id: totalWithoutSubId,
    observations_failed: totalObsFailed,
    observations_skipped_no_date: totalSkippedNoDate,
    observations_failed_upsert: totalObsFailed,
    observations_inserted: totalObsInserted,
    observations_updated: totalObsUpdated,
    cache_rows_upserted: totalCacheUpserts,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: corsHeaders,
  });
});
