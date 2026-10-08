import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import {
  ADMIN_ERROR_TEXT,
  adminErrorMessage,
  formatSignIn,
  isRecentSignIn,
  parseAdminUsers,
  setAdminUserStatus,
} from '@/features/admin/adminUsers';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-07T12:00:00Z');

function daysAgo(days: number, extraMs = 0): string {
  return new Date(NOW - days * DAY_MS - extraMs).toISOString();
}

describe('parseAdminUsers', () => {
  it('returns an empty array for non-array input', () => {
    expect(parseAdminUsers(null)).toEqual([]);
    expect(parseAdminUsers({ id: 'x' })).toEqual([]);
    expect(parseAdminUsers('rows')).toEqual([]);
  });

  it('drops rows without an id and non-object rows', () => {
    const result = parseAdminUsers([{ email: 'a@b.c' }, { id: '' }, 42, null, 'row', { id: 'u1' }]);
    expect(result.map((u) => u.id)).toEqual(['u1']);
  });

  it('maps snake_case to camelCase and applies defaults', () => {
    const [user] = parseAdminUsers([
      {
        id: 'u1',
        email: null,
        display_name: null,
        status: null,
        created_at: '2026-01-01T00:00:00Z',
        last_sign_in_at: null,
        role: 'superuser',
      },
    ]);
    expect(user).toEqual({
      id: 'u1',
      email: '',
      displayName: '',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      lastSignInAt: null,
      role: 'user_level_1',
    });
  });

  it('keeps valid fields', () => {
    const [user] = parseAdminUsers([
      {
        id: 'u2',
        email: 'a@b.c',
        display_name: 'Anna',
        status: 'disabled',
        created_at: '2026-01-01T00:00:00Z',
        last_sign_in_at: '2026-10-01T00:00:00Z',
        role: 'admin',
      },
    ]);
    expect(user.displayName).toBe('Anna');
    expect(user.email).toBe('a@b.c');
    expect(user.status).toBe('disabled');
    expect(user.lastSignInAt).toBe('2026-10-01T00:00:00Z');
    expect(user.role).toBe('admin');
  });
});

describe('isRecentSignIn', () => {
  it('is false for null', () => {
    expect(isRecentSignIn(null, NOW)).toBe(false);
  });

  it('is true exactly 30 days ago', () => {
    expect(isRecentSignIn(daysAgo(30), NOW)).toBe(true);
  });

  it('is false 30 days and 1 minute ago', () => {
    expect(isRecentSignIn(daysAgo(30, 60 * 1000), NOW)).toBe(false);
  });

  it('is true 3 days ago', () => {
    expect(isRecentSignIn(daysAgo(3), NOW)).toBe(true);
  });
});

describe('formatSignIn', () => {
  const rtf = new Intl.RelativeTimeFormat('et', { numeric: 'auto' });
  const rtfAlways = new Intl.RelativeTimeFormat('et', { numeric: 'always' });

  it('returns the never-signed-in text for null', () => {
    expect(formatSignIn(null, NOW)).toBe('pole sisse loginud');
  });

  it('formats 3 days ago in days', () => {
    const out = formatSignIn(daysAgo(3), NOW);
    expect(out).not.toBe('');
    expect(out).toBe(rtf.format(-3, 'day'));
  });

  it('formats 35 days ago as a numeric month', () => {
    const out = formatSignIn(daysAgo(35), NOW);
    expect(out).not.toBe('');
    expect(out).toBe(rtfAlways.format(-1, 'month'));
  });

  it('formats 45 days ago in months', () => {
    const out = formatSignIn(daysAgo(45), NOW);
    expect(out).not.toBe('');
    expect(out).toBe(rtfAlways.format(-2, 'month'));
  });

  it('formats 400 days ago in years', () => {
    const out = formatSignIn(daysAgo(400), NOW);
    expect(out).not.toBe('');
    expect(out).toBe(rtfAlways.format(-1, 'year'));
  });
});

describe('adminErrorMessage', () => {
  it('maps "cannot change own role" from an Error', () => {
    expect(adminErrorMessage(new Error('cannot change own role'))).toBe(ADMIN_ERROR_TEXT.ownRole);
  });

  it('maps "cannot change own role" from a plain object', () => {
    expect(adminErrorMessage({ message: 'cannot change own role' })).toBe(ADMIN_ERROR_TEXT.ownRole);
  });

  it('maps "cannot remove the last admin" from an Error', () => {
    expect(adminErrorMessage(new Error('cannot remove the last admin'))).toBe(ADMIN_ERROR_TEXT.lastAdmin);
  });

  it('maps "cannot remove the last admin" from a plain object', () => {
    expect(adminErrorMessage({ message: 'cannot remove the last admin' })).toBe(ADMIN_ERROR_TEXT.lastAdmin);
  });

  it('maps "user not found" from an Error', () => {
    expect(adminErrorMessage(new Error('user not found'))).toBe(ADMIN_ERROR_TEXT.notFound);
  });

  it('maps "user not found" from a plain object', () => {
    expect(adminErrorMessage({ message: 'user not found' })).toBe(ADMIN_ERROR_TEXT.notFound);
  });

  it('maps "admin role required" from an Error', () => {
    expect(adminErrorMessage(new Error('admin role required'))).toBe(ADMIN_ERROR_TEXT.adminRequired);
  });

  it('maps "admin role required" from a plain object', () => {
    expect(adminErrorMessage({ message: 'admin role required' })).toBe(ADMIN_ERROR_TEXT.adminRequired);
  });

  it('matches by substring inside a longer message', () => {
    expect(adminErrorMessage(new Error('P0001: cannot change own role (hint)'))).toBe(ADMIN_ERROR_TEXT.ownRole);
  });

  it('falls back for an unknown message', () => {
    expect(adminErrorMessage(new Error('something else'))).toBe(ADMIN_ERROR_TEXT.fallback);
    expect(adminErrorMessage({ message: 'something else' })).toBe(ADMIN_ERROR_TEXT.fallback);
  });

  it('falls back for non-objects, null and objects without a string message', () => {
    expect(adminErrorMessage('cannot change own role')).toBe(ADMIN_ERROR_TEXT.fallback);
    expect(adminErrorMessage(42)).toBe(ADMIN_ERROR_TEXT.fallback);
    expect(adminErrorMessage(null)).toBe(ADMIN_ERROR_TEXT.fallback);
    expect(adminErrorMessage(undefined)).toBe(ADMIN_ERROR_TEXT.fallback);
    expect(adminErrorMessage({ message: 7 })).toBe(ADMIN_ERROR_TEXT.fallback);
  });
});

describe('setAdminUserStatus', () => {
  it('updates profiles.status for the given id', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'u1' }], error: null });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.mocked(supabase.from);
    from.mockReturnValue({ update } as unknown as ReturnType<typeof supabase.from>);

    await setAdminUserStatus('u1', 'disabled');

    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ status: 'disabled' });
    expect(eq).toHaveBeenCalledWith('id', 'u1');
    expect(select).toHaveBeenCalledWith('id');
  });

  it('throws when supabase returns an error', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: 'admin role required' } });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ update } as unknown as ReturnType<typeof supabase.from>);

    await expect(setAdminUserStatus('u1', 'active')).rejects.toThrow('admin role required');
  });

  it('throws when no row was updated (e.g. filtered out by RLS)', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ update } as unknown as ReturnType<typeof supabase.from>);

    await expect(setAdminUserStatus('u1', 'disabled')).rejects.toThrow(/^Oleku muutmine/);
  });
});
