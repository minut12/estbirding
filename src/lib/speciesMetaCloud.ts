import { supabase } from '@/config/supabaseClient';
import { getSupabaseInitError } from '@/config/supabaseClient';
import { validateSupabaseConfig } from '@/config/supabaseConfig';
import { loadSpeciesMeta, replaceSpeciesMeta, SPECIES_META_LOCAL_UPDATED_AT_KEY, type SpeciesMeta } from '@/lib/speciesMeta';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';

const BUCKET = 'bird-avatars';
const FILE_PATH = 'meta/species_meta_v1.json';
const CLOUD_UPDATED_AT_KEY = 'estbirding.speciesMeta.cloud.updatedAt';
export const SPECIES_META_LAST_SYNC_AT_KEY = 'estbirding.speciesMeta.lastSyncAt';
const CLOUD_LOADED_KEY = 'estbirding.speciesMeta.cloud.loaded';
const LAST_SYNC_ERROR_KEY = 'estbirding.speciesMeta.lastSyncError';

export type SpeciesMetaCloudItem = {
  ebirdCode?: string;
  rarityLevel?: 'none' | 'rare' | 'super' | 'mega';
  avatarUrl?: string;
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

function setLastSyncError(message: string): void {
  localStorage.setItem(LAST_SYNC_ERROR_KEY, message);
}

function clearLastSyncError(): void {
  localStorage.setItem(LAST_SYNC_ERROR_KEY, '');
}

function validateCloudConfig(): void {
  const initError = getSupabaseInitError();
  if (initError) throw new Error(initError);

  const validation = validateSupabaseConfig();
  if (!validation.ok) throw new Error(validation.error || 'Supabase seadistus puudub.');

  if (!BUCKET || !FILE_PATH) {
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
    };
  }
  return merged;
}

export async function downloadSpeciesMetaJson(): Promise<SpeciesMetaCloudJson | null> {
  try {
    validateCloudConfig();
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error) {
      const message = extractErrorMessage(error);
      if (/not found|404|object not found/i.test(message)) return null;
      throw error;
    }
    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<SpeciesMetaCloudJson>;
    localStorage.setItem(CLOUD_LOADED_KEY, '1');
    clearLastSyncError();
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      items: normalizeCloudItems(parsed.items),
    };
  } catch (error) {
    localStorage.setItem(CLOUD_LOADED_KEY, '0');
    setLastSyncError(extractErrorMessage(toActionableCloudError(error, 'Pilvest lugemine ebaõnnestus.')));
    return null;
  }
}

export async function uploadSpeciesMetaJson(payload: SpeciesMetaCloudJson): Promise<void> {
  validateCloudConfig();
  const body: SpeciesMetaCloudJson = {
    version: 1,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    items: normalizeCloudItems(payload.items),
  };
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
    contentType: 'application/json',
    cacheControl: '0',
    upsert: true,
  });
  console.info('[species-meta-cloud] metadata save response', { path: FILE_PATH, error, updatedAt: body.updatedAt });
  if (error) throw toActionableCloudError(error, 'Pilve salvestamine ebaõnnestus.');
}

export async function refreshSpeciesMetaFromCloud(options?: { force?: boolean }): Promise<{ updated: boolean; merged: Record<string, SpeciesMeta> }> {
  const force = !!options?.force;
  const local = loadSpeciesMeta();
  console.info('[species-meta-cloud] refresh start', { force, bucket: BUCKET, path: FILE_PATH });
  const cloud = await downloadSpeciesMetaJson();
  if (!cloud) {
    localStorage.setItem(SPECIES_META_LAST_SYNC_AT_KEY, new Date().toISOString());
    if (!localStorage.getItem(LAST_SYNC_ERROR_KEY)) {
      setLastSyncError('Pilvest lugemine ebaõnnestus.');
    }
    console.warn('[species-meta-cloud] refresh skipped, cloud payload unavailable');
    return { updated: false, merged: local };
  }

  const prevUpdatedAt = localStorage.getItem(CLOUD_UPDATED_AT_KEY) || '';
  if (!force && cloud.updatedAt && prevUpdatedAt && cloud.updatedAt === prevUpdatedAt) {
    localStorage.setItem(SPECIES_META_LAST_SYNC_AT_KEY, new Date().toISOString());
    return { updated: false, merged: local };
  }
  const merged = mergeCloudOverLocal(local, cloud);
  const updated = Boolean(cloud.updatedAt && cloud.updatedAt !== prevUpdatedAt);
  replaceSpeciesMeta(merged);
  localStorage.setItem(CLOUD_UPDATED_AT_KEY, cloud.updatedAt || '');
  localStorage.setItem(SPECIES_META_LAST_SYNC_AT_KEY, new Date().toISOString());
  clearLastSyncError();
  console.info('[species-meta-cloud] refresh end', { updatedAt: cloud.updatedAt, updated });

  if (updated) {
    try { window.dispatchEvent(new CustomEvent('species-meta-updated')); } catch {}
  }
  return { updated, merged };
}

export async function saveSpeciesMetaToCloud(speciesName: string, patch: Partial<SpeciesMeta>): Promise<Record<string, SpeciesMeta>> {
  const key = normalizeSpeciesName(speciesName);
  if (!key) {
    const error = new Error('Liik on valimata.');
    setLastSyncError(error.message);
    throw error;
  }

  validateCloudConfig();
  console.info('[species-meta-cloud] metadata save start', {
    species: key,
    patch,
    bucket: BUCKET,
    path: FILE_PATH,
  });

  const latest = (await downloadSpeciesMetaJson()) || { version: 1 as const, updatedAt: new Date().toISOString(), items: {} };
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
    await uploadSpeciesMetaJson(nextPayload);
    const merged = mergeCloudOverLocal(loadSpeciesMeta(), nextPayload);
    replaceSpeciesMeta(merged);
    localStorage.setItem(CLOUD_UPDATED_AT_KEY, nextPayload.updatedAt || '');
    localStorage.setItem(SPECIES_META_LAST_SYNC_AT_KEY, new Date().toISOString());
    clearLastSyncError();
    console.info('[species-meta-cloud] metadata save end', {
      species: key,
      updatedAt: nextPayload.updatedAt,
      items: Object.keys(nextPayload.items).length,
    });
    try { window.dispatchEvent(new CustomEvent('species-meta-updated')); } catch {}
    return merged;
  } catch (error) {
    const actionableError = toActionableCloudError(error, 'Pilve salvestamine ebaõnnestus.');
    setLastSyncError(actionableError.message);
    console.error('[species-meta-cloud] metadata save error', {
      species: key,
      patch,
      error,
      message: actionableError.message,
    });
    throw actionableError;
  }
}

export function getSpeciesMetaSyncStatus(): SpeciesMetaSyncStatus {
  return {
    cloudLoaded: localStorage.getItem(CLOUD_LOADED_KEY) === '1',
    cloudUpdatedAt: localStorage.getItem(CLOUD_UPDATED_AT_KEY) || '',
    localUpdatedAt: localStorage.getItem(SPECIES_META_LOCAL_UPDATED_AT_KEY) || '',
    lastSyncAt: localStorage.getItem(SPECIES_META_LAST_SYNC_AT_KEY) || '',
    lastSyncError: localStorage.getItem(LAST_SYNC_ERROR_KEY) || '',
  };
}
