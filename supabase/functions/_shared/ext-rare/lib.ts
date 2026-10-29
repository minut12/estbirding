// _shared/ext-rare / lib.ts (P178b)
// Pure parsers for external rarity feeds: LOFK (birdlife.lt monthly table,
// HTML) and Tarsiger (observations API, JSON). No I/O, no DOM parser.
// Observers are never stored: no person/creator field is ever emitted.

export type ExtSource = "lofk" | "tarsiger";
export type CoordPrecision = "exact" | "municipality" | "country";
export type ExtRareRecord = {
  source: ExtSource;
  source_id: string;
  country_code: string;
  species_sci: string;
  obs_date_from: string;
  obs_date_to: string;
  place_text: string;
  district_hint: string | null;
  lat: number | null;
  lng: number | null;
  coord_precision: CoordPrecision;
  note_text: string | null;
  nth_record: number | null;
  is_important: boolean;
  photo_url: string | null;
  source_url: string;
};

const LOFK_SOURCE_URL = "https://birdlife.lt/";
const TARSIGER_SOURCE_URL = "https://www.tarsiger.com/havainnot";

const TARSIGER_ALLOWED = new Set(["FI", "SE", "NO", "DK", "EE", "LV", "LT", "PL", "BY"]);
// NW Russia bbox, copied from gbif-bulk-refresh/lib.ts RU_BBOX_WKT
// "POLYGON((19 55,40 55,40 70,19 70,19 55))".
const RU_BBOX = { lonMin: 19, lonMax: 40, latMin: 55, latMax: 70 } as const;

// ---------- helpers ----------

export function fnv1a32hex(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function cellText(html: string): string {
  const noTags = html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

// ---------- nth record ----------

const WORD_ORDINALS: Readonly<Record<string, number>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const NTH_RE = new RegExp(
  "\\b(?:(\\d+)(?:st|nd|rd|th)|(" + Object.keys(WORD_ORDINALS).join("|") + "))" +
    "\\s+(?:records?|for|observations?|reco)\\b",
  "i",
);

export function parseNthRecord(note: string): number | null {
  const m = NTH_RE.exec(note);
  if (!m) return null;
  if (m[1] !== undefined) return parseInt(m[1], 10);
  return WORD_ORDINALS[m[2].toLowerCase()] ?? null;
}

// ---------- LOFK ----------

const DISTRICT_RE =
  /(?<!\p{L})(\p{Lu}\p{Ll}+)\s+(?:m\.\s*sav\.|raj\.|rajon\p{Ll}*|r\.|sav\.)/u;

export function lofkDistrictHint(text: string): string | null {
  const m = DISTRICT_RE.exec(text);
  return m ? m[1] : null;
}

function lofkPhotoUrl(cellHtml: string): string | null {
  const href = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(cellHtml);
  if (href) return decodeEntities(href[1]);
  // LOFK renders photos as thumbnails opening a full-size modal.
  const modal = /openModal\(\s*'([^']+)'/.exec(cellHtml);
  if (modal) return decodeEntities(modal[1]);
  const img = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(cellHtml);
  return img ? decodeEntities(img[1]) : null;
}

function parseLofkRow(rowHtml: string): ExtRareRecord | null {
  const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
  if (cells.length < 4) return null;
  const date = cellText(cells[0]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const speciesParts = cells[2].split(/<br\s*\/?>/i);
  const speciesSci = cellText(speciesParts[speciesParts.length - 1]);
  if (!speciesSci) return null;
  const placeText = cellText(cells[3]);
  const note = cells.length > 6 ? cellText(cells[6]) : "";
  return {
    source: "lofk",
    source_id: `${date}|${speciesSci}|${fnv1a32hex(placeText)}`,
    country_code: "LT",
    species_sci: speciesSci,
    obs_date_from: date,
    obs_date_to: date,
    place_text: placeText,
    district_hint: lofkDistrictHint(placeText),
    lat: null,
    lng: null,
    coord_precision: "country",
    note_text: note || null,
    nth_record: note ? parseNthRecord(note) : null,
    is_important: false,
    photo_url: cells.length > 4 ? lofkPhotoUrl(cells[4]) : null,
    source_url: LOFK_SOURCE_URL,
  };
}

export function parseLofkHtml(html: string): ExtRareRecord[] {
  const out: ExtRareRecord[] = [];
  for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rec = parseLofkRow(m[1]);
    if (rec) out.push(rec);
  }
  return out;
}

// ---------- Tarsiger ----------

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tarsigerSpeciesSci(species: unknown): string | null {
  if (!Array.isArray(species)) return null;
  const first: unknown = species[0];
  return isObject(first) ? str(first.name_sci) : null;
}

// internal_image is either null, a URL string, or a nested observation
// object carrying an `images: [{ image }]` list.
function tarsigerInternalImage(v: unknown): string | null {
  const direct = str(v);
  if (direct) return direct;
  if (!isObject(v) || !Array.isArray(v.images)) return null;
  for (const img of v.images) {
    const url = isObject(img) ? str(img.image) : null;
    if (url) return url;
  }
  return null;
}

function inRegion(cc: string, lat: number | null, lng: number | null): boolean {
  if (TARSIGER_ALLOWED.has(cc)) return true;
  if (cc !== "RU" || lat === null || lng === null) return false;
  return lng >= RU_BBOX.lonMin && lng <= RU_BBOX.lonMax &&
    lat >= RU_BBOX.latMin && lat <= RU_BBOX.latMax;
}

function parseTarsigerItem(item: unknown): ExtRareRecord | null {
  if (!isObject(item)) return null;
  const id = typeof item.id === "number" || typeof item.id === "string" ? String(item.id) : null;
  const cc = str(item.country_code)?.toUpperCase() ?? null;
  const dateFrom = str(item.date_from);
  const speciesSci = tarsigerSpeciesSci(item.species);
  if (!id || !cc || !dateFrom || !speciesSci) return null;
  const latRaw = num(item.latitude);
  const lngRaw = num(item.longitude);
  const hasCoords = latRaw !== null && lngRaw !== null;
  if (!inRegion(cc, latRaw, lngRaw)) return null;
  const note = str(item.notes);
  return {
    source: "tarsiger",
    source_id: id,
    country_code: cc,
    species_sci: speciesSci,
    obs_date_from: dateFrom,
    obs_date_to: str(item.date_to) ?? dateFrom,
    place_text: str(item.place) ?? "",
    district_hint: null,
    lat: hasCoords ? latRaw : null,
    lng: hasCoords ? lngRaw : null,
    coord_precision: hasCoords ? "exact" : "country",
    note_text: note,
    nth_record: note ? parseNthRecord(note) : null,
    is_important: item.is_important === true,
    photo_url: str(item.external_image_url) ?? tarsigerInternalImage(item.internal_image),
    source_url: TARSIGER_SOURCE_URL,
  };
}

export function parseTarsigerJson(json: unknown): ExtRareRecord[] {
  const list: unknown = isObject(json) ? json.results : json;
  if (!Array.isArray(list)) return [];
  const out: ExtRareRecord[] = [];
  for (const item of list) {
    const rec = parseTarsigerItem(item);
    if (rec) out.push(rec);
  }
  return out;
}
