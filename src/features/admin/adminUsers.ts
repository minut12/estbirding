import { supabase } from '@/integrations/supabase/client';

export type AdminRole = 'admin' | 'user_level_1' | 'user_level_2';

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  createdAt: string;
  lastSignInAt: string | null;
  role: AdminRole;
};

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;

type AdminUsersRpcClient = {
  rpc: {
    (fn: 'admin_list_users'): RpcResult;
    (fn: 'admin_set_user_role', args: { p_user_id: string; p_role: AdminRole }): RpcResult;
  };
};

export const ROLE_LABEL: Record<AdminRole, string> = {
  admin: 'Admin',
  user_level_2: 'Tase 2',
  user_level_1: 'Tase 1',
};

const RECENT_SIGN_IN_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
const NEVER_SIGNED_IN = 'pole sisse loginud';

function isAdminRole(value: unknown): value is AdminRole {
  return value === 'admin' || value === 'user_level_1' || value === 'user_level_2';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseRow(row: unknown): AdminUser | null {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return null;
  const status = asString(r.status);
  return {
    id: r.id,
    email: asString(r.email),
    displayName: asString(r.display_name),
    status: status || 'active',
    createdAt: asString(r.created_at),
    lastSignInAt: typeof r.last_sign_in_at === 'string' ? r.last_sign_in_at : null,
    role: isAdminRole(r.role) ? r.role : 'user_level_1',
  };
}

export function parseAdminUsers(data: unknown): AdminUser[] {
  if (!Array.isArray(data)) return [];
  return data.map(parseRow).filter((u): u is AdminUser => u !== null);
}

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message) return new Error(message);
  }
  return new Error(fallback);
}

function rpcClient(): AdminUsersRpcClient {
  return supabase as unknown as AdminUsersRpcClient;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await rpcClient().rpc('admin_list_users');
  if (error) throw toError(error, 'Kasutajate laadimine eba\u00f5nnestus');
  return parseAdminUsers(data);
}

export async function setAdminUserRole(userId: string, role: AdminRole): Promise<void> {
  const { error } = await rpcClient().rpc('admin_set_user_role', { p_user_id: userId, p_role: role });
  if (error) throw toError(error, 'Rolli muutmine eba\u00f5nnestus');
}

function parseTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function isRecentSignIn(iso: string | null, now = Date.now()): boolean {
  const t = parseTime(iso);
  if (t === null) return false;
  return t <= now + FUTURE_TOLERANCE_MS && now - t <= RECENT_SIGN_IN_MS;
}

export function formatSignIn(iso: string | null, now = Date.now()): string {
  const t = parseTime(iso);
  if (t === null) return NEVER_SIGNED_IN;
  const rtf = new Intl.RelativeTimeFormat('et', { numeric: 'auto' });
  const days = Math.round((now - t) / DAY_MS);
  const absDays = Math.abs(days);
  if (absDays < DAYS_PER_MONTH) return rtf.format(-days, 'day');
  if (absDays < DAYS_PER_YEAR) return rtf.format(-Math.round(days / DAYS_PER_MONTH), 'month');
  return rtf.format(-Math.round(days / DAYS_PER_YEAR), 'year');
}

export type AdminUserStatus = 'active' | 'disabled';

export async function setAdminUserStatus(userId: string, status: AdminUserStatus): Promise<void> {
  const { data, error } = await supabase.from('profiles').update({ status }).eq('id', userId).select('id');
  if (error) throw toError(error, 'Oleku muutmine eba\u00f5nnestus');
  // RLS can filter the row out without an error: 0 updated rows is a failure, not a success.
  if (!data || data.length === 0) throw new Error('Oleku muutmine eba\u00f5nnestus');
}

export const ADMIN_ERROR_TEXT = {
  ownRole: 'Oma rolli ei saa muuta.',
  lastAdmin: 'Viimast administraatorit ei saa eemaldada.',
  notFound: 'Kasutajat ei leitud.',
  adminRequired: 'Ainult administraator saab seda teha.',
  fallback: 'Muutmine eba\u00f5nnestus.',
} as const;

const ADMIN_ERROR_MAP: readonly (readonly [string, string])[] = [
  ['cannot change own role', ADMIN_ERROR_TEXT.ownRole],
  ['cannot remove the last admin', ADMIN_ERROR_TEXT.lastAdmin],
  ['user not found', ADMIN_ERROR_TEXT.notFound],
  ['admin role required', ADMIN_ERROR_TEXT.adminRequired],
];

function rawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

export function adminErrorMessage(err: unknown): string {
  const message = rawErrorMessage(err);
  const match = ADMIN_ERROR_MAP.find(([needle]) => message.includes(needle));
  return match ? match[1] : ADMIN_ERROR_TEXT.fallback;
}
