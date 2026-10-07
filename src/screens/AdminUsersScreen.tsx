import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import {
  formatSignIn,
  isRecentSignIn,
  listAdminUsers,
  ROLE_LABEL,
  type AdminRole,
  type AdminUser,
} from '@/features/admin/adminUsers';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

type RoleFilter = 'all' | AdminRole;

const FILTER_ROLES: readonly AdminRole[] = ['admin', 'user_level_2', 'user_level_1'];

const AVATAR_SELF_CLASS = 'bg-[#2D764B] text-white';
const AVATAR_ALT_CLASSES = ['bg-[#DCE6EC] text-[#2E4F63]', 'bg-[#E7E3D6] text-[#5C4F25]'] as const;

const CHIP_BASE_CLASS = 'inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-xs font-semibold';
const ROLE_CHIP_CLASS: Record<AdminRole, string> = {
  admin: 'bg-[#E6F0E9] text-[#24603D]',
  user_level_2: 'bg-[#EEF2EF] text-[#4A5951]',
  user_level_1: 'bg-[#EEF2EF] text-[#4A5951]',
};

function shownName(u: AdminUser): string {
  return u.displayName || u.email;
}

function initialOf(u: AdminUser): string {
  const name = shownName(u);
  return name ? name.charAt(0).toUpperCase() : '?';
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Tundmatu viga';
}

export default function AdminUsersScreen() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listAdminUsers()
      .then((rows) => {
        if (!cancelled) setUsers(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const roleCounts = useMemo(() => {
    const counts: Record<AdminRole, number> = { admin: 0, user_level_1: 0, user_level_2: 0 };
    for (const u of users) counts[u.role] += 1;
    return counts;
  }, [users]);

  const recentCount = useMemo(() => users.filter((u) => isRecentSignIn(u.lastSignInAt)).length, [users]);

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-background">
        <p className="text-muted-foreground">Ligipääs keelatud</p>
      </div>
    );
  }

  const chips: { key: RoleFilter; label: string; count: number }[] = [
    { key: 'all', label: 'K\u00f5ik', count: users.length },
    ...FILTER_ROLES.map((role) => ({ key: role, label: ROLE_LABEL[role], count: roleCounts[role] })),
  ].filter((c) => c.key === 'all' || c.count > 0);

  return (
    <div className="min-h-[100dvh] bg-[#F3F6F2] text-[15px] leading-[1.4] text-[#1F2723]">
      <header className="sticky top-0 z-10 flex h-[52px] items-center gap-1 border-b border-[#DFE6E1] bg-white px-2.5">
        <button
          type="button"
          onClick={() => navigate('/', { state: { estbirding: { activeTab: 'seaded' } } })}
          className="inline-flex h-11 min-w-[84px] items-center gap-0.5 text-[15px] text-[#2D764B]"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          Seaded
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold">Kasutajad</h1>
        <span className="min-w-[84px]" aria-hidden="true" />
      </header>

      <div className="flex flex-col gap-3.5 px-4 pb-6 pt-4">
        <div className="grid grid-cols-3 gap-2">
          <StatCell value={users.length} label="kasutajat" />
          <StatCell value={recentCount} label="sisse loginud 30 p" />
          <StatCell value={roleCounts.admin} label="adminit" />
        </div>

        <label className="flex h-11 items-center gap-2 rounded-xl border border-[#DFE6E1] bg-white px-3 text-[#5B6B62]">
          <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Otsi nime v&otilde;i e-posti j&auml;rgi"
            aria-label="Otsi kasutajat"
            className="min-w-0 flex-1 border-0 bg-transparent text-[#1F2723] outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = roleFilter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setRoleFilter(c.key)}
                className={`h-8 rounded-full border px-3 text-[13px] ${
                  on ? 'border-[#1F2723] bg-[#1F2723] text-white' : 'border-[#DFE6E1] bg-white text-[#3E4C44]'
                }`}
              >
                {c.label} {c.count}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#2D764B]" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-start gap-2 rounded-[14px] border border-[#DFE6E1] bg-white p-3.5">
            <p className="text-[13px] text-[#5B6B62]">
              Kasutajate laadimine eba&otilde;nnestus: {loadError}
            </p>
            <button
              type="button"
              onClick={retry}
              className="h-8 rounded-full border border-[#DFE6E1] bg-white px-3 text-[13px] text-[#3E4C44]"
            >
              Proovi uuesti
            </button>
          </div>
        ) : visibleUsers.length === 0 ? (
          <p className="mx-1 text-[13px] text-[#5B6B62]">Ei leitud</p>
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-[#DFE6E1] bg-white divide-y divide-[#E8EEEA]">
            {visibleUsers.map((u, index) => (
              <UserRow key={u.id} user={u} index={index} isSelf={u.id === currentUser?.id} />
            ))}
          </div>
        )}

        <p className="mx-1 text-[13px] text-[#5B6B62]">
          Roheline t&auml;pp: sisse loginud viimase 30 p&auml;eva jooksul.
        </p>
      </div>
    </div>
  );
}

type StatCellProps = {
  value: number;
  label: string;
};

function StatCell({ value, label }: StatCellProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-[#DFE6E1] bg-white px-3 py-2.5">
      <span className="text-[22px] font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-[13px] text-[#5B6B62]">{label}</span>
    </div>
  );
}

type UserRowProps = {
  user: AdminUser;
  index: number;
  isSelf: boolean;
};

function UserRow({ user: u, index, isSelf }: UserRowProps) {
  const avatarClass = isSelf ? AVATAR_SELF_CLASS : AVATAR_ALT_CLASSES[index % AVATAR_ALT_CLASSES.length];
  const recent = isRecentSignIn(u.lastSignInAt);
  const disabled = u.status !== 'active';
  return (
    <Link
      to={`/admin/users/${u.id}`}
      className={`flex min-h-[68px] items-center gap-3 px-3.5 py-2.5 text-inherit no-underline hover:bg-[#F6F9F7] ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <span className={`relative grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full text-base font-semibold ${avatarClass}`}>
        {initialOf(u)}
        <span
          className={`absolute -bottom-px -right-px h-3 w-3 rounded-full border-2 border-white ${
            recent ? 'bg-[#2D764B]' : 'bg-[#B8C3BC]'
          }`}
          aria-hidden="true"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold">
          <span className="truncate">{shownName(u)}</span>
          {isSelf && (
            <span className="inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-[#E6F0E9] px-1.5 text-[11px] font-semibold text-[#24603D]">
              Sina
            </span>
          )}
        </span>
        {u.displayName && u.email && (
          <span className="truncate text-[13px] text-[#5B6B62]">{u.email}</span>
        )}
        <span className="text-[13px] text-[#5B6B62]">
          {u.lastSignInAt ? <>Viimati sisse loginud {formatSignIn(u.lastSignInAt)}</> : 'Pole sisse loginud'}
        </span>
      </span>
      {disabled && <span className={`${CHIP_BASE_CLASS} bg-[#FBE9E7] text-[#9B2C1F]`}>Keelatud</span>}
      <span className={`${CHIP_BASE_CLASS} ${ROLE_CHIP_CLASS[u.role]}`}>{ROLE_LABEL[u.role]}</span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#93A299]" aria-hidden="true" />
    </Link>
  );
}
