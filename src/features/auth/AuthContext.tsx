import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { toast } from 'sonner';
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
    throw new Error('get_user_role: ' + error.message);
  }
  return (data as AppRole) ?? null;
}

async function fetchUserPermissions(userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_user_permissions', { _user_id: userId });
  if (error) {
    console.warn('[auth] get_user_permissions error:', error.message);
    throw new Error('get_user_permissions: ' + error.message);
  }
  return Array.isArray(data) ? data : [];
}

// P183b: last known role/permissions, so the map picker and menus survive offline.
// UI hint only; data access is still enforced by RLS. Cleared on SIGNED_OUT.
const ROLE_CACHE_KEY = 'estbirding.roleCache.v1';
type RoleCache = { userId: string; role: AppRole | null; permissions: string[] };

function readRoleCache(): RoleCache | null {
  try {
    const raw = localStorage.getItem(ROLE_CACHE_KEY);
    const c = raw ? (JSON.parse(raw) as RoleCache) : null;
    return c && typeof c.userId === 'string' && Array.isArray(c.permissions) ? c : null;
  } catch {
    return null;
  }
}

function writeRoleCache(c: RoleCache | null): void {
  try {
    if (c) localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(c));
    else localStorage.removeItem(ROLE_CACHE_KEY);
  } catch {
    /* storage full or blocked: the cache is optional */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const disabledCheckedRef = useRef<string | null>(null);

  const loadRoleAndPermissions = useCallback(async (u: User) => {
    try {
      const [r, p] = await Promise.all([fetchUserRole(u.id), fetchUserPermissions(u.id)]);
      setRole(r);
      setPermissions(p);
      writeRoleCache({ userId: u.id, role: r, permissions: p });
    } catch (err) {
      // P183b: Supabase unreachable - keep the last known role for this user.
      console.warn('[auth] role/permissions unavailable, using cached', err);
      const c = readRoleCache();
      if (c && c.userId === u.id) {
        setRole(c.role);
        setPermissions(c.permissions);
      }
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (user) await loadRoleAndPermissions(user);
  }, [user, loadRoleAndPermissions]);

  useEffect(() => {
    let mounted = true;

    // Once per sign-in: a disabled account is signed out. Fails open if the profile read fails.
    const checkDisabled = async (u: User) => {
      if (disabledCheckedRef.current === u.id) return;
      try {
        disabledCheckedRef.current = u.id;
        const { data, error } = await supabase.from('profiles').select('status').eq('id', u.id).maybeSingle();
        if (error || !data) return;
        if (data.status === 'disabled') {
          toast.error('Sinu konto on keelatud.');
          void supabase.auth.signOut();
        }
      } catch {
        /* fail open */
      }
    };

    // Helper to load profile + role without blocking the auth listener
    const handleUser = (u: User | null) => {
      if (!u) {
        disabledCheckedRef.current = null;
        // P183b: offline with an expired token Supabase reports no user; keep the last role until the network is back.
        const cached = !navigator.onLine ? readRoleCache() : null;
        setRole(cached ? cached.role : null);
        setPermissions(cached ? cached.permissions : []);
        if (mounted) setLoading(false);
        return;
      }
      const cached = readRoleCache();
      if (cached && cached.userId === u.id) {
        setRole(cached.role);
        setPermissions(cached.permissions);
      }
      // Fire-and-forget: do NOT await inside onAuthStateChange
      ensureProfileAndRole(u)
        .then(() => {
          void checkDisabled(u);
          return loadRoleAndPermissions(u);
        })
        .catch((err) => console.warn('[auth] handleUser error:', err))
        .finally(() => { if (mounted) setLoading(false); });
    };

    // Set up listener BEFORE getSession per Supabase best practice
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') writeRoleCache(null);
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
    writeRoleCache(null);
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
