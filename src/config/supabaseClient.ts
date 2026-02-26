import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSupabaseAnonKey, getSupabaseUrl, validateSupabaseConfig } from "@/config/supabaseConfig";

let initError: string | null = null;
let client: SupabaseClient | null = null;

function ensureSupabaseClient(): SupabaseClient | null {
  if (client) return client;

  const validation = validateSupabaseConfig();
  if (!validation.ok) {
    initError = validation.error || "Supabase config invalid";
    return null;
  }

  try {
    client = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    initError = null;
    return client;
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error);
    client = null;
    return null;
  }
}

// Backward-compatible export for existing imports.
export const supabase = ensureSupabaseClient() as SupabaseClient<Database> | null;

export function getSupabaseClient(): SupabaseClient | null {
  return ensureSupabaseClient();
}

export function getSupabaseInitError(): string | null {
  return initError;
}
