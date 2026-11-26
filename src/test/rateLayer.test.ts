// src/test/rateLayer.test.ts
// P189: pure functions of supabase/functions/compute-ennustus/rateLayer.ts
import { describe, expect, it } from 'vitest';
import {
  buildLayer,
  buildRateMeta,
  effortCounts,
  periodOf,
  periodStartMonth,
  seasonLabelFrom,
  seasonMonthsFrom,
  speciesCounts,
  tallinnToday,
} from '../../supabase/functions/compute-ennustus/rateLayer';

describe('periodOf matches the SQL view (least(25, (doy - 1) / 14))', () => {
  it('maps edges', () => {
    expect(periodOf('2026-01-01')).toBe(0);
    expect(periodOf('2026-01-14')).toBe(0);
    expect(periodOf('2026-01-15')).toBe(1);
    expect(periodOf('2026-11-19')).toBe(23); // doy 323
    expect(periodOf('2026-12-02')).toBe(23); // doy 336
    expect(periodOf('2026-12-03')).toBe(24);
    expect(periodOf('2026-12-31')).toBe(25);
    expect(periodOf('2024-12-31')).toBe(25); // leap year, doy 366
    expect(periodOf('nonsense')).toBeNull();
  });
  it('period start months', () => {
    expect(periodStartMonth(0)).toBe(0);
    expect(periodStartMonth(23)).toBe(10);
    expect(periodStartMonth(25)).toBe(11);
  });
});

describe('tallinnToday', () => {
  it('uses Europe/Tallinn, not UTC', () => {
    expect(tallinnToday(new Date('2026-11-25T22:30:00Z'))).toBe('2026-11-26');
    expect(tallinnToday(new Date('2026-07-01T20:59:00Z'))).toBe('2026-07-01');
  });
});

describe('season (circular)', () => {
  it('winter species wraps New Year (Hele-urvalind month days)', () => {
    const m = seasonMonthsFrom([86, 89, 67, 15, 1, 0, 0, 0, 0, 38, 66, 43]);
    expect(m).toEqual([9, 10, 11, 0, 1, 2, 3]);
    expect(seasonLabelFrom(m)).toBe('Oct 1 \u2013 Apr 30');
  });
  it('resident species is year-round (Musttihane month days)', () => {
    const m = seasonMonthsFrom([65, 43, 72, 78, 72, 46, 57, 68, 105, 106, 64, 47]);
    expect(m.length).toBe(12);
    expect(seasonLabelFrom(m)).toBe('Jan 1 \u2013 Dec 31');
  });
  it('no days -> all months', () => {
    expect(seasonMonthsFrom(new Array(12).fill(0)).length).toBe(12);
  });
});

describe('speciesCounts', () => {
  it('counts distinct dates per cell/period and per month, drops pre-2010 and out-of-bbox rows', () => {
    const { byCell, monthDays } = speciesCounts([
      { lat: 59.191, lon: 24.806, date: '2026-11-23' },
      { lat: 59.192, lon: 24.807, date: '2026-11-23' }, // same cell, same day
      { lat: 59.191, lon: 24.806, date: '2009-11-23' }, // pre-2010
      { lat: 49.2, lon: -2.2, date: '2026-11-23' },     // outside bbox
      { lat: 57.95, lon: 21.95, date: '2025-11-20' },
    ], 0.15);
    expect(byCell.get('394|165')?.[23]).toBe(1);
    expect(byCell.get('386|146')?.[23]).toBe(1);
    expect(monthDays[10]).toBe(2);
  });
});

describe('buildLayer', () => {
  const effort = effortCounts([
    { gi: 10, gj: 10, period: 23, days_any: 10 },
    { gi: 10, gj: 11, period: 23, days_any: 10 },
    { gi: 10, gj: 12, period: 23, days_any: 10 },
    { gi: 11, gj: 10, period: 23, days_any: 10 },
    { gi: 30, gj: 30, period: 23, days_any: 4 },
  ]);
  const species = new Map<string, number[]>([['10|10', (() => { const a = new Array(26).fill(0); a[23] = 5; return a; })()]]);
  const layer = buildLayer(effort, species, [23]);

  it('p0 is the species rate over all observed cells', () => {
    expect(layer.p0).toBeCloseTo(5 / 44, 5);
  });
  it('keeps own days and puts the best estimate on the cell with the species', () => {
    const c = layer.cells.find((x) => x[0] === 10 && x[1] === 10);
    expect(c?.[2]).toBe(10);
    expect(c?.[3]).toBe(5);
    const best = layer.cells.reduce((a, b) => (b[4] > a[4] ? b : a));
    expect([best[0], best[1]]).toEqual([10, 10]);
    expect(layer.maxEst).toBe(best[4]);
  });
  it('fills an unobserved cell with >= 3 observed neighbours, not an isolated one', () => {
    expect(layer.cells.some((x) => x[0] === 11 && x[1] === 11 && x[2] === 0)).toBe(true);
    expect(layer.cells.some((x) => x[0] === 31 && x[1] === 31)).toBe(false);
  });
  it('never lets species days exceed effort days', () => {
    const sp = new Map<string, number[]>([['50|50', (() => { const a = new Array(26).fill(0); a[0] = 3; return a; })()]]);
    const l = buildLayer(new Map(), sp, [0]);
    expect(l.cells[0][2]).toBe(3);
    expect(l.cells[0][3]).toBe(3);
  });
});

describe('buildRateMeta', () => {
  it('returns null without species days', () => {
    expect(buildRateMeta({ cellSize: 0.15, effortRows: [], obs: [], today: '2026-11-25' })).toBeNull();
  });
  it('builds w6 around the current period and a season layer', () => {
    const meta = buildRateMeta({
      cellSize: 0.15,
      effortRows: [{ gi: 394, gj: 165, period: 23, days_any: 5 }],
      obs: [{ lat: 59.191, lon: 24.806, date: '2026-11-23' }],
      today: '2026-11-25',
    });
    expect(meta?.currentPeriod).toBe(23);
    expect(meta?.w6.periods).toEqual([22, 23, 24]);
    expect(meta?.seasonMonths).toEqual([10]);
    expect(meta?.w6.cells.find((c) => c[0] === 394 && c[1] === 165)?.slice(2, 4)).toEqual([5, 1]);
  });
});
