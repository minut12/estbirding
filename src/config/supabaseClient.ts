import { supabase as integrationSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let initError: string | null = null;
const client: SupabaseClient<Database> | null = integrationSupabase ?? null;

if (!client) {
  initError = "Supabase client is not initialized.";
}

export const supabase = integrationSupabase;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  return client;
}

export function getSupabaseInitError(): string | null {
  return initError;
}
