import { supabase } from '@/config/supabaseClient';
import { getSupabaseInitError } from '@/config/supabaseClient';
import { validateSupabaseConfig } from '@/config/supabaseConfig';
import { LINNULIIGID_SCOPE, type SpeciesScopeConfig } from '@/lib/mapScope';
import { loadSpeciesMeta, replaceSpeciesMeta, SPECIES_META_LOCAL_UPDATED_AT_KEY, type SpeciesMeta } from '@/lib/speciesMeta';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';
import { log } from '@/lib/eventLog';

const BUCKET = 'bird-avatars';
const FILE_PATH = LINNULIIGID_SCOPE.speciesMetaCloudFilePath;
const CLOUD_UPDATED_AT_KEY = LINNULIIGID_SCOPE.speciesMetaCloudUpdatedAtKey;
export const SPECIES_META_LAST_SYNC_AT_KEY = LINNULIIGID_SCOPE.speciesMetaLastSyncAtKey;
const CLOUD_LOADED_KEY = LINNULIIGID_SCOPE.speciesMetaCloudLoadedKey;
const LAST_SYNC_ERROR_KEY = LINNULIIGID_SCOPE.speciesMetaLastSyncErrorKey;

export type SpeciesMetaCloudItem = {
  ebirdCode?: string;
  rarityLevel?: 'none' | 'rare' | 'super' | 'mega';
  avatarUrl?: string;
  scientificName?: string;
  rariliinCode?: string;
  notificationNote?: string;
  notify?: boolean;
};

export type SpeciesMetaCloudJson = {
  version: 1;
  updatedAt: string;
  items: Record<string, SpeciesMetaCloudItem>;
};

export type SpeciesMetaSyncStatus = {
  cloudLoaded: boolean;
  cloudUpdatedAt: string;
  localUpdatedAt: string;
  lastSyncAt: string;
  lastSyncError: string;
};

function setLastSyncError(message: string, scope: SpeciesScopeConfig): void {
  localStorage.setItem(scope.speciesMetaLastSyncErrorKey, message);
}

function clearLastSyncError(scope: SpeciesScopeConfig): void {
  localStorage.setItem(scope.speciesMetaLastSyncErrorKey, '');
}

