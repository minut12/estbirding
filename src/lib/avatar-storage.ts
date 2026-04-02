/**
 * Avatar storage utilities for scoped species maps.
 * Supports both Supabase shared storage and localStorage overrides.
 */

import { supabase } from '@/config/supabaseClient';
import { validateSupabaseConfig } from '@/config/supabaseConfig';
import { LINNULIIGID_SCOPE, type SpeciesScopeConfig } from '@/lib/mapScope';

const MAX_SIZE = 256;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export type AvatarMap = Record<string, string>;

function scopedSpeciesKey(speciesKey: string, scope: SpeciesScopeConfig): string {
  return `${scope.avatarSpeciesKeyPrefix}${speciesKey}`;
}

function unscopedSpeciesKey(speciesKey: string, scope: SpeciesScopeConfig): string {
  const prefix = scope.avatarSpeciesKeyPrefix;
  return speciesKey.startsWith(prefix) ? speciesKey.slice(prefix.length) : speciesKey;
}

export function loadLocalOverrides(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): AvatarMap {
  try {
    return JSON.parse(localStorage.getItem(scope.avatarLocalOverridesKey) || '{}');
  } catch {
    return {};
  }
}

function persistLocalOverrides(map: AvatarMap, scope: SpeciesScopeConfig): void {
  try {
    localStorage.setItem(scope.avatarLocalOverridesKey, JSON.stringify(map));
  } catch {
    throw new Error('Salvestusruum on täis.');
  }
}

export function loadSharedCache(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): AvatarMap {
  try {
    return JSON.parse(localStorage.getItem(scope.avatarSharedCacheKey) || '{}');
  } catch {
    return {};
  }
}

