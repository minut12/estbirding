// src/lib/pushSubscriptionApi.ts
// P181: all push_subscriptions access goes through endpoint-keyed RPCs.
// Knowing the endpoint is the credential; the table itself is not readable or
// writable by anon/authenticated once P181c lands.
import { supabase } from '@/config/supabaseClient';

export type PushSubRow = {
  endpoint: string;
  subscribed_species: string[] | null;
  device_label: string | null;
  updated_at: string;
};

export async function getPushSub(endpoint: string): Promise<{ row: PushSubRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('push_sub_get', { p_endpoint: endpoint });
  if (error) return { row: null, error: error.message };
  const rows = (data ?? []) as PushSubRow[];
  return { row: rows[0] ?? null, error: null };
}

export async function upsertPushSub(args: {
  endpoint: string;
  p256dh: string;
  auth: string;
  species?: string[] | null;
  deviceLabel?: string | null;
}): Promise<string | null> {
  const { error } = await supabase.rpc('push_sub_upsert', {
    p_endpoint: args.endpoint,
    p_p256dh: args.p256dh,
    p_auth: args.auth,
    p_species: args.species ?? null,
    p_device_label: args.deviceLabel ?? null,
  });
  return error ? error.message : null;
}

export async function deletePushSub(endpoint: string): Promise<string | null> {
  const { error } = await supabase.rpc('push_sub_delete', { p_endpoint: endpoint });
  return error ? error.message : null;
}
