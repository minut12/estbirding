import type { SpeciesScopeId } from '@/lib/mapScope';
import { normalizeSpeciesName } from '@/lib/textNormalize';

const STORAGE_PREFIX = 'estbirding.discoveredSpecies.';

function storageKey(scopeId: SpeciesScopeId): string {
  return `${STORAGE_PREFIX}${scopeId}.v1`;
}

export const DISCOVERED_SPECIES_EVENT = 'discovered-species-updated';

function dispatchUpdated(scopeId: SpeciesScopeId): void {
  try {
    window.dispatchEvent(new CustomEvent(DISCOVERED_SPECIES_EVENT, { detail: { scopeId } }));
  } catch {}
}

export function loadDiscoveredSpecies(scopeId: SpeciesScopeId): string[] {
  try {
    const raw = localStorage.getItem(storageKey(scopeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => normalizeSpeciesName(s));
  } catch {
    return [];
  }
}

export function saveDiscoveredSpecies(list: string[], scopeId: SpeciesScopeId): void {
  const unique = Array.from(new Set(
    list
      .map((s) => normalizeSpeciesName(s))
      .filter((s) => s.length > 0)
  ));
  unique.sort((a, b) => a.localeCompare(b, 'en'));
  try {
    localStorage.setItem(storageKey(scopeId), JSON.stringify(unique));
  } catch (e) {
    console.warn('[discoveredSpecies] save failed', e);
  }
}

/** Add a batch of species names. Returns number of newly-added entries. */
export function addDiscoveredSpeciesBatch(names: string[], scopeId: SpeciesScopeId): number {
  if (!Array.isArray(names) || names.length === 0) return 0;
  const existing = loadDiscoveredSpecies(scopeId);
  const existingSet = new Set(existing.map((s) => s.toLowerCase()));
  let added = 0;
  for (const raw of names) {
    const name = normalizeSpeciesName(String(raw || ''));
    if (!name) continue;
    if (existingSet.has(name.toLowerCase())) continue;
    existing.push(name);
    existingSet.add(name.toLowerCase());
    added++;
  }
  if (added > 0) {
    saveDiscoveredSpecies(existing, scopeId);
    dispatchUpdated(scopeId);
  }
  return added;
}

export function clearDiscoveredSpecies(scopeId: SpeciesScopeId): void {
  try {
    localStorage.removeItem(storageKey(scopeId));
    dispatchUpdated(scopeId);
  } catch {}
}

export function isDiscoveredSpecies(name: string, scopeId: SpeciesScopeId): boolean {
  const key = normalizeSpeciesName(String(name || '')).toLowerCase();
  if (!key) return false;
  return loadDiscoveredSpecies(scopeId).some((s) => s.toLowerCase() === key);
}
