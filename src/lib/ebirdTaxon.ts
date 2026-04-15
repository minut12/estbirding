import { getFunctionsBaseUrl, supabaseFetch } from '@/config/supabaseConfig';

export type EbirdTaxon = {
  speciesCode: string;
  comName: string;
  sciName: string;
  category?: string;
  taxonOrder?: number | null;
  familyComName?: string;
  familySciName?: string;
};

const TAXON_CACHE_KEY = 'estbirding.ebirdTaxon.v1';

type CacheEntry = { taxon: EbirdTaxon; cachedAt: string };

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(TAXON_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
  } catch { return {}; }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  try { localStorage.setItem(TAXON_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

/**
 * Fetch eBird taxonomy for a species code. Uses localStorage cache
 * (cache never expires for taxonomy — Latin names don't change).
 * Returns null on any failure (network, validation, not found).
 */
export async function fetchEbirdTaxon(speciesCode: string): Promise<EbirdTaxon | null> {
  const code = String(speciesCode || '').trim().toLowerCase();
  if (!code || !/^[a-z0-9]{2,12}$/.test(code)) return null;

  const cache = readCache();
  if (cache[code]?.taxon?.sciName) return cache[code].taxon;

  try {
    const base = getFunctionsBaseUrl();
    if (!base) return null;
    const url = `${base}/ebird-taxon?species=${encodeURIComponent(code)}`;
    const res = await supabaseFetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object' || !data.sciName) return null;

    const taxon: EbirdTaxon = {
      speciesCode: String(data.speciesCode || code),
      comName: String(data.comName || ''),
      sciName: String(data.sciName || ''),
      category: data.category ? String(data.category) : undefined,
      taxonOrder: typeof data.taxonOrder === 'number' ? data.taxonOrder : null,
      familyComName: data.familyComName ? String(data.familyComName) : undefined,
      familySciName: data.familySciName ? String(data.familySciName) : undefined,
    };

    const next = readCache();
    next[code] = { taxon, cachedAt: new Date().toISOString() };
    writeCache(next);

    return taxon;
  } catch {
    return null;
  }
}

/** Manual cache helpers (for debugging / settings clear). */
export function clearEbirdTaxonCache(): void {
  try { localStorage.removeItem(TAXON_CACHE_KEY); } catch {}
}

export function getEbirdTaxonCacheSize(): number {
  return Object.keys(readCache()).length;
}
