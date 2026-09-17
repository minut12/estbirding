// P35: guarantee a live push subscription AND a push_subscriptions row on every
// app launch, independent of whether the linnuliigid iframe is ever opened.
//
// Chrome rotated the last live subscription on 2026-09-10; the server correctly
// deleted the 410'd row, and nothing on the client ever re-registered, because
// the only reconcile lived inside that iframe. This one runs from the app shell.
//
// It never overwrites a non-empty subscribed_species: it writes only when the
// row is missing, or when the stored list is empty and we have something better.
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/eventLog';
import { normalizeSpeciesName } from '@/lib/textNormalize';
import {
  VAPID_PUBLIC_KEY,
  fetchRareSpeciesList,
  urlBase64ToUint8Array,
} from '@/features/settings/useNotificationSubscription';

export type ReconcileResult = 'ok' | 'resubscribed' | 'upserted' | 'patched' | 'skipped';

const NOTIFY_SPECIES_KEY = 'bm_notify_species';
const SPECIES_META_KEY = 'estbirding.speciesMeta.v1';

function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function deviceLabel(): string {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  return 'Desktop';
}

/**
 * Repair mojibake (the iframe's bell keys have arrived as `VÃ¤rbrÃ¼di` before)
 * and put the result in canonical NFC, so the same species from two sources
 * dedupes to one entry. NOT slugifySpeciesKey: that is lossy (`varbrudi`) and
 * the EF matches subscribed_species against real snapshot names.
 */
function normalizeSpecies(name: string): string {
  return normalizeSpeciesName(name).normalize('NFC');
}

/** The bell list the linnuliigid map maintains. Tolerates missing/garbage JSON. */
function readBellSpecies(): string[] {
  const out: string[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTIFY_SPECIES_KEY) || '[]');
    if (!Array.isArray(parsed)) return out;
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const name = normalizeSpecies(item);
      if (name) out.push(name);
    }
  } catch {
    // Garbage in localStorage is not an error here — the other sources cover us.
  }
  return out;
}

/** Species carrying notify === true in the shared speciesMeta blob. */
function readMetaNotifySpecies(): string[] {
  const out: string[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SPECIES_META_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
    for (const [name, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      if ((entry as { notify?: unknown }).notify !== true) continue;
      const normalized = normalizeSpecies(name);
      if (normalized) out.push(normalized);
    }
  } catch {
    // Same as above.
  }
  return out;
}

async function buildSpeciesUnion(): Promise<string[]> {
  const union = new Set<string>([...readBellSpecies(), ...readMetaNotifySpecies()]);
  try {
    for (const name of await fetchRareSpeciesList()) {
      const normalized = normalizeSpecies(name);
      if (normalized) union.add(normalized);
    }
  } catch (err) {
    console.warn('[push-reconcile] species_meta fetch failed', err);
  }
  return Array.from(union);
}

function skipped(reason: string, silent = false): ReconcileResult {
  if (!silent) log(`♻️ push-reconcile: skipped: ${reason}`);
  return 'skipped';
}

export async function reconcilePushSubscription(): Promise<ReconcileResult> {
  // Bail silently: these two fire on every launch for anyone who has not opted
  // in, and would otherwise flood the 150-line event log.
  if (!isPushSupported()) return skipped('unsupported', true);
  if (Notification.permission !== 'granted') {
    return skipped(`permission ${Notification.permission}`, true);
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  let didResubscribe = false;
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    didResubscribe = true;
    log('♻️ push-reconcile: resubscribed');
  }

  // A fresh subscription always implies a DB write below, so surface that as the
  // outcome — it is the signal that the previous endpoint had gone away.
  const finish = (outcome: ReconcileResult): ReconcileResult =>
    didResubscribe ? 'resubscribed' : outcome;

  const json = sub.toJSON();
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return skipped('tellimuse võtmed puuduvad');

  const species = await buildSpeciesUnion();

  const { data: row, error: selectErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint,subscribed_species')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (selectErr) return skipped(`select: ${selectErr.message}`);

  if (!row) {
    const { error: upsertErr } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint,
        key_p256dh: p256dh,
        key_auth: auth,
        subscribed_species: species,
        device_label: deviceLabel(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    if (upsertErr) return skipped(`upsert: ${upsertErr.message}`);
    log('♻️ push-reconcile: row upserted');
    return finish('upserted');
  }

  const stored = Array.isArray(row.subscribed_species) ? row.subscribed_species : [];
  if (stored.length === 0 && species.length > 0) {
    const { error: patchErr } = await supabase
      .from('push_subscriptions')
      .update({ subscribed_species: species })
      .eq('endpoint', endpoint);
    if (patchErr) return skipped(`patch: ${patchErr.message}`);
    log('♻️ push-reconcile: species patched');
    return finish('patched');
  }

  log('♻️ push-reconcile: ok');
  return finish('ok');
}
