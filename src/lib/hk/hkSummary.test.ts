// src/lib/hk/hkSummary.test.ts
import { describe, expect, it } from 'vitest';
import {
  ET_MONTH_INESSIVE,
  filterSpeciesRecords,
  hkCreditText,
  isHkTaxon,
  pickYearStat,
  summarizeHkRecords,
  tallinnMonth,
  type HkRecordLite,
} from './hkSummary';

function rec(taxon_sci: string, date_from: string | null, year: number | null): HkRecordLite {
  return { taxon_sci, date_from, year };
}

describe('filterSpeciesRecords', () => {
  it('keeps the species and its subspecies, drops hybrids and look-alike genera', () => {
    const recs = [
      rec('Phylloscopus humei', null, 2020),
      rec('Phylloscopus humei humei', null, 2021),
      rec('Phylloscopus humei x inornatus', null, 2022),
      rec('Phylloscopus humeiana', null, 2023),
    ];
    expect(filterSpeciesRecords(recs, 'Phylloscopus humei').map((r) => r.year)).toEqual([2020, 2021]);
  });
});

describe('summarizeHkRecords', () => {
  it('counts records in the month and finds a clear record year', () => {
    const recs = [
      rec('A b', '2025-10-03', 2025), rec('A b', '2025-10-09', 2025), rec('A b', '2025-11-01', 2025),
      rec('A b', '2019-10-12', 2019), rec('A b', null, 2010),
    ];
    const s = summarizeHkRecords(recs, 10);
    expect(s).toMatchObject({ total: 5, inMonth: 3, topYear: 2025, topYearCount: 3, topYearUnique: true, lastYear: 2025 });
    expect(pickYearStat(s)).toEqual({ value: '2025', label: 'rekordaasta (3 leidu)' });
  });

  it('falls back to the latest year when years tie or every year has one record', () => {
    const tie = summarizeHkRecords([rec('A b', '2020-05-01', 2020), rec('A b', '2020-05-02', 2020),
      rec('A b', '2022-05-01', 2022), rec('A b', '2022-06-01', 2022)], 5);
    expect(tie.topYearUnique).toBe(false);
    expect(pickYearStat(tie)).toEqual({ value: '2022', label: 'viimane leid' });
    const singles = summarizeHkRecords([rec('A b', '2001-05-01', 2001), rec('A b', '2003-05-01', 2003)], 1);
    expect(singles.inMonth).toBe(0);
    expect(pickYearStat(singles)).toEqual({ value: '2003', label: 'viimane leid' });
  });

  it('has no year stat when nothing is dated', () => {
    const s = summarizeHkRecords([rec('A b', null, null)], 3);
    expect(s.total).toBe(1);
    expect(pickYearStat(s)).toBeNull();
  });
});

describe('small helpers', () => {
  it('validates taxa', () => {
    expect(isHkTaxon('Merops apiaster')).toBe(true);
    expect(isHkTaxon('Motacilla flava feldegg')).toBe(true);
    expect(isHkTaxon('merops')).toBe(false);
    expect(isHkTaxon("Merops apiaster'; drop")).toBe(false);
  });
  it('builds the credit line', () => {
    expect(hkCreditText(21, '2025-12-31')).toBe('Tekst: Eesti linnuharulduste komisjoni aruanne nr 21 (2025), Hirundo');
    expect(hkCreditText(null, null)).toBe('Tekst: Eesti linnuharulduste komisjoni aruanne, Hirundo');
  });
  it('uses Tallinn time for the month', () => {
    expect(tallinnMonth(new Date('2026-10-31T22:30:00Z'))).toBe(11);
    expect(ET_MONTH_INESSIVE[9]).toBe('oktoobris');
    expect(ET_MONTH_INESSIVE).toHaveLength(12);
  });
});
