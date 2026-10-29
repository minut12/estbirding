// _shared/ext-rare / merge.ts
// Pure duplicate-folding for external rarity records (P178d1). No imports and
// no Deno APIs, so the same module also runs under Vite.

export type MergeSource = "ebird" | "tarsiger" | "lofk";

export type MergeItem = {
  key: string;
  source: MergeSource;
  species_sci: string;
  country_code: string;
  date_from: string;
  date_to: string;
  lat: number | null;
  lng: number | null;
  precision: "exact" | "municipality" | "country";
};

const EARTH_RADIUS_KM = 6371;
const MAX_GAP_DAYS = 1;
const MAX_DISTANCE_KM = 10;
const MS_PER_DAY = 86_400_000;

type Prepared = {
  item: MergeItem;
  rank: number;
  from: number;
  to: number;
};

type Candidate = {
  main: Prepared;
  gap: number;
  distance: number | null;
};

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function rankOf(item: MergeItem): number {
  if (item.source === "ebird") return 0;
  if (item.source === "tarsiger") return item.precision === "exact" ? 1 : 2;
  return 3;
}

function groupKey(item: MergeItem): string {
  return `${item.species_sci.trim().toLowerCase()}|${item.country_code.trim().toUpperCase()}`;
}

function prepare(item: MergeItem): Prepared {
  return { item, rank: rankOf(item), from: dayNumber(item.date_from), to: dayNumber(item.date_to) };
}

function compareProcessing(a: Prepared, b: Prepared): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.to !== b.to) return b.to - a.to;
  return a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0;
}

function dateGap(a: Prepared, b: Prepared): number {
  if (a.to < b.from) return b.from - a.to;
  if (b.to < a.from) return a.from - b.to;
  return 0;
}

function exactDistance(a: MergeItem, b: MergeItem): number | null {
  if (a.precision !== "exact" || b.precision !== "exact") return null;
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  return haversineKm(a.lat, a.lng, b.lat, b.lng);
}

function toCandidate(x: Prepared, main: Prepared): Candidate | null {
  const gap = dateGap(x, main);
  if (gap > MAX_GAP_DAYS) return null;
  const distance = exactDistance(x.item, main.item);
  if (distance !== null && distance > MAX_DISTANCE_KM) return null;
  return { main, gap, distance };
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.gap !== b.gap) return a.gap - b.gap;
  if (a.distance !== null && b.distance !== null && a.distance !== b.distance) {
    return a.distance - b.distance;
  }
  const ka = a.main.item.key;
  const kb = b.main.item.key;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function bestMain(x: Prepared, mains: readonly Prepared[]): Prepared | null {
  const candidates = mains
    .map((m) => toCandidate(x, m))
    .filter((c): c is Candidate => c !== null)
    .sort(compareCandidates);
  return candidates.length > 0 ? candidates[0].main : null;
}

function assignGroup(group: readonly Prepared[], out: Map<string, string | null>): void {
  const mains: Prepared[] = [];
  for (const x of [...group].sort(compareProcessing)) {
    const main = bestMain(x, mains);
    if (main === null) mains.push(x);
    out.set(x.item.key, main === null ? null : main.item.key);
  }
}

export function assignMerges(items: MergeItem[]): Map<string, string | null> {
  const groups = new Map<string, Prepared[]>();
  for (const item of items) {
    const k = groupKey(item);
    groups.set(k, [...(groups.get(k) ?? []), prepare(item)]);
  }
  const out = new Map<string, string | null>();
  for (const group of groups.values()) assignGroup(group, out);
  return out;
}
