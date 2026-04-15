/**
 * eBird Taxonomy lookup for resolving speciesCode → scientific name.
 * Uses the eBird v2 taxonomy API (client-side only, never via Edge Functions).
 */

export type EbirdTaxon = {
  speciesCode: string;
  comName: string;
  sciName: string;
  category?: string;
  taxonOrder?: number;
};

const TAXON_CACHE_KEY = 'estbirding.ebirdTaxon.v1';
const EBIRD_TOKEN_KEY = 'bm_ebird_token';
const EBIRD_TOKEN_FALLBACK = '9s72dc2jcjlq';

function getEbirdToken(): string {
  return localStorage.getItem(EBIRD_TOKEN_KEY) || EBIRD_TOKEN_FALLBACK;
}

function loadCache(): Record<string, EbirdTaxon> {
  try {
    const raw = localStorage.getItem(TAXON_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, EbirdTaxon>): void {
  try {
    localStorage.setItem(TAXON_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export async function fetchEbirdTaxon(speciesCode: string): Promise<EbirdTaxon | null> {
  const code = String(speciesCode || '').trim().toLowerCase();
  if (!code) return null;

  // Check cache
  const cache = loadCache();
  if (cache[code]) return cache[code];

  const token = getEbirdToken();
  const url = `https://api.ebird.org/v2/ref/taxonomy/ebird?species=${encodeURIComponent(code)}&fmt=json`;
  try {
    const res = await fetch(url, { headers: { 'X-eBirdApiToken': token } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const row = arr[0] || {};
    const taxon: EbirdTaxon = {
      speciesCode: String(row.speciesCode || code),
      comName: String(row.comName || ''),
      sciName: String(row.sciName || ''),
      category: row.category,
      taxonOrder: row.taxonOrder,
    };
    if (!taxon.sciName) return null;

    cache[code] = taxon;
    saveCache(cache);
    return taxon;
  } catch {
    return null;
  }
}
