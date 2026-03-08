import { useEffect, useState, useCallback } from 'react';
import { useAuth, type AppRole } from '@/features/auth/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Shield, ShieldCheck, User, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  status: string;
  created_at: string;
  role: AppRole;
}

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  user_level_1: 'Tase 1',
  user_level_2: 'Tase 2',
};

const ROLE_ICONS: Record<AppRole, typeof Shield> = {
  admin: ShieldCheck,
  user_level_1: User,
  user_level_2: Shield,
};

export default function AdminUsersScreen() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch profiles
      const { data: profiles, error: pErr } = await supabase
        .from('profiles' as any)
        .select('id, email, display_name, status, created_at')
        .order('created_at', { ascending: false });

      if (pErr) throw pErr;

      // Fetch roles
      const { data: roles, error: rErr } = await supabase
        .from('user_roles' as any)
        .select('user_id, role');

      if (rErr) throw rErr;

      const roleMap: Record<string, AppRole> = {};
      for (const r of (roles || [])) {
        const uid = (r as any).user_id;
        const role = (r as any).role as AppRole;
        // Pick highest role
        if (!roleMap[uid] || role === 'admin' || (role === 'user_level_2' && roleMap[uid] !== 'admin')) {
          roleMap[uid] = role;
        }
      }

      const merged: UserRow[] = (profiles || []).map((p: any) => ({
        id: p.id,
        email: p.email || '',
        display_name: p.display_name || '',
        status: p.status || 'active',
        created_at: p.created_at,
        role: roleMap[p.id] || 'user_level_1',
      }));

      setUsers(merged);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Viga', description: err.message });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  const changeRole = async (userId: string, newRole: AppRole) => {
    try {
      // Delete existing roles
      await supabase.from('user_roles' as any).delete().eq('user_id', userId);
      // Insert new role
      const { error } = await supabase
        .from('user_roles' as any)
        .insert({ user_id: userId, role: newRole });
      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      toast({ title: 'Roll muudetud', description: `Kasutaja roll muudetud: ${ROLE_LABELS[newRole]}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Viga', description: err.message });
    }
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      const { error } = await supabase
        .from('profiles' as any)
        .update({ status: newStatus })
        .eq('id', userId);
      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
      );
      toast({
        title: newStatus === 'active' ? 'Kasutaja aktiveeritud' : 'Kasutaja keelatud',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Viga', description: err.message });
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-background">
        <p className="text-muted-foreground">Ligipääs keelatud</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">Kasutajate haldamine</h1>
        <span className="ml-auto text-xs text-muted-foreground">{users.length} kasutajat</span>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {users.map((u) => {
            const RoleIcon = ROLE_ICONS[u.role];
            const isSelf = u.id === currentUser?.id;
            return (
              <div
                key={u.id}
                className={`rounded-xl border border-border bg-card p-4 space-y-3 ${
                  u.status === 'disabled' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RoleIcon className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-medium text-foreground truncate">
                        {u.display_name || u.email}
                      </span>
                      {isSelf && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Sina
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Liitunud: {new Date(u.created_at).toLocaleDateString('et-EE')}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Select
                      value={u.role}
                      onValueChange={(v) => changeRole(u.id, v as AppRole)}
                      disabled={isSelf}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user_level_2">Tase 2</SelectItem>
                        <SelectItem value="user_level_1">Tase 1</SelectItem>
                      </SelectContent>
                    </Select>

                    {!isSelf && (
                      <Button
                        variant={u.status === 'active' ? 'outline' : 'default'}
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => toggleStatus(u.id, u.status)}
                      >
                        {u.status === 'active' ? (
                          <>
                            <UserX className="w-3 h-3" /> Keela
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3" /> Aktiveeri
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
