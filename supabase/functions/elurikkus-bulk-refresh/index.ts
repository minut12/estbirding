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
  const observations: ParsedObservation[] = [];
  let skippedNoDate = 0;
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
  return { observations, skippedNoDate };
}

function extractNewestIsoFromSearch(html: string): string | null {
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

  if (dates.length === 0) return null;
  dates.sort();
  return dates[dates.length - 1];
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