function validateCloudConfig(scope: SpeciesScopeConfig): void {
  const initError = getSupabaseInitError();
  if (initError) throw new Error(initError);

  const validation = validateSupabaseConfig();
  if (!validation.ok) throw new Error(validation.error || 'Supabase seadistus puudub.');

  if (!BUCKET || !scope.speciesMetaCloudFilePath) {
    throw new Error('Linnuliikide pilvesalvestuse bucket või failitee puudub.');
  }
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

function normalizeRarityLevel(level: unknown): 'none' | 'rare' | 'super' | 'mega' {
  const v = String(level || '').trim().toLowerCase();
  if (v === 'rare' || v === 'super' || v === 'mega' || v === 'none') return v;
  return 'none';
}

function normalizeCloudItem(raw: unknown): SpeciesMetaCloudItem {
  const x = (raw && typeof raw === 'object') ? (raw as Record<string, any>) : {};
  return {
    ebirdCode: normalizeUiText(String(x.ebirdCode || '')) || undefined,
    rarityLevel: normalizeRarityLevel(x.rarityLevel),
    avatarUrl: normalizeUiText(String(x.avatarUrl || '')) || undefined,
    scientificName: normalizeUiText(String(x.scientificName || '')) || undefined,
    rariliinCode: normalizeUiText(String(x.rariliinCode || '')) || undefined,
    notificationNote: normalizeUiText(String(x.notificationNote || '')) || undefined,
    notify: x.notify === true ? true : undefined,
  };
}

function normalizeCloudItems(raw: unknown): Record<string, SpeciesMetaCloudItem> {
  const out: Record<string, SpeciesMetaCloudItem> = {};
  const src = (raw && typeof raw === 'object') ? (raw as Record<string, any>) : {};
  for (const [k, v] of Object.entries(src)) {
    const key = normalizeSpeciesName(k);
    if (!key) continue;
    out[key] = normalizeCloudItem(v);
  }
  return out;
}

function mergeCloudOverLocal(localMap: Record<string, SpeciesMeta>, cloud: SpeciesMetaCloudJson): Record<string, SpeciesMeta> {
  const merged: Record<string, SpeciesMeta> = { ...localMap };
  for (const [name, item] of Object.entries(cloud.items || {})) {
    const key = normalizeSpeciesName(name);
    if (!key) continue;
    merged[key] = {
      name: key,
      ...(merged[key] || {}),
      ...(item.ebirdCode ? { ebirdCode: item.ebirdCode } : {}),
      rarityLevel: normalizeRarityLevel(item.rarityLevel),
      ...(item.avatarUrl ? { avatarUrl: item.avatarUrl } : {}),
      ...(item.scientificName ? { scientificName: item.scientificName } : {}),
      ...(item.rariliinCode ? { rariliinCode: item.rariliinCode } : {}),
      ...(item.notificationNote ? { notificationNote: item.notificationNote } : {}),
      ...(item.notify === true ? { notify: true } : { notify: undefined }),
    };
  }
  return merged;
}

export async function downloadSpeciesMetaJson(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): Promise<SpeciesMetaCloudJson | null> {
  try {
    validateCloudConfig(scope);
    const { data, error } = await supabase.storage.from(BUCKET).download(scope.speciesMetaCloudFilePath);
    if (error) {
      const message = extractErrorMessage(error);
      if (/not found|404|object not found/i.test(message)) return null;
      throw error;
    }
    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<SpeciesMetaCloudJson>;
    localStorage.setItem(scope.speciesMetaCloudLoadedKey, '1');
    clearLastSyncError(scope);
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      items: normalizeCloudItems(parsed.items),
    };
  } catch (error) {
    localStorage.setItem(scope.speciesMetaCloudLoadedKey, '0');
    setLastSyncError(extractErrorMessage(toActionableCloudError(error, 'Pilvest lugemine ebaõnnestus.')), scope);
    return null;
  }
}

export async function uploadSpeciesMetaJson(payload: SpeciesMetaCloudJson, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): Promise<void> {
  validateCloudConfig(scope);
  const body: SpeciesMetaCloudJson = {
    version: 1,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    items: normalizeCloudItems(payload.items),
  };
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(scope.speciesMetaCloudFilePath, blob, {
    contentType: 'application/json',
    cacheControl: '0',
    upsert: true,
  });
  console.info('[species-meta-cloud] metadata save response', { path: scope.speciesMetaCloudFilePath, error, updatedAt: body.updatedAt });
  if (error) throw toActionableCloudError(error, 'Pilve salvestamine ebaõnnestus.');
}

export async function refreshSpeciesMetaFromCloud(options?: { force?: boolean; scope?: SpeciesScopeConfig }): Promise<{ updated: boolean; merged: Record<string, SpeciesMeta> }> {
  const scope = options?.scope || LINNULIIGID_SCOPE;
  const force = !!options?.force;
  const local = loadSpeciesMeta(scope);
  console.info('[species-meta-cloud] refresh start', { force, bucket: BUCKET, path: scope.speciesMetaCloudFilePath });
  const cloud = await downloadSpeciesMetaJson(scope);
  if (!cloud) {
    localStorage.setItem(scope.speciesMetaLastSyncAtKey, new Date().toISOString());
    if (!localStorage.getItem(scope.speciesMetaLastSyncErrorKey)) {
      setLastSyncError('Pilvest lugemine ebaõnnestus.', scope);
    }
    console.warn('[species-meta-cloud] refresh skipped, cloud payload unavailable');
    log('❌ cloud sync fail: ' + (localStorage.getItem(scope.speciesMetaLastSyncErrorKey) || 'unavailable'));
    return { updated: false, merged: local };
  }

  const prevUpdatedAt = localStorage.getItem(scope.speciesMetaCloudUpdatedAtKey) || '';
  if (!force && cloud.updatedAt && prevUpdatedAt && cloud.updatedAt === prevUpdatedAt) {
    localStorage.setItem(scope.speciesMetaLastSyncAtKey, new Date().toISOString());
    return { updated: false, merged: local };
  }
  const merged = mergeCloudOverLocal(local, cloud);
  const updated = Boolean(cloud.updatedAt && cloud.updatedAt !== prevUpdatedAt);
  replaceSpeciesMeta(merged, scope);
  localStorage.setItem(scope.speciesMetaCloudUpdatedAtKey, cloud.updatedAt || '');
  localStorage.setItem(scope.speciesMetaLastSyncAtKey, new Date().toISOString());
  clearLastSyncError(scope);
  console.info('[species-meta-cloud] refresh end', { updatedAt: cloud.updatedAt, updated });
  log('☁️ cloud sync: ' + (updated ? 'updated' : 'no changes'));

  if (updated) {
    try { window.dispatchEvent(new CustomEvent('species-meta-updated')); } catch {}
  }
  return { updated, merged };
}

