import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

import { formatSignIn, isRecentSignIn, parseAdminUsers } from '@/features/admin/adminUsers';

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

  it('returns the never-signed-in text for null', () => {
    expect(formatSignIn(null, NOW)).toBe('pole sisse loginud');
  });

  it('formats 3 days ago in days', () => {
    const out = formatSignIn(daysAgo(3), NOW);
    expect(out).not.toBe('');
    expect(out).toBe(rtf.format(-3, 'day'));
  });

  it('formats 45 days ago in months', () => {
    const out = formatSignIn(daysAgo(45), NOW);
    expect(out).not.toBe('');
    expect(out).toBe(rtf.format(-2, 'month'));
  });

  it('formats 400 days ago in years', () => {
    const out = formatSignIn(daysAgo(400), NOW);
    expect(out).not.toBe('');
    expect(out).toBe(rtf.format(-1, 'year'));
  });
});
