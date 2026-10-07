/**
 * Client for the admin-only `avatar-candidates` Edge Function plus helpers for
 * the avatar credit (author / licence) stored in bird_avatar_map.credit.
 * Must not import avatar-storage.ts (avatar-storage imports this module).
 */

import { supabase } from '@/config/supabaseClient';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/config/supabaseConfig';

export type AvatarSource = 'inaturalist' | 'wikimedia';
export type AvatarLicense = 'cc0' | 'cc-by' | 'cc-by-sa';

export type AvatarCredit = {
  author: string;
  source: AvatarSource;
  license: AvatarLicense;
  licenseUrl?: string;
  pageUrl: string;
};

export type AvatarCandidate = {
  id: string;
  source: AvatarSource;
  thumbUrl: string;
  fullUrl: string;
  author: string;
  license: AvatarLicense;
  licenseUrl: string;
  pageUrl: string;
};

export class AvatarCandidatesError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AvatarCandidatesError';
    this.status = status;
  }
}

export const AVATAR_CREDITS_LS_KEY = 'bm_avatar_credits_v2';
const LEGACY_AVATAR_CREDITS_LS_KEY = 'bm_avatar_credits_v1';

const FUNCTION_NAME = 'avatar-candidates';
const DEFAULT_ERROR = 'avatar_candidates_failed';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAvatarSource(value: unknown): value is AvatarSource {
  return value === 'inaturalist' || value === 'wikimedia';
}

function isAvatarLicense(value: unknown): value is AvatarLicense {
  return value === 'cc0' || value === 'cc-by' || value === 'cc-by-sa';
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseAvatarCredit(value: unknown): AvatarCredit | null {
  if (!isPlainRecord(value)) return null;
  const author = nonEmptyString(value.author);
  if (!author) return null;
  if (!isAvatarSource(value.source) || !isAvatarLicense(value.license)) return null;
  if (typeof value.pageUrl !== 'string') return null;
  const credit: AvatarCredit = {
    author,
    source: value.source,
    license: value.license,
    pageUrl: value.pageUrl,
  };
  return typeof value.licenseUrl === 'string' ? { ...credit, licenseUrl: value.licenseUrl } : credit;
}

function parseCandidate(item: unknown): AvatarCandidate | null {
  if (!isPlainRecord(item)) return null;
  if (!isAvatarSource(item.source) || !isAvatarLicense(item.license)) return null;
  const id = nonEmptyString(item.id);
  const thumbUrl = nonEmptyString(item.thumbUrl);
  const fullUrl = nonEmptyString(item.fullUrl);
  const author = nonEmptyString(item.author);
  const licenseUrl = nonEmptyString(item.licenseUrl);
  const pageUrl = nonEmptyString(item.pageUrl);
  if (!id || !thumbUrl || !fullUrl || !author || !licenseUrl || !pageUrl) return null;
  if (![thumbUrl, fullUrl, pageUrl, licenseUrl].every(isHttpsUrl)) return null;
  return { id, source: item.source, thumbUrl, fullUrl, author, license: item.license, licenseUrl, pageUrl };
}

export function parseCandidatesResponse(data: unknown): AvatarCandidate[] {
  if (!isPlainRecord(data) || data.ok !== true || !Array.isArray(data.candidates)) return [];
  const result: AvatarCandidate[] = [];
  for (const item of data.candidates) {
    const candidate = parseCandidate(item);
    if (candidate) result.push(candidate);
  }
  return result;
}

export function candidateToCredit(c: AvatarCandidate): AvatarCredit {
  return {
    author: c.author,
    source: c.source,
    license: c.license,
    licenseUrl: c.licenseUrl,
    pageUrl: c.pageUrl,
  };
}

async function errorFromInvoke(error: unknown): Promise<AvatarCandidatesError> {
  const maybe = error as { message?: unknown; context?: unknown } | null;
  const fallback = typeof maybe?.message === 'string' ? maybe.message : DEFAULT_ERROR;
  if (!(maybe?.context instanceof Response)) return new AvatarCandidatesError(0, fallback);
  const status = maybe.context.status;
  try {
    const payload: unknown = await maybe.context.json();
    const message = isPlainRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback;
    return new AvatarCandidatesError(status, message);
  } catch {
    return new AvatarCandidatesError(status, fallback);
  }
}

/** Searches candidate images; supabase.functions.invoke attaches the session JWT. */
export async function searchAvatarCandidates(scientificName: string): Promise<AvatarCandidate[]> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action: 'search', scientificName },
  });
  if (error) throw await errorFromInvoke(error);
  if (isPlainRecord(data) && data.ok === false) {
    throw new AvatarCandidatesError(0, typeof data.error === 'string' ? data.error : DEFAULT_ERROR);
  }
  return parseCandidatesResponse(data);
}

/**
 * Downloads the candidate thumbnail through the Edge Function byte proxy.
 * Raw fetch because functions.invoke reads image/* bodies as text.
 */
export async function fetchCandidateImageFile(c: AvatarCandidate): Promise<File> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new AvatarCandidatesError(401, 'not_signed_in');

  const res = await fetch(`${getSupabaseUrl()}/functions/v1/${FUNCTION_NAME}`, {
    method: 'POST',
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'fetch', url: c.thumbUrl }),
  });
  if (!res.ok) throw new AvatarCandidatesError(res.status, `avatar_fetch_failed_${res.status}`);

  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_EXTENSIONS[type];
  if (!ext) throw new AvatarCandidatesError(res.status, `unsupported_content_type: ${type || 'none'}`);

  const blob = await res.blob();
  return new File([blob], `${c.id}.${ext}`, { type });
}

/**
 * Credit-map key for an avatar URL: origin + pathname of an https URL, so the
 * ?v=... cache-buster and any #fragment are dropped. Returns null for anything
 * else. The map iframes apply the same rule to the URL they display.
 */
export function avatarCreditUrlKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

/** Keyed by avatarCreditUrlKey(public_url); rows without a usable https URL are skipped. */
export function buildAvatarCreditMap(rows: unknown[]): Record<string, AvatarCredit> {
  const map: Record<string, AvatarCredit> = {};
  for (const row of rows) {
    if (!isPlainRecord(row) || typeof row.public_url !== 'string') continue;
    const key = avatarCreditUrlKey(row.public_url);
    if (key === null) continue;
    const credit = parseAvatarCredit(row.credit);
    if (credit) map[key] = credit;
  }
  return map;
}

export function persistAvatarCredits(map: Record<string, AvatarCredit>): void {
  try {
    localStorage.setItem(AVATAR_CREDITS_LS_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable or full: credits are a display convenience only.
  }
  try {
    localStorage.removeItem(LEGACY_AVATAR_CREDITS_LS_KEY);
  } catch {
    // Storage unavailable: nothing to clean up.
  }
}

function loadAvatarCredits(): Record<string, AvatarCredit> {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(localStorage.getItem(AVATAR_CREDITS_LS_KEY) || '{}');
  } catch {
    return {};
  }
  if (!isPlainRecord(parsed)) return {};
  const map: Record<string, AvatarCredit> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const credit = parseAvatarCredit(value);
    if (credit) map[key] = credit;
  }
  return map;
}

export function setAvatarCreditInStorage(avatarUrl: string, credit: AvatarCredit | null): void {
  const key = avatarCreditUrlKey(avatarUrl);
  if (key === null) return;
  const current = loadAvatarCredits();
  const { [key]: _removed, ...rest } = current;
  persistAvatarCredits(credit ? { ...rest, [key]: credit } : rest);
}
