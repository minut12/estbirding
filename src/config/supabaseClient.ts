import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabase as integrationClient, supabaseInitError as integrationInitError } from "@/integrations/supabase/client";

let initError: string | null = integrationInitError ?? null;
const client: SupabaseClient<Database> | null = integrationClient;

export const supabase = client;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  return client;
}

export function getSupabaseInitError(): string | null {
  if (!initError && integrationInitError) initError = integrationInitError;
  return initError;
}