export async function saveSpeciesMetaToCloud(speciesName: string, patch: Partial<SpeciesMeta>, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): Promise<Record<string, SpeciesMeta>> {
  const key = normalizeSpeciesName(speciesName);
  if (!key) {
    const error = new Error('Liik on valimata.');
    setLastSyncError(error.message, scope);
    throw error;
  }

  validateCloudConfig(scope);
  console.info('[species-meta-cloud] metadata save start', {
    species: key,
    patch,
    bucket: BUCKET,
    path: scope.speciesMetaCloudFilePath,
  });

  const latest = (await downloadSpeciesMetaJson(scope)) || { version: 1 as const, updatedAt: new Date().toISOString(), items: {} };
  const nextItems = { ...latest.items };
  const prev = nextItems[key] || {};
  nextItems[key] = {
    ...prev,
    ...normalizeCloudItem({ ...prev, ...patch }),
  };

  const nextPayload: SpeciesMetaCloudJson = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: nextItems,
  };

  try {
    await uploadSpeciesMetaJson(nextPayload, scope);
    const merged = mergeCloudOverLocal(loadSpeciesMeta(scope), nextPayload);
    replaceSpeciesMeta(merged, scope);
    localStorage.setItem(scope.speciesMetaCloudUpdatedAtKey, nextPayload.updatedAt || '');
    localStorage.setItem(scope.speciesMetaLastSyncAtKey, new Date().toISOString());
    clearLastSyncError(scope);
    console.info('[species-meta-cloud] metadata save end', {
      species: key,
      updatedAt: nextPayload.updatedAt,
      items: Object.keys(nextPayload.items).length,
    });
    try { window.dispatchEvent(new CustomEvent('species-meta-updated')); } catch {}
    return merged;
  } catch (error) {
    const actionableError = toActionableCloudError(error, 'Pilve salvestamine ebaõnnestus.');
    setLastSyncError(actionableError.message, scope);
    console.error('[species-meta-cloud] metadata save error', {
      species: key,
      patch,
      error,
      message: actionableError.message,
    });
    throw actionableError;
  }
}

export function getSpeciesMetaSyncStatus(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): SpeciesMetaSyncStatus {
  return {
    cloudLoaded: localStorage.getItem(scope.speciesMetaCloudLoadedKey || CLOUD_LOADED_KEY) === '1',
    cloudUpdatedAt: localStorage.getItem(scope.speciesMetaCloudUpdatedAtKey || CLOUD_UPDATED_AT_KEY) || '',
    localUpdatedAt: localStorage.getItem(scope.speciesMetaLocalUpdatedAtKey || SPECIES_META_LOCAL_UPDATED_AT_KEY) || '',
    lastSyncAt: localStorage.getItem(scope.speciesMetaLastSyncAtKey || SPECIES_META_LAST_SYNC_AT_KEY) || '',
    lastSyncError: localStorage.getItem(scope.speciesMetaLastSyncErrorKey || LAST_SYNC_ERROR_KEY) || '',
  };
}

export { FILE_PATH, CLOUD_UPDATED_AT_KEY, CLOUD_LOADED_KEY, LAST_SYNC_ERROR_KEY };
