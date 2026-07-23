// Read-only GBIF occurrence-count lookup for the species settings panel.
// Pure and UI-agnostic: never throws to the caller — returns null on any failure.
// Deliberately independent of the iframe GBIF code under public/maps/** (its
// bm_taxonkey_cache stays untouched; this module uses its own React-side keys).

// eBird Observation Dataset on GBIF — makes the count "eBird observations", globally.
const EBIRD_EOD_DATASET_KEY = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e';
// Flip to true to count ALL GBIF sources globally (~807K vs eBird's ~794K); that
// number would be "GBIF", not "eBird". Default false = eBird-only. No UI for this.
const INCLUDE_ALL_DATASETS = false;

const TAXON_KEY_CACHE_KEY = 'estbirding.gbifTaxonKey.v1';
const OBS_COUNT_CACHE_KEY = 'estbirding.gbifObsCount.v1';
const OBS_COUNT_TTL_MS = 24 * 60 * 60 * 1000; // mirrors the map's GBIF_CACHE_TTL_MS
const RATE_LIMIT_BACKOFF_MS = 1500;

type ObsCountCacheEntry = { count: number; ts: number };

function readCache<T>(storageKey: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeCache<T>(storageKey: string, cache: Record<string, T>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(cache));
  } catch {
    // Storage full / unavailable — caching is best-effort only.
  }
}

async function matchTaxon(scientificName: string, strict: boolean): Promise<number | null> {
  try {
    const url =
      `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}` +
      `&kingdom=Animalia${strict ? '&strict=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || json.matchType === 'NONE' || typeof json.usageKey !== 'number') return null;
    return json.usageKey;
  } catch {
    return null;
  }
}

async function resolveTaxonKey(scientificName: string): Promise<number | null> {
  const cache = readCache<number>(TAXON_KEY_CACHE_KEY);
  const cached = cache[scientificName];
  if (typeof cached === 'number') return cached;
  const usageKey =
    (await matchTaxon(scientificName, true)) ?? (await matchTaxon(scientificName, false));
  if (usageKey == null) return null;
  // taxonKeys never change — cache without TTL.
  writeCache(TAXON_KEY_CACHE_KEY, { ...cache, [scientificName]: usageKey });
  return usageKey;
}

async function fetchWithRateLimitRetry(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url);
    if (res.status !== 429) return res;
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_BACKOFF_MS));
    return await fetch(url);
  } catch {
    return null;
  }
}

export async function fetchGbifOccurrenceCount(scientificName: string): Promise<number | null> {
  const name = scientificName.trim();
  if (!name) return null;
  try {
    const taxonKey = await resolveTaxonKey(name);
    if (taxonKey == null) return null;

    const datasetParam = INCLUDE_ALL_DATASETS ? '' : `&datasetKey=${EBIRD_EOD_DATASET_KEY}`;
    const cacheKey = `${taxonKey}|eod`;
    const cache = readCache<ObsCountCacheEntry>(OBS_COUNT_CACHE_KEY);
    const hit = cache[cacheKey];
    if (hit && typeof hit.count === 'number' && Date.now() - hit.ts < OBS_COUNT_TTL_MS) {
      return hit.count;
    }

    const res = await fetchWithRateLimitRetry(
      `https://api.gbif.org/v1/occurrence/search?taxonKey=${taxonKey}${datasetParam}&limit=0`,
    );
    if (!res || !res.ok) return null;
    const json = await res.json();
    if (!json || typeof json.count !== 'number') return null;

    writeCache(OBS_COUNT_CACHE_KEY, { ...cache, [cacheKey]: { count: json.count, ts: Date.now() } });
    return json.count;
  } catch {
    return null;
  }
}