function persistSharedCache(map: AvatarMap, scope: SpeciesScopeConfig): void {
  try {
    localStorage.setItem(scope.avatarSharedCacheKey, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getMergedAvatars(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): AvatarMap {
  const shared = loadSharedCache(scope);
  const local = loadLocalOverrides(scope);
  return { ...shared, ...local };
}

/** Fetch all shared avatars via RPC to bypass PostgREST row limits */
export async function fetchSharedAvatars(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): Promise<AvatarMap> {
  try {
    console.log('[avatar-storage] fetchSharedAvatars: calling get_all_avatars RPC...');
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_all_avatars');

    if (!rpcError && rpcData && rpcData.length > 0) {
      const map: AvatarMap = {};
      for (const row of rpcData as Array<{ species_key: string; public_url: string }>) {
        if (row.species_key && row.public_url) {
          map[unscopedSpeciesKey(row.species_key, scope)] = row.public_url;
        }
      }
      console.log('[avatar-storage] fetchSharedAvatars via RPC: got', Object.keys(map).length, 'avatars');
      persistSharedCache(map, scope);
      return map;
    }

    if (rpcError) {
      console.warn('[avatar-storage] RPC failed, trying paginated fallback:', rpcError.message);
    }

    // Fallback: paginate through direct query
    const prefix = `${scope.avatarSpeciesKeyPrefix}%`;
    const map: AvatarMap = {};
    const PAGE_SIZE = 25;
    let from = 0;
    let keepGoing = true;
    while (keepGoing) {
      const { data, error } = await supabase
        .from('bird_avatar_map')
        .select('species_key, public_url')
        .like('species_key', prefix)
        .order('species_key', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const row of rows) {
        if (row.species_key && row.public_url) {
          map[unscopedSpeciesKey(row.species_key, scope)] = row.public_url;
        }
      }
      from += rows.length;
      keepGoing = rows.length === PAGE_SIZE;
    }
    console.log('[avatar-storage] fetchSharedAvatars via pagination: got', Object.keys(map).length, 'avatars');
    persistSharedCache(map, scope);
    return map;
  } catch (e) {
    console.warn('[avatar-storage] fetchSharedAvatars failed, using cache:', e);
    return loadSharedCache(scope);
  }
}

export function slugifySpeciesKey(key: string): string {
  return key.toLowerCase()
    .replace(/õ/g, 'o').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/š/g, 's').replace(/ž/g, 'z')
    .replace(/Ãµ/g, 'o').replace(/Ã¤/g, 'a').replace(/Ã¶/g, 'o').replace(/Ã¼/g, 'u')
    .replace(/Å¡/g, 's').replace(/Å¾/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error('Avatari eelvaade on vigane.');

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  if (!payload) throw new Error('Avatari eelvaade on tühi.');

  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }

  return new Blob([decodeURIComponent(payload)], { type: mimeType });
}

export async function uploadSharedAvatar(speciesKey: string, dataUrl: string, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): Promise<string> {
  const validation = validateSupabaseConfig();
  if (!validation.ok) throw new Error(validation.error || 'Supabase seadistus puudub.');

  const slug = slugifySpeciesKey(speciesKey);
  if (!slug) throw new Error('Liigi nimi puudub.');

  const filePath = `${scope.avatarFilePrefix}/${slug}.webp`;
  const blob = dataUrlToBlob(dataUrl);

  const { error: uploadError } = await supabase.storage
    .from('bird-avatars')
    .upload(filePath, blob, { contentType: 'image/webp', upsert: true });
  if (uploadError) throw new Error('Üleslaadimine ebaõnnestus: ' + uploadError.message);

  const { data: urlData } = supabase.storage.from('bird-avatars').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  const { error: dbError } = await supabase
    .from('bird_avatar_map')
    .upsert({
      species_key: scopedSpeciesKey(speciesKey, scope),
      file_path: filePath,
      public_url: publicUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'species_key' });
  if (dbError) throw new Error('Andmebaasi salvestamine ebaõnnestus: ' + dbError.message);

  const cache = loadSharedCache(scope);
  cache[speciesKey] = publicUrl;
  persistSharedCache(cache, scope);
  return publicUrl;
}

export async function removeSharedAvatar(speciesKey: string, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): Promise<void> {
  const slug = slugifySpeciesKey(speciesKey);
  const filePath = `${scope.avatarFilePrefix}/${slug}.webp`;

  await supabase.storage.from('bird-avatars').remove([filePath]);
  await supabase.from('bird_avatar_map').delete().eq('species_key', scopedSpeciesKey(speciesKey, scope));

  const cache = loadSharedCache(scope);
  delete cache[speciesKey];
  persistSharedCache(cache, scope);

  const local = loadLocalOverrides(scope);
  delete local[speciesKey];
  persistLocalOverrides(local, scope);
}

export function loadAvatars(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): AvatarMap {
  return getMergedAvatars(scope);
}

export function saveAvatar(key: string, dataUrl: string, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  const map = loadLocalOverrides(scope);
  map[key] = dataUrl;
  persistLocalOverrides(map, scope);
  syncToMapStorage(getMergedAvatars(scope), scope);
}

export function removeAvatar(key: string, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  const map = loadLocalOverrides(scope);
  delete map[key];
  persistLocalOverrides(map, scope);
  syncToMapStorage(getMergedAvatars(scope), scope);
}

export function resetAvatar(key: string, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  removeAvatar(key, scope);
  try {
    const mapAvatars = JSON.parse(localStorage.getItem(scope.legacyAvatarStorageKey) || '{}');
    delete mapAvatars[key];
    localStorage.setItem(scope.legacyAvatarStorageKey, JSON.stringify(mapAvatars));
  } catch {
    // ignore
  }
}

function syncToMapStorage(avatars: AvatarMap, scope: SpeciesScopeConfig): void {
  try {
    const existing = JSON.parse(localStorage.getItem(scope.legacyAvatarStorageKey) || '{}');
    const merged = { ...existing, ...avatars };
    localStorage.setItem(scope.legacyAvatarStorageKey, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

export function validateFile(file: File): string | null {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) return 'Lubatud on ainult PNG, JPEG ja WebP failid.';
  if (file.size > MAX_FILE_BYTES) return 'Fail on liiga suur (max 5 MB).';
  return null;
}

export function processImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Faili lugemine ebaõnnestus'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Pildi laadimine ebaõnnestus'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let w = img.width;
          let h = img.height;
          if (w > MAX_SIZE || h > MAX_SIZE) {
            const scale = MAX_SIZE / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas ei ole saadaval'));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl = canvas.toDataURL('image/webp', 0.8);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          }
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function findMapIframe(scope: SpeciesScopeConfig): HTMLIFrameElement | null {
  return document.querySelector(`iframe[src*="${scope.mapPath.replace('/index.html', '')}"]`) as HTMLIFrameElement | null;
}

export function notifyIframe(avatars: AvatarMap, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  try {
    const iframe = findMapIframe(scope);
    iframe?.contentWindow?.postMessage({ type: 'AVATARS_DEFAULTS', avatars }, '*');
  } catch {
    // ignore
  }
}

export function notifyIframeUpdate(action: 'update' | 'reset', key: string, dataUrl?: string, scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  void action;
  void key;
  void dataUrl;
  try {
    const iframe = findMapIframe(scope);
    iframe?.contentWindow?.postMessage({ type: 'AVATARS_DEFAULTS', avatars: getMergedAvatars(scope) }, '*');
  } catch {
    // ignore
  }
}

export function requestAvatarsFromIframe(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): void {
  try {
    const iframe = findMapIframe(scope);
    iframe?.contentWindow?.postMessage({ type: 'AVATARS_REQUEST' }, '*');
  } catch {
    // ignore
  }
}

export async function fetchSpeciesList(scope: SpeciesScopeConfig = LINNULIIGID_SCOPE): Promise<string[]> {
  try {
    const { loadCustomSpecies } = await import('@/lib/customSpecies');
    const res = await fetch(scope.speciesJsonPath);
    if (!res.ok) throw new Error('Failed');
    const baseList: string[] = await res.json();
    const custom = loadCustomSpecies();
    const merged = [...new Set([...baseList, ...custom])];
    merged.sort((a, b) => a.localeCompare(b, 'et'));
    return merged;
  } catch {
    try {
      const { loadCustomSpecies } = await import('@/lib/customSpecies');
      const custom = loadCustomSpecies();
      return custom.length > 0 ? custom : [];
    } catch {
      return [];
    }
  }
}
