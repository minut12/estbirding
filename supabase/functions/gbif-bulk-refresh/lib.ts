// gbif-bulk-refresh / lib.ts
// Pure helpers for the GBIF ingest: no network, no Deno.serve, no env reads —
// so they can be imported by a test without starting a server (P3 D0).

export type CountryCode = "EE" | "FI" | "SE" | "LV" | "LT" | "RU";
export type RarityTier = "none" | "rare" | "super" | "mega";

export const COUNTRIES: readonly CountryCode[] = ["EE", "FI", "SE", "LV", "LT", "RU"];
export const FOREIGN_TIERS: readonly RarityTier[] = ["rare", "super", "mega"];
// NW Russia only: lon 19–40 E, lat 55–70 N. Ring is counter-clockwise (GBIF requirement).
export const RU_BBOX_WKT = "POLYGON((19 55,40 55,40 70,19 70,19 55))";
export const YEAR_FROM_MIN = 2000;

export const DENSITY_YEAR_FROM = 2010; // fixed window for the density check, independent of mode
export const MAX_CELL_ROWS_DEFAULT = 3000; // = page_cap 10 × 300: a cell under this is always pulled complete

export const isCountry = (v: unknown): v is CountryCode =>
  typeof v === "string" && (COUNTRIES as readonly string[]).includes(v);

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const geometryParam = (country: CountryCode): string =>
  country === "RU" ? `&geometry=${encodeURIComponent(RU_BBOX_WKT)}` : "";

export function buildOccurrenceUrl(
  taxonKey: number,
  country: CountryCode,
  yFrom: number,
  yTo: number,
  page: number,
): string {
  return `https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}&country=${country}&hasCoordinate=true${
    geometryParam(country)
  }` + `&year=${yFrom},${yTo}&limit=300&offset=${page * 300}`;
}

// /occurrence/count rejects hasCoordinate ("Invalid parameter name"), so the
// density probe reads `count` off a search with limit=0 instead.
export function buildCountUrl(
  taxonKey: number,
  country: CountryCode,
  yFrom: number,
  yTo: number,
): string {
  return `https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}&country=${country}&hasCoordinate=true${
    geometryParam(country)
  }` + `&year=${yFrom},${yTo}&limit=0`;
}

export interface SelectedSpecies {
  species_name: string;
  species_lat: string;
  tier: string;
}

// EE takes every species that has a scientific name (unchanged from v22).
// Foreign countries take rare+ only.
export function selectSpecies(
  items: Record<string, unknown>,
  country: CountryCode,
): SelectedSpecies[] {
  return Object.entries(items)
    .map(([estKey, v]) => {
      const item = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const lat = item.scientificName;
      return {
        species_name: cap(estKey),
        species_lat: (lat ? String(lat) : "").trim(),
        tier: String(item.rarityLevel ?? "none"),
      };
    })
    .filter((s) => s.species_lat)
    .filter((s) => country === "EE" || (FOREIGN_TIERS as readonly string[]).includes(s.tier))
    .sort((a, b) => a.species_name.localeCompare(b.species_name));
}
