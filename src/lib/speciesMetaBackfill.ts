import { loadSpeciesMeta, type SpeciesMeta } from '@/lib/speciesMeta';
import {
  downloadSpeciesMetaJson,
  uploadSpeciesMetaJson,
  refreshSpeciesMetaFromCloud,
  type SpeciesMetaCloudJson,
} from '@/lib/speciesMetaCloud';
import { normalizeSpeciesName } from '@/lib/textNormalize';

const BACKFILL_FLAG_KEY = 'estbirding.speciesMeta.bundled.backfilled.v1';

type IframeDicts = {
  scinames: Record<string, string>;
  ebirdCodes: Record<string, string>;
};

function readIframeDicts(): IframeDicts | null {
  try {
    const iframe = document.querySelector(
      'iframe[src*="linnuliigid"]',
    ) as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return null;
    const win = iframe.contentWindow as any;
    const scinames = win.SPECIES_SCINAMES;
    const ebirdCodes = win.SPECIES_EBIRD_CODES;
    if (!scinames || typeof scinames !== 'object') return null;
    if (!ebirdCodes || typeof ebirdCodes !== 'object') return null;
    return { scinames, ebirdCodes };
  } catch {
    return null;
  }
}

type BackfillResult =
  | { status: 'skipped'; reason: string }
  | { status: 'no-changes'; checked: number }
  | { status: 'done'; filled: number; checked: number };

/**
 * One-time backfill: copy iframe SPECIES_SCINAMES + SPECIES_EBIRD_CODES
 * into cloud speciesMeta where currently blank. Idempotent and safe to
 * call multiple times — gated by localStorage flag.
 */
export async function runBundledSpeciesBackfill(
  options?: { force?: boolean },
): Promise<BackfillResult> {
  const force = !!options?.force;

  if (!force && localStorage.getItem(BACKFILL_FLAG_KEY) === '1') {
    return { status: 'skipped', reason: 'already-ran' };
  }

  const dicts = readIframeDicts();
  if (!dicts) {
    return { status: 'skipped', reason: 'iframe-not-ready' };
  }

  // Pull latest cloud state (so we don't clobber other devices' edits)
  const cloud =
    (await downloadSpeciesMetaJson()) ||
    ({ version: 1, updatedAt: new Date().toISOString(), items: {} } as SpeciesMetaCloudJson);

  const localMeta = loadSpeciesMeta();
  const nextItems = { ...cloud.items };

  // Build merged set of all species names from both dicts
  const allNames = new Set<string>([
    ...Object.keys(dicts.scinames),
    ...Object.keys(dicts.ebirdCodes),
  ]);

  let filled = 0;
  let checked = 0;

  for (const rawName of allNames) {
    checked++;
    const name = normalizeSpeciesName(rawName);
    if (!name) continue;

    const sciFromDict = String(dicts.scinames[rawName] || '').trim();
    const codeFromDict = String(dicts.ebirdCodes[rawName] || '').trim();

    // Existing values: cloud first, then local (cloud wins on conflicts)
    const cloudExisting = nextItems[name] || {};
    const localExisting = localMeta[name] || ({} as SpeciesMeta);

    const existingSci =
      String(cloudExisting.scientificName || '').trim() ||
      String(localExisting.scientificName || '').trim();
    const existingCode =
      String(cloudExisting.ebirdCode || '').trim() ||
      String(localExisting.ebirdCode || '').trim();

    let changed = false;
    const next = { ...cloudExisting };

    if (!existingSci && sciFromDict) {
      next.scientificName = sciFromDict;
      changed = true;
    }
    if (!existingCode && codeFromDict) {
      next.ebirdCode = codeFromDict;
      changed = true;
    }

    if (changed) {
      // Preserve existing rarityLevel / avatarUrl if any
      if (cloudExisting.rarityLevel)
        next.rarityLevel = cloudExisting.rarityLevel;
      if (cloudExisting.avatarUrl)
        next.avatarUrl = cloudExisting.avatarUrl;
      nextItems[name] = next;
      filled++;
    }
  }

  if (filled === 0) {
    localStorage.setItem(BACKFILL_FLAG_KEY, '1');
    return { status: 'no-changes', checked };
  }

  // Single bulk upload
  const payload: SpeciesMetaCloudJson = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: nextItems,
  };

  await uploadSpeciesMetaJson(payload);

  // Refresh local cache so the UI sees the new fields immediately
  await refreshSpeciesMetaFromCloud({ force: true }).catch(() => {});

  localStorage.setItem(BACKFILL_FLAG_KEY, '1');

  // Notify any listeners (AvatarManager, MapTab) to re-read
  try {
    window.dispatchEvent(new CustomEvent('species-meta-updated'));
  } catch {}

  return { status: 'done', filled, checked };
}

/** For debugging: clear the flag so backfill runs again on next trigger. */
export function clearBundledBackfillFlag(): void {
  try {
    localStorage.removeItem(BACKFILL_FLAG_KEY);
  } catch {}
}

if (typeof window !== 'undefined') {
  (window as any).__speciesBackfill = {
    run: (force = false) => runBundledSpeciesBackfill({ force }),
    clearFlag: clearBundledBackfillFlag,
  };
}
