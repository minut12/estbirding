import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/config/supabaseClient";

export async function ensureProfile(user: User): Promise<void> {
  const payload = {
    id: user.id,
    display_name: user.user_metadata?.display_name ?? user.email ?? null,
  };
  const { error } = await (supabase as any)
    .from("profiles")
    .upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        ensureProfile(data.session.user).catch(() => {});
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        ensureProfile(nextSession.user).catch(() => {});
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, loading };
}
