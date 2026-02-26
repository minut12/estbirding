import { supabase } from "@/config/supabaseClient";
import { ensureProfile } from "./useSession";

export type ProfileRow = {
  id: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
};

export async function getMyProfile(): Promise<ProfileRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await ensureProfile(user);

  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id,display_name,is_admin,created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return (data as ProfileRow | null) ?? null;
}

export async function isAdmin(): Promise<boolean> {
  try {
    const profile = await getMyProfile();
    return Boolean(profile?.is_admin);
  } catch {
    return false;
  }
}
