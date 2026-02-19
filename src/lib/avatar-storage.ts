/**
 * Avatar storage utilities for Linnuliigid map.
 * Stores processed images as data URLs in localStorage.
 */

const STORAGE_KEY = 'linnuliigid_avatars_v1';
const MAX_SIZE = 256;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export type AvatarMap = Record<string, string>; // speciesKey -> dataUrl

/** Load all avatars from localStorage */
export function loadAvatars(): AvatarMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Save full avatar map to localStorage */
function persistAvatars(map: AvatarMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    throw new Error('Salvestusruum on täis. Eemalda mõni avatar enne uue lisamist.');
  }
}

/** Save a single avatar */
export function saveAvatar(key: string, dataUrl: string): void {
  const m = loadAvatars();
  m[key] = dataUrl;
  persistAvatars(m);
  // Also sync to the map's own localStorage key so iframe picks it up
  syncToMapStorage(m);
}

/** Remove a single avatar */
export function removeAvatar(key: string): void {
  const m = loadAvatars();
  delete m[key];
  persistAvatars(m);
  syncToMapStorage(m);
}

/** Reset avatar (remove override so auto-detect / placeholder shows) */
export function resetAvatar(key: string): void {
  removeAvatar(key);
  // Also remove from the map's own localStorage key
  try {
    const mapAvatars = JSON.parse(localStorage.getItem('bm_rari_avatars') || '{}');
    delete mapAvatars[key];
    localStorage.setItem('bm_rari_avatars', JSON.stringify(mapAvatars));
  } catch { /* ignore */ }
}

/** Sync our avatar store into the map's LS key (bm_rari_avatars) */
function syncToMapStorage(avatars: AvatarMap): void {
  try {
    const existing = JSON.parse(localStorage.getItem('bm_rari_avatars') || '{}');
    // Merge our avatars on top
    const merged = { ...existing, ...avatars };
    // Remove keys that we deleted (not in our map but were from our namespace)
    for (const k of Object.keys(existing)) {
      if (!(k in avatars) && existing[k]?.startsWith('data:')) {
        delete merged[k];
      }
    }
    localStorage.setItem('bm_rari_avatars', JSON.stringify(merged));
  } catch { /* ignore */ }
}

/** Validate uploaded file */
export function validateFile(file: File): string | null {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return 'Lubatud on ainult PNG, JPEG ja WebP failid.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return 'Fail on liiga suur (max 5 MB).';
  }
  return null;
}

/**
 * Process an image file: resize to MAX_SIZE, compress, return data URL.
 */
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
          // Try WebP first, fall back to JPEG
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

/** Send avatar update to the map iframe */
export function notifyIframe(action: 'update' | 'reset', key: string, dataUrl?: string): void {
  try {
    const iframe = document.querySelector('iframe[src*="linnuliigid"]') as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return;
    const avatars = loadAvatars();
    iframe.contentWindow.postMessage({ type: 'AVATARS_UPDATE', avatars }, '*');
  } catch { /* cross-origin safety */ }
}

/** Request current avatars from the iframe */
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
    if (!res.ok) throw new Error('Failed to load species.json');
    return await res.json();
  } catch {
    return [];
  }
}
