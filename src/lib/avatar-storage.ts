/**
 * Avatar storage utilities for Linnuliigid map.
 * Supports both Supabase shared storage and localStorage overrides.
 */

import { getSupabaseClient, getSupabaseInitError } from '@/config/supabaseClient';

const LOCAL_OVERRIDES_KEY = 'linnuliigid_avatars_v1';
const SHARED_CACHE_KEY = 'linnuliigid_avatar_defaults_v1';
const MAX_SIZE = 256;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export type AvatarMap = Record<string, string>; // speciesKey -> url

function requireSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(getSupabaseInitError() || "Supabase not configured");
  return supabase;
}

// ─── Local overrides (per-device, highest priority) ───

export function loadLocalOverrides(): AvatarMap {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_OVERRIDES_KEY) || '{}');
  } catch { return {}; }
}

function persistLocalOverrides(map: AvatarMap): void {
  try { localStorage.setItem(LOCAL_OVERRIDES_KEY, JSON.stringify(map)); }
  catch { throw new Error('Salvestusruum on täis.'); }
}

// ─── Shared cache (from Supabase, cached locally for fast startup) ───

export function loadSharedCache(): AvatarMap {
  try {
    return JSON.parse(localStorage.getItem(SHARED_CACHE_KEY) || '{}');
  } catch { return {}; }
}

function persistSharedCache(map: AvatarMap): void {
  try { localStorage.setItem(SHARED_CACHE_KEY, JSON.stringify(map)); }
  catch { /* ignore */ }
}

// ─── Merged view: local overrides > shared defaults > empty ───

export function getMergedAvatars(): AvatarMap {
  const shared = loadSharedCache();
  const local = loadLocalOverrides();
  return { ...shared, ...local };
}

// ─── Supabase operations ───

/** Fetch all shared avatars from the database */
export async function fetchSharedAvatars(): Promise<AvatarMap> {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('bird_avatar_map')
      .select('species_key, public_url');
    if (error) throw error;
    const map: AvatarMap = {};
    for (const row of data || []) {
      map[row.species_key] = row.public_url;
    }
    persistSharedCache(map);
    return map;
  } catch (e) {
    console.warn('Failed to fetch shared avatars:', e);
    return loadSharedCache(); // fallback to cache
  }
}

/** Slugify species key for filename */
export function slugifySpeciesKey(key: string): string {
  return key.toLowerCase()
    .replace(/õ/g, 'o').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/š/g, 's').replace(/ž/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Upload avatar to Supabase storage + upsert DB row */
export async function uploadSharedAvatar(speciesKey: string, dataUrl: string): Promise<string> {
  const supabase = requireSupabase();
  const slug = slugifySpeciesKey(speciesKey);
  const filePath = `linnuliigid/${slug}.webp`;

  // Convert data URL to blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  // Upload to storage (upsert)
  const { error: uploadError } = await supabase.storage
    .from('bird-avatars')
    .upload(filePath, blob, { contentType: 'image/webp', upsert: true });
  if (uploadError) throw new Error('Ülesladimine ebaõnnestus: ' + uploadError.message);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('bird-avatars')
    .getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  // Upsert DB row
  const { error: dbError } = await supabase
    .from('bird_avatar_map')
    .upsert({
      species_key: speciesKey,
      file_path: filePath,
      public_url: publicUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'species_key' });
  if (dbError) throw new Error('Andmebaasi salvestamine ebaõnnestus: ' + dbError.message);

  // Update local shared cache
  const cache = loadSharedCache();
  cache[speciesKey] = publicUrl;
  persistSharedCache(cache);

  return publicUrl;
}

/** Remove shared avatar from Supabase */
export async function removeSharedAvatar(speciesKey: string): Promise<void> {
  const supabase = requireSupabase();
  const slug = slugifySpeciesKey(speciesKey);
  const filePath = `linnuliigid/${slug}.webp`;

  await supabase.storage.from('bird-avatars').remove([filePath]);
  await supabase.from('bird_avatar_map').delete().eq('species_key', speciesKey);

  // Update caches
  const cache = loadSharedCache();
  delete cache[speciesKey];
  persistSharedCache(cache);

  const local = loadLocalOverrides();
  delete local[speciesKey];
  persistLocalOverrides(local);
}

// ─── Legacy compat: keep existing local avatar operations working ───

export function loadAvatars(): AvatarMap {
  return getMergedAvatars();
}

export function saveAvatar(key: string, dataUrl: string): void {
  const m = loadLocalOverrides();
  m[key] = dataUrl;
  persistLocalOverrides(m);
  syncToMapStorage(getMergedAvatars());
}

export function removeAvatar(key: string): void {
  const m = loadLocalOverrides();
  delete m[key];
  persistLocalOverrides(m);
  syncToMapStorage(getMergedAvatars());
}

export function resetAvatar(key: string): void {
  removeAvatar(key);
  try {
    const mapAvatars = JSON.parse(localStorage.getItem('bm_rari_avatars') || '{}');
    delete mapAvatars[key];
    localStorage.setItem('bm_rari_avatars', JSON.stringify(mapAvatars));
  } catch { /* ignore */ }
}

function syncToMapStorage(avatars: AvatarMap): void {
  try {
    const existing = JSON.parse(localStorage.getItem('bm_rari_avatars') || '{}');
    const merged = { ...existing, ...avatars };
    localStorage.setItem('bm_rari_avatars', JSON.stringify(merged));
  } catch { /* ignore */ }
}

// ─── Image processing ───

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
          let w = img.width, h = img.height;
          if (w > MAX_SIZE || h > MAX_SIZE) {
            const scale = MAX_SIZE / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas ei ole saadaval')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl = canvas.toDataURL('image/webp', 0.8);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          }
          resolve(dataUrl);
        } catch (e) { reject(e); }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── iframe communication ───

export function notifyIframe(avatars: AvatarMap): void {
  try {
    const iframe = document.querySelector('iframe[src*="linnuliigid"]') as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'AVATARS_DEFAULTS', avatars }, '*');
  } catch { /* cross-origin safety */ }
}

export function notifyIframeUpdate(action: 'update' | 'reset', key: string, dataUrl?: string): void {
  try {
    const iframe = document.querySelector('iframe[src*="linnuliigid"]') as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return;
    const avatars = getMergedAvatars();
    iframe.contentWindow.postMessage({ type: 'AVATARS_DEFAULTS', avatars }, '*');
  } catch { /* cross-origin safety */ }
}

export function requestAvatarsFromIframe(): void {
  try {
    const iframe = document.querySelector('iframe[src*="linnuliigid"]') as HTMLIFrameElement | null;
    iframe?.contentWindow?.postMessage({ type: 'AVATARS_REQUEST' }, '*');
  } catch { /* ignore */ }
}

/** Fetch the species list from the shared JSON */
export async function fetchSpeciesList(): Promise<string[]> {
  try {
    const res = await fetch('/maps/linnuliigid/species.json');
    if (!res.ok) throw new Error('Failed');
    return await res.json();
  } catch { return []; }
}
