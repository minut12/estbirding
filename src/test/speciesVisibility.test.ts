import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = { species_key: string; updated_at: string | null };
const mockState: { rows: Row[] } = { rows: [] };

vi.mock('@/integrations/supabase/client', () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: mockState.rows, error: null }).then(resolve),
  };
  return { supabase: { from: () => builder } };
});

import { tallinnYear, isCurrentTallinnYear, loadCloudHidden } from '@/lib/speciesVisibility';

describe('tallinnYear', () => {
  it('stays in 2026 one second before Tallinn midnight (UTC+2 in winter)', () => {
    expect(tallinnYear(new Date('2026-12-31T21:59:59Z'))).toBe(2026);
  });

  it('rolls to 2027 at Tallinn midnight', () => {
    expect(tallinnYear(new Date('2026-12-31T22:00:00Z'))).toBe(2027);
  });
});

describe('isCurrentTallinnYear', () => {
  const now = new Date('2026-09-23T10:00:00Z');

  it('is true for a timestamp in the same Tallinn year', () => {
    expect(isCurrentTallinnYear('2026-01-01T00:00:00+02:00', now)).toBe(true);
  });

  it('is false for a timestamp in the previous Tallinn year', () => {
    expect(isCurrentTallinnYear('2025-12-31T21:59:59Z', now)).toBe(false);
  });

  it('is false for empty, null and invalid values', () => {
    expect(isCurrentTallinnYear('', now)).toBe(false);
    expect(isCurrentTallinnYear(null, now)).toBe(false);
    expect(isCurrentTallinnYear('garbage', now)).toBe(false);
  });
});

describe('loadCloudHidden year reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
    localStorage.clear();
    mockState.rows = [
      { species_key: 'Rasvatihane', updated_at: '2025-12-31T21:00:00Z' },
      { species_key: 'Sinitihane', updated_at: '2026-09-23T10:00:00Z' },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops rows from a previous Tallinn year for ee_map', async () => {
    const hidden = await loadCloudHidden('ee_map', 'u1');
    expect([...hidden]).toEqual(['Sinitihane']);
  });

  it('keeps all rows for europe_map', async () => {
    const hidden = await loadCloudHidden('europe_map', 'u1');
    expect([...hidden].sort()).toEqual(['Rasvatihane', 'Sinitihane']);
  });
});
