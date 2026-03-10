/**
 * Species visibility persistence service.
 * Cloud-backed (Supabase) with localStorage cache, per-user + per-map scope.
 */
import { supabase } from '@/integrations/supabase/client';

export type MapScope = 'ee_map' | 'europe_map' | 'rariliin_map';

const CACHE_PREFIX = 'speciesHidden';

// ── Local cache helpers ──

function cacheKey(scope: MapScope, userId: string): string {
  return `${CACHE_PREFIX}.${scope}.${userId}`;
}

function cacheTimestampKey(scope: MapScope, userId: string): string {
  return `${CACHE_PREFIX}.${scope}.${userId}.ts`;
}

export function loadLocalHidden(scope: MapScope, userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(cacheKey(scope, userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function saveLocalHidden(scope: MapScope, userId: string, hidden: Set<string>): void {
  try {
    localStorage.setItem(cacheKey(scope, userId), JSON.stringify([...hidden]));
    localStorage.setItem(cacheTimestampKey(scope, userId), new Date().toISOString());
  } catch { /* quota */ }
}

// ── Cloud helpers ──

export async function loadCloudHidden(scope: MapScope, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('map_species_preferences' as any)
    .select('species_key')
    .eq('user_id', userId)
    .eq('map_scope', scope)
    .eq('is_hidden', true);

  if (error) {
    console.warn('[speciesVisibility] cloud load error', error.message);
    return loadLocalHidden(scope, userId);
  }

  const hidden = new Set((data as any[]).map((r: any) => r.species_key as string));
  // Update local cache
  saveLocalHidden(scope, userId, hidden);
  return hidden;
}

/** Debounced save queue — batches multiple toggles into one upsert */
const _pendingSaves = new Map<string, { scope: MapScope; userId: string; species: string; isHidden: boolean }>();
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 600;

function flushSaves(): void {
  if (_pendingSaves.size === 0) return;
  const batch = [..._pendingSaves.values()];
  _pendingSaves.clear();

  const rows = batch.map(b => ({
    user_id: b.userId,
    map_scope: b.scope,
    species_key: b.species,
    is_hidden: b.isHidden,
  }));

  supabase
    .from('map_species_preferences' as any)
    .upsert(rows, { onConflict: 'user_id,map_scope,species_key' })
    .then(({ error }) => {
      if (error) console.warn('[speciesVisibility] cloud save error', error.message);
    });
}

export function saveSpeciesVisibility(
  scope: MapScope,
  userId: string,
  speciesKey: string,
  isHidden: boolean,
): void {
  // Update local cache immediately
  const local = loadLocalHidden(scope, userId);
  if (isHidden) local.add(speciesKey);
  else local.delete(speciesKey);
  saveLocalHidden(scope, userId, local);

  // Queue cloud save
  const key = `${scope}|${userId}|${speciesKey}`;
  _pendingSaves.set(key, { scope, userId, species: speciesKey, isHidden });
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(flushSaves, SAVE_DEBOUNCE_MS);
}

/** Load preferences: try cloud first, fallback to local cache */
export async function loadSpeciesVisibility(scope: MapScope, userId: string): Promise<Set<string>> {
  try {
    return await loadCloudHidden(scope, userId);
  } catch {
    return loadLocalHidden(scope, userId);
  }
}
