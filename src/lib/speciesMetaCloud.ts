import { supabase } from '@/integrations/supabase/client';
import { normalizeUiText } from '@/lib/textNormalize';
import type { SpeciesMeta } from '@/lib/speciesMeta';

const BUCKET = 'bird-avatars';
const FILE_PATH = 'meta/species_meta_v1.json';

export type SpeciesMetaCloudFile = {
  version: 1;
  updatedAt: string;
  items: Record<string, Omit<SpeciesMeta, 'name'>>;
};

function normalizeKey(name: string): string {
  return normalizeUiText(name);
}

function sanitizeMeta(item: Partial<SpeciesMeta> | undefined): Omit<SpeciesMeta, 'name'> {
  const rarity = item?.rarityLevel;
  const rarityLevel = rarity === 'rare' || rarity === 'super' || rarity === 'mega' || rarity === 'none' ? rarity : 'none';
  return {
    ebirdCode: normalizeUiText(String(item?.ebirdCode || '')),
    avatarUrl: normalizeUiText(String(item?.avatarUrl || '')),
    rarityLevel,
  };
}

function normalizeItems(raw: unknown): Record<string, Omit<SpeciesMeta, 'name'>> {
  const out: Record<string, Omit<SpeciesMeta, 'name'>> = {};
  const src = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  for (const [k, v] of Object.entries(src)) {
    const key = normalizeKey(k);
    if (!key) continue;
    out[key] = sanitizeMeta(v);
  }
  return out;
}

export async function loadSpeciesMetaCloud(): Promise<SpeciesMetaCloudFile | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
  if (error || !data) return null;
  const text = await data.text();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<SpeciesMetaCloudFile>;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      items: normalizeItems(parsed.items),
    };
  } catch {
    return null;
  }
}

export async function saveSpeciesMetaCloudPatch(name: string, patch: Partial<SpeciesMeta>): Promise<void> {
  const key = normalizeKey(name);
  if (!key) return;
  const current = await loadSpeciesMetaCloud();
  const items = { ...(current?.items || {}) };
  items[key] = {
    ...(items[key] || { rarityLevel: 'none' as const }),
    ...sanitizeMeta({ ...items[key], ...patch }),
  };
  const next: SpeciesMetaCloudFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };

  const blob = new Blob([JSON.stringify(next)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw new Error(error.message || 'Cloud save failed');
}

export async function mergeSpeciesMetaFromCloud(localMap: Record<string, SpeciesMeta>): Promise<Record<string, SpeciesMeta>> {
  const cloud = await loadSpeciesMetaCloud();
  if (!cloud) return localMap;
  const merged: Record<string, SpeciesMeta> = { ...localMap };
  for (const [name, meta] of Object.entries(cloud.items)) {
    merged[name] = {
      name,
      ...(merged[name] || {}),
      ...meta,
    };
  }
  return merged;
}