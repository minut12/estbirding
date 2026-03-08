import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'user_level_1' | 'user_level_2';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  permissions: string[];
  loading: boolean;
  signOut: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  isAdmin: boolean;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function ensureProfileAndRole(user: User): Promise<void> {
  // Upsert profile
  const { error: profileError } = await supabase
    .from('profiles' as any)
    .upsert(
      {
        id: user.id,
        email: user.email ?? '',
        display_name: user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? '',
      },
      { onConflict: 'id' }
    );
  if (profileError) console.warn('[auth] profile upsert error:', profileError.message);

  // Check if user already has a role
  const { data: existingRoles } = await supabase
    .from('user_roles' as any)
    .select('role')
    .eq('user_id', user.id);

  if (!existingRoles || existingRoles.length === 0) {
    // Insert default role
    const { error: roleError } = await supabase
      .from('user_roles' as any)
      .insert({ user_id: user.id, role: 'user_level_1' });
    if (roleError) console.warn('[auth] default role insert error:', roleError.message);
  }
}

async function fetchUserRole(userId: string): Promise<AppRole | null> {
  const { data, error } = await supabase.rpc('get_user_role', { _user_id: userId });
  if (error) {
    console.warn('[auth] get_user_role error:', error.message);
    return null;
  }
  return (data as AppRole) ?? null;
}

async function fetchUserPermissions(userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_user_permissions', { _user_id: userId });
  if (error) {
    console.warn('[auth] get_user_permissions error:', error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoleAndPermissions = useCallback(async (u: User) => {
    const [r, p] = await Promise.all([
      fetchUserRole(u.id),
      fetchUserPermissions(u.id),
    ]);
    setRole(r);
    setPermissions(p);
  }, []);

  const refreshRole = useCallback(async () => {
    if (user) await loadRoleAndPermissions(user);
  }, [user, loadRoleAndPermissions]);

  useEffect(() => {
    let mounted = true;

    // Helper to load profile + role without blocking the auth listener
    const handleUser = (u: User | null) => {
      if (!u) {
        setRole(null);
        setPermissions([]);
        if (mounted) setLoading(false);
        return;
      }
      // Fire-and-forget: do NOT await inside onAuthStateChange
      ensureProfileAndRole(u)
        .then(() => loadRoleAndPermissions(u))
        .catch((err) => console.warn('[auth] handleUser error:', err))
        .finally(() => { if (mounted) setLoading(false); });
    };

    // Set up listener BEFORE getSession per Supabase best practice
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      handleUser(nextSession?.user ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      handleUser(data.session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadRoleAndPermissions]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setPermissions([]);
  }, []);

  const hasPermission = useCallback(
    (key: string) => permissions.includes(key),
    [permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        permissions,
        loading,
        signOut,
        hasPermission,
        isAdmin: role === 'admin',
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
