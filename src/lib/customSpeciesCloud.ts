/**
 * Cloud sync for custom species list via Supabase Storage.
 * Mirrors the pattern from speciesMetaCloud.ts.
 */

import { supabase } from '@/config/supabaseClient';
import { getSupabaseInitError } from '@/config/supabaseClient';
import { validateSupabaseConfig } from '@/config/supabaseConfig';
import { loadCustomSpecies, saveCustomSpecies } from '@/lib/customSpecies';
import { normalizeSpeciesName } from '@/lib/textNormalize';

const BUCKET = 'bird-avatars';
const FILE_PATH = 'meta/custom_species_v1.json';

const LS_CLOUD_UPDATED_AT = 'estbirding.customSpecies.cloud.updatedAt';
const LS_LAST_SYNC_AT = 'estbirding.customSpecies.lastSyncAt';
const LS_CLOUD_LOADED = 'estbirding.customSpecies.cloud.loaded';
const LS_LAST_SYNC_ERROR = 'estbirding.customSpecies.lastSyncError';

export type CustomSpeciesCloudJson = {
  version: 1;
  updatedAt: string;
  items: string[];
};

export type CustomSpeciesSyncStatus = {
  cloudLoaded: boolean;
  cloudUpdatedAt: string;
  lastSyncAt: string;
  lastSyncError: string;
};

function setLastSyncError(message: string): void {
  localStorage.setItem(LS_LAST_SYNC_ERROR, message);
}

function clearLastSyncError(): void {
  localStorage.setItem(LS_LAST_SYNC_ERROR, '');
}

function validateCloudConfig(): void {
  const initError = getSupabaseInitError();
  if (initError) throw new Error(initError);

  const validation = validateSupabaseConfig();
  if (!validation.ok) throw new Error(validation.error || 'Supabase seadistus puudub.');
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Tundmatu viga';
  }
}

function toActionableCloudError(error: unknown, fallback: string): Error {
  const message = extractErrorMessage(error);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return new Error('Võrguühendus ebaõnnestus. Kontrolli Supabase URL-i, CORS-i ja internetiühendust.');
  }
  return new Error(message || fallback);
}

function normalizeItemsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const n = normalizeSpeciesName(item);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  out.sort((a, b) => a.localeCompare(b, 'et'));
  return out;
}

function dispatchCustomSpeciesUpdated(): void {
  try { window.dispatchEvent(new CustomEvent('custom-species-updated')); } catch {}
}

export async function downloadCustomSpeciesJson(): Promise<CustomSpeciesCloudJson | null> {
  try {
    validateCloudConfig();
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error) {
      const message = extractErrorMessage(error);
      if (/not found|404|object not found/i.test(message)) {
        // File doesn't exist yet — treat as empty
        localStorage.setItem(LS_CLOUD_LOADED, '1');
        clearLastSyncError();
        return { version: 1, updatedAt: '', items: [] };
      }
      throw error;
    }
    const text = await data.text();
    if (!text) return { version: 1, updatedAt: '', items: [] };
    const parsed = JSON.parse(text) as Partial<CustomSpeciesCloudJson>;
    localStorage.setItem(LS_CLOUD_LOADED, '1');
    clearLastSyncError();
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      items: normalizeItemsList(parsed.items),
    };
  } catch (error) {
    localStorage.setItem(LS_CLOUD_LOADED, '0');
    setLastSyncError(extractErrorMessage(toActionableCloudError(error, 'Pilvest lugemine ebaõnnestus.')));
    return null;
  }
}

export async function uploadCustomSpeciesJson(payload: CustomSpeciesCloudJson): Promise<void> {
  validateCloudConfig();
  const body: CustomSpeciesCloudJson = {
    version: 1,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    items: normalizeItemsList(payload.items),
  };
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
    contentType: 'application/json',
    cacheControl: '0',
    upsert: true,
  });
  if (error) throw toActionableCloudError(error, 'Pilve salvestamine ebaõnnestus.');
}

