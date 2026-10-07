// src/test/entryGroups.test.ts
import { describe, it, expect } from 'vitest';
import { groupEntriesBySpecies, type GroupableEntry } from '../features/overview/entryGroups';

type E = GroupableEntry & { source: string; location: string };
const e = (species_lat: string, date: string, source: string, location: string, data_integrity?: 'verified' | 'unverified'): E =>
  ({ species_lat, date, source, location, data_integrity });

// Order as sortEntries would give it (same tier, newest first).
const sorted: E[] = [
  e('Circus macrourus', '2026-10-05', 'elurikkus', 'Valjakula'),
  e('Circus macrourus', '2026-10-01', 'ebird', 'Penijoe vaatetorn'),
  e('Anser erythropus', '2026-09-30', 'ebird', 'Haeska'),
  e('Circus macrourus', '2026-09-29', 'ebird', 'Kusagil', 'unverified'),
  e('circus macrourus ', '2026-09-28', 'ebird', 'Audru polder'),
  e('Circus macrourus', '2026-09-28', 'ebird', 'Sorve saar'),
  e('', '2026-09-27', 'ebird', 'A'),
  e('', '2026-09-27', 'ebird', 'B'),
];

describe('groupEntriesBySpecies', () => {
  const groups = groupEntriesBySpecies(sorted);

  it('merges verified entries of one species, case/space-insensitively', () => {
    expect(groups.map((g) => g.items.length)).toEqual([4, 1, 1, 1, 1]);
    expect(groups[0].items.map((i) => i.entry.location)).toEqual(['Valjakula', 'Penijoe vaatetorn', 'Audru polder', 'Sorve saar']);
  });
  it('keeps group position = first occurrence and preserves idx', () => {
    expect(groups[0].items.map((i) => i.idx)).toEqual([0, 1, 4, 5]);
    expect(groups[1].items[0].idx).toBe(2);
    expect(groups[2].items[0].idx).toBe(3);
  });
  it('never merges unverified or species-less entries', () => {
    expect(groups[2].items[0].entry.data_integrity).toBe('unverified');
    expect(groups[3].items[0].entry.location).toBe('A');
    expect(groups[4].items[0].entry.location).toBe('B');
  });
  it('head is the newest entry', () => {
    expect(groups[0].items[0].entry.source).toBe('elurikkus');
  });
  it('returns [] for []', () => {
    expect(groupEntriesBySpecies([])).toEqual([]);
  });
});
