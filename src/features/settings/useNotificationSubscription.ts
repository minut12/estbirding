import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY =
  'BBugk-8xSVxkyM0-_gYvcwlno0Mu2XNzyoA1HkI812T9E4zdn8tVYfxUyucuovJIpWTjJkURu-FKTF3BirgszeQ';

const SPECIES_META_URL =
  'https://eenwcyuyugyrjgpivxrq.supabase.co/storage/v1/object/public/bird-avatars/meta/species_meta_v1.json';

export type SubscriptionState =
  | { status: 'unsupported' }
  | { status: 'unknown' }
  | { status: 'denied' }
  | { status: 'unsubscribed' }
  | { status: 'subscribed'; endpoint: string };

export interface SubscriptionAPI {
  state: SubscriptionState;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  busy: boolean;
  error: string | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function fetchRareSpeciesList(): Promise<string[]> {
  const res = await fetch(SPECIES_META_URL);
  if (!res.ok) throw new Error(`species_meta fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  const items = (data && typeof data === 'object' && data.items) || {};
  const names: string[] = [];
  for (const key of Object.keys(items)) {
    const entry = items[key];
    if (!entry || typeof entry !== 'object') continue;
    const name = typeof entry.name === 'string' && entry.name.trim()
      ? entry.name.trim()
      : key;
    if (['rare', 'super', 'mega'].includes(entry.rarityLevel)) {
      names.push(name);
    }
  }
  return Array.from(new Set(names));
}

function isSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return String(err); } catch { return 'tundmatu viga'; }
}

export function useNotificationSubscription(): SubscriptionAPI {
  const [state, setState] = useState<SubscriptionState>({ status: 'unknown' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupported()) {
        if (!cancelled) setState({ status: 'unsupported' });
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) {
          setState({ status: 'subscribed', endpoint: sub.endpoint });
          return;
        }
        if (Notification.permission === 'denied') {
          setState({ status: 'denied' });
          return;
        }
        setState({ status: 'unsubscribed' });
      } catch (err) {
        if (cancelled) return;
        setState({ status: 'unsubscribed' });
        setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    if (busy) return;
    if (!isSupported()) {
      setError('Sinu seade või brauser ei toeta push-teavitusi.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'denied') {
        if (mountedRef.current) {
          setState({ status: 'denied' });
          setError('Brauser keelas teavituste loa.');
        }
        return;
      }
      if (perm !== 'granted') {
        // 'default' — user dismissed the prompt; stay unsubscribed, no hard error
        if (mountedRef.current) {
          setState({ status: 'unsubscribed' });
          setError('Teavituste luba on jätkuvalt küsimata.');
        }
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }
      const json = sub.toJSON();
      const endpoint = json.endpoint ?? sub.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        throw new Error('Push-tellimuse võtmed puuduvad.');
      }

      let speciesList: string[] = [];
      try {
        speciesList = await fetchRareSpeciesList();
      } catch (err) {
        console.warn('[push] species_meta fetch failed, subscribing with empty list', err);
      }

      const deviceLabel = (navigator.userAgent || '').slice(0, 100);

      const { error: upsertErr } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            endpoint,
            key_p256dh: p256dh,
            key_auth: auth,
            subscribed_species: speciesList,
            device_label: deviceLabel,
          },
          { onConflict: 'endpoint' },
        );
      if (upsertErr) throw upsertErr;

      if (mountedRef.current) {
        setState({ status: 'subscribed', endpoint });
      }
    } catch (err) {
      if (mountedRef.current) setError(errorMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy]);

  const disable = useCallback(async () => {
    if (busy) return;
    if (!isSupported()) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        try {
          await sub.unsubscribe();
        } catch (err) {
          console.warn('[push] unsubscribe() threw', err);
        }
        const { error: delErr } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', endpoint);
        if (delErr) throw delErr;
      }
      if (mountedRef.current) {
        setState({ status: 'unsubscribed' });
      }
    } catch (err) {
      if (mountedRef.current) setError(errorMessage(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy]);

  return { state, enable, disable, busy, error };
}