export async function refreshCustomSpeciesFromCloud(options?: { force?: boolean }): Promise<{ updated: boolean; merged: string[] }> {
  const force = !!options?.force;
  const local = loadCustomSpecies();
  const cloud = await downloadCustomSpeciesJson();
  if (!cloud) {
    localStorage.setItem(LS_LAST_SYNC_AT, new Date().toISOString());
    return { updated: false, merged: local };
  }

  const prevUpdatedAt = localStorage.getItem(LS_CLOUD_UPDATED_AT) || '';
  if (!force && cloud.updatedAt && prevUpdatedAt && cloud.updatedAt === prevUpdatedAt) {
    localStorage.setItem(LS_LAST_SYNC_AT, new Date().toISOString());
    return { updated: false, merged: local };
  }

  // Merge: union of cloud + local
  const merged = normalizeItemsList([...cloud.items, ...local]);
  const updated = Boolean(cloud.updatedAt && cloud.updatedAt !== prevUpdatedAt);
  saveCustomSpecies(merged);
  localStorage.setItem(LS_CLOUD_UPDATED_AT, cloud.updatedAt || '');
  localStorage.setItem(LS_LAST_SYNC_AT, new Date().toISOString());
  clearLastSyncError();

  if (updated) {
    dispatchCustomSpeciesUpdated();
  }
  return { updated, merged };
}

export async function addCustomSpeciesToCloud(name: string): Promise<string[]> {
  const key = normalizeSpeciesName(name);
  if (!key) throw new Error('Liigi nimi puudub.');

  validateCloudConfig();
  const latest = (await downloadCustomSpeciesJson()) || { version: 1 as const, updatedAt: '', items: [] };
  const items = normalizeItemsList([...latest.items, key]);

  const payload: CustomSpeciesCloudJson = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };

  try {
    await uploadCustomSpeciesJson(payload);
    saveCustomSpecies(items);
    localStorage.setItem(LS_CLOUD_UPDATED_AT, payload.updatedAt);
    localStorage.setItem(LS_LAST_SYNC_AT, new Date().toISOString());
    clearLastSyncError();
    dispatchCustomSpeciesUpdated();
    return items;
  } catch (error) {
    const actionableError = toActionableCloudError(error, 'Pilve salvestamine ebaõnnestus.');
    setLastSyncError(actionableError.message);
    throw actionableError;
  }
}

export async function removeCustomSpeciesFromCloud(name: string): Promise<string[]> {
  const key = normalizeSpeciesName(name);
  if (!key) throw new Error('Liigi nimi puudub.');

  validateCloudConfig();
  const latest = (await downloadCustomSpeciesJson()) || { version: 1 as const, updatedAt: '', items: [] };
  const items = latest.items.filter(item => normalizeSpeciesName(item) !== key);

  const payload: CustomSpeciesCloudJson = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };

  try {
    await uploadCustomSpeciesJson(payload);
    saveCustomSpecies(items);
    localStorage.setItem(LS_CLOUD_UPDATED_AT, payload.updatedAt);
    localStorage.setItem(LS_LAST_SYNC_AT, new Date().toISOString());
    clearLastSyncError();
    dispatchCustomSpeciesUpdated();
    return items;
  } catch (error) {
    const actionableError = toActionableCloudError(error, 'Pilve salvestamine ebaõnnestus.');
    setLastSyncError(actionableError.message);
    throw actionableError;
  }
}

export function getCustomSpeciesSyncStatus(): CustomSpeciesSyncStatus {
  return {
    cloudLoaded: localStorage.getItem(LS_CLOUD_LOADED) === '1',
    cloudUpdatedAt: localStorage.getItem(LS_CLOUD_UPDATED_AT) || '',
    lastSyncAt: localStorage.getItem(LS_LAST_SYNC_AT) || '',
    lastSyncError: localStorage.getItem(LS_LAST_SYNC_ERROR) || '',
  };
}
