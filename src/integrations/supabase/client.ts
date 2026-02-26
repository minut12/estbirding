import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { validateSupabaseConfig } from './config';

let _client: SupabaseClient<Database> | null = null;
let _initError: string | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (_client) return _client;

  const validation = validateSupabaseConfig();
  if (!validation.ok || !validation.url || !validation.key) {
    _initError = validation.error || "Supabase seadistus puudub.";
    return null;
  }

  try {
    _client = createClient<Database>(validation.url, validation.key, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    _initError = null;
    return _client;
  } catch (error) {
    _initError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export function getSupabaseInitError(): string | null {
  if (_client) return null;
  if (_initError) return _initError;
  const validation = validateSupabaseConfig();
  if (!validation.ok) {
    _initError = validation.error || "Supabase seadistus puudub.";
    return _initError;
  }
  return null;
}
