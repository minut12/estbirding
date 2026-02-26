import { getSupabaseClient, getSupabaseInitError } from '@/config/supabaseClient';
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

function requireSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(getSupabaseInitError() || "Supabase not configured");
  return supabase;
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
    const supabase = requireSupabase();
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(FILE_PATH);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<SpeciesMetaCloudJson>;
    localStorage.setItem(CLOUD_LOADED_KEY, '1');
    localStorage.setItem(LAST_SYNC_ERROR_KEY, '');
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      items: normalizeCloudItems(parsed.items),
    };
  } catch {
    localStorage.setItem(CLOUD_LOADED_KEY, '0');
    return null;
  }
}

export async function uploadSpeciesMetaJson(payload: SpeciesMetaCloudJson): Promise<void> {
  const supabase = requireSupabase();
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
  if (error) throw new Error(error.message || 'Cloud upload failed');
}

export async function refreshSpeciesMetaFromCloud(options?: { force?: boolean }): Promise<{ updated: boolean; merged: Record<string, SpeciesMeta> }> {
  const force = !!options?.force;
  const local = loadSpeciesMeta();
  const cloud = await downloadSpeciesMetaJson();
  if (!cloud) {
    localStorage.setItem(SPECIES_META_LAST_SYNC_AT_KEY, new Date().toISOString());
    localStorage.setItem(LAST_SYNC_ERROR_KEY, 'Cloud download failed');
    return { updated: false, merged: local };
  }

  const prevUpdatedAt = localStorage.getItem(CLOUD_UPDATED_AT_KEY) || '';
  if (!force && cloud.updatedAt && prevUpdatedAt && cloud.updatedAt === prevUpdatedAt) {
    localStorage.setItem(SPECIES_META_LAST_SYNC_AT_KEY, new Date().toISOString());
    return { updated: false, merged: local };
  }
  const merged = mergeCloudOverLocal(local, cloud);
  replaceSpeciesMeta(merged);
  localStorage.setItem(CLOUD_UPDATED_AT_KEY, cloud.updatedAt || '');
  localStorage.setItem(SPECIES_META_LAST_SYNC_AT_KEY, new Date().toISOString());
  localStorage.setItem(LAST_SYNC_ERROR_KEY, '');

  const updated = Boolean(cloud.updatedAt && cloud.updatedAt !== prevUpdatedAt);
  if (updated) {
    try { window.dispatchEvent(new CustomEvent('species-meta-updated')); } catch {}
  }
  return { updated, merged };
}

export async function saveSpeciesMetaToCloud(speciesName: string, patch: Partial<SpeciesMeta>): Promise<Record<string, SpeciesMeta>> {
  const key = normalizeSpeciesName(speciesName);
  if (!key) return loadSpeciesMeta();

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

  await uploadSpeciesMetaJson(nextPayload);

  const confirmed = await downloadSpeciesMetaJson();
  const cloudFinal = confirmed || nextPayload;
  const merged = mergeCloudOverLocal(loadSpeciesMeta(), cloudFinal);
  replaceSpeciesMeta(merged);
  localStorage.setItem(CLOUD_UPDATED_AT_KEY, cloudFinal.updatedAt || '');
  localStorage.setItem(SPECIES_META_LAST_SYNC_AT_KEY, new Date().toISOString());
  localStorage.setItem(LAST_SYNC_ERROR_KEY, '');
  try { window.dispatchEvent(new CustomEvent('species-meta-updated')); } catch {}
  return merged;
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
