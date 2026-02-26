import { getSupabaseClient, getSupabaseInitError } from "@/lib/supabase";

export type ProfileRow = {
  id: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
};

export async function getMyProfile(): Promise<ProfileRow | null> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error(getSupabaseInitError() || "Supabase not configured");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id, display_name, is_admin, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const payload = {
      id: user.id,
      display_name: user.user_metadata?.display_name ?? user.email ?? null,
      is_admin: false,
    };
    const { data: inserted, error: upsertError } = await (supabase as any)
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("id, display_name, is_admin, created_at")
      .single();
    if (upsertError) throw upsertError;
    return inserted as ProfileRow;
  }

  return data as ProfileRow;
}

export async function isAdmin(): Promise<boolean> {
  try {
    const profile = await getMyProfile();
    return Boolean(profile?.is_admin);
  } catch {
    return false;
  }
}
