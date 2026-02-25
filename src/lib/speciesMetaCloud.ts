import { supabase } from '@/integrations/supabase/client';
import { loadSpeciesMeta, replaceSpeciesMeta, type SpeciesMeta } from '@/lib/speciesMeta';
import { normalizeSpeciesName, normalizeUiText } from '@/lib/textNormalize';

const BUCKET = 'bird-avatars';
const FILE_PATH = 'meta/species_meta_v1.json';
const CLOUD_UPDATED_AT_KEY = 'estbirding.speciesMeta.cloud.updatedAt';

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
  const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
  if (error || !data) return null;
  try {
    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<SpeciesMetaCloudJson>;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      items: normalizeCloudItems(parsed.items),
    };
  } catch {
    return null;
  }
}

export async function uploadSpeciesMetaJson(payload: SpeciesMetaCloudJson): Promise<void> {
  const body: SpeciesMetaCloudJson = {
    version: 1,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    items: normalizeCloudItems(payload.items),
  };
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw new Error(error.message || 'Cloud upload failed');
}

export async function refreshSpeciesMetaFromCloud(): Promise<{ updated: boolean; merged: Record<string, SpeciesMeta> }> {
  const local = loadSpeciesMeta();
  const cloud = await downloadSpeciesMetaJson();
  if (!cloud) return { updated: false, merged: local };

  const prevUpdatedAt = localStorage.getItem(CLOUD_UPDATED_AT_KEY) || '';
  const merged = mergeCloudOverLocal(local, cloud);
  replaceSpeciesMeta(merged);
  localStorage.setItem(CLOUD_UPDATED_AT_KEY, cloud.updatedAt || '');

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
  try { window.dispatchEvent(new CustomEvent('species-meta-updated')); } catch {}
  return merged;
}