// Legacy profile service - kept for backward compatibility
// New code should use useAuth() from @/features/auth/AuthContext
import { supabase } from "@/integrations/supabase/client";

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

export async function getMyProfile(): Promise<ProfileRow | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id, email, display_name, status, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return null;
  return (data as ProfileRow | null) ?? null;
}
