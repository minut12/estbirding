// ext-rare-refresh / lib.ts (P178d3)
// Pure glue between the ext-rare parsers, the merge step and the DB rows.
// No I/O and no Deno APIs: everything here is unit-testable.

import type { ExtRareRecord } from "../_shared/ext-rare/lib.ts";
import type { MergeItem } from "../_shared/ext-rare/merge.ts";

const TALLINN_TZ = "Europe/Tallinn";

const TALLINN_YEAR_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: TALLINN_TZ,
  year: "numeric",
  month: "2-digit",
});

function yearMonth(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

// Current and previous month in Europe/Tallinn time, as "YYYY-MM".
export function lofkMonths(now: Date): string[] {
  const parts = TALLINN_YEAR_MONTH.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return [yearMonth(year, month), yearMonth(prevYear, prevMonth)];
}

function toAscii(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7E]/g, "");
}

// Nominatim query for a LOFK district hint; null when nothing to geocode.
export function geocodeQuery(r: ExtRareRecord): string | null {
  if (r.source !== "lofk" || r.district_hint === null) return null;
  const hint = toAscii(r.district_hint).trim();
  return hint === "" ? null : `${hint} savivaldybe`;
}

export function toMergeItem(r: ExtRareRecord): MergeItem {
  return {
    key: `${r.source}:${r.source_id}`,
    source: r.source,
    species_sci: r.species_sci,
    country_code: r.country_code,
    date_from: r.obs_date_from,
    date_to: r.obs_date_to,
    lat: r.lat,
    lng: r.lng,
    precision: r.coord_precision,
  };
}

export type EbirdMergeRow = {
  ebird_sub_id: string | null;
  species_lat_name: string | null;
  country_code: string;
  obs_date: string;
  lat: number | null;
  lng: number | null;
};

export function ebirdToMergeItem(row: EbirdMergeRow): MergeItem | null {
  const subId = row.ebird_sub_id?.trim() ?? "";
  const species = row.species_lat_name?.trim() ?? "";
  if (subId === "" || species === "") return null;
  const date = row.obs_date.slice(0, 10);
  const hasCoords = row.lat !== null && row.lng !== null;
  return {
    key: `ebird:${subId}`,
    source: "ebird",
    species_sci: species,
    country_code: row.country_code,
    date_from: date,
    date_to: date,
    lat: hasCoords ? row.lat : null,
    lng: hasCoords ? row.lng : null,
    precision: hasCoords ? "exact" : "country",
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// LOFK admin-ajax reply -> HTML for parseLofkHtml. The normal reply is the raw
// table HTML. A WordPress JSON envelope is also accepted: {"success":false,...}
// throws with its data text; {"success":true,"data":"<html>"} yields data.
export function unwrapLofkReply(body: string): string {
  const parsed = tryJson(body.trim());
  if (!isRecord(parsed) || typeof parsed.success !== "boolean") return body;
  const data = parsed.data;
  if (parsed.success === false) {
    const text = typeof data === "string" ? data : JSON.stringify(data ?? null);
    throw new Error(`lofk success=false: ${text.slice(0, 200)}`);
  }
  return typeof data === "string" ? data : body;
}

export type NominatimHit = {
  lat: number;
  lng: number;
  display_name: string | null;
  osm_type: string | null;
  osm_id: number | null;
};

// First element of a Nominatim jsonv2 search reply; null = no usable match.
export function parseNominatimHit(json: unknown): NominatimHit | null {
  if (!Array.isArray(json) || json.length === 0 || !isRecord(json[0])) return null;
  const first = json[0];
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (first.lat === undefined || first.lon === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const osmId = Number(first.osm_id);
  return {
    lat,
    lng,
    display_name: typeof first.display_name === "string" ? first.display_name : null,
    osm_type: typeof first.osm_type === "string" ? first.osm_type : null,
    osm_id: first.osm_id !== undefined && Number.isInteger(osmId) ? osmId : null,
  };
}
