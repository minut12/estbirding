// src/features/overview/predictionTrackRecord.test.ts
import { describe, expect, it } from 'vitest';
import {
  earliestWindowStart,
  isMissingRpcError,
  normalizeBuckets,
  parseTrackRecordRows,
  sortTrackRecord,
} from './trackRecordData';

const bucket = (lo: number, n: number, hits: number, mp: number | null, op: number | null, ni: number, hi: number) => ({
  lo, hi: lo + 20, n, hits, mean_predicted_pct: mp, observed_pct: op, n_independent: ni, hits_independent: hi,
});

// Real rows from the P181k mock (get_prediction_track_record body, 2026-11-13), trimmed.
const RAW = [
  {
    ebird_code: 'laplon', species_et: 'Lapi tsiitsitaja', n: 91, hits: 37, n_independent: 9, hits_independent: 4,
    mean_predicted_pct: 23.6, observed_pct: 40.7, brier: 0.2677, brier_independent: 0.2941, small_sample: true,
    first_window_start: '2026-09-07', last_window_end: '2026-11-10',
    buckets: [bucket(0, 11, 4, 18.2, 36.4, 1, 1), bucket(20, 80, 33, 24.4, 41.3, 8, 3)],
  },
  {
    ebird_code: 'parcro2', species_et: 'M\u00e4nni-k\u00e4bilind', n: 96, hits: 54, n_independent: 10, hits_independent: 5,
    mean_predicted_pct: '38.5', observed_pct: '56.3', brier: '0.2954', brier_independent: '0.2751', small_sample: false,
    first_window_start: '2026-09-05', last_window_end: '2026-11-12',
    buckets: [bucket(0, 0, 0, null, null, 0, 0), bucket(20, 52, 40, 35.3, 76.9, 5, 3), bucket(40, 44, 14, 42.4, 31.8, 5, 2),
      bucket(60, 0, 0, null, null, 0, 0), bucket(80, 0, 0, null, null, 0, 0)],
  },
  {
    ebird_code: 'piewhe1', species_et: 'Nunn-kivit\u00e4ks', n: 49, hits: 0, n_independent: 6, hits_independent: 0,
    mean_predicted_pct: 6.8, observed_pct: 0, brier: 0.005, brier_independent: 0.0055,
    first_window_start: '2026-09-20', last_window_end: '2026-11-01',
    buckets: [bucket(0, 49, 0, 6.8, 0, 6, 0)],
  },
  { ebird_code: '', n: 5, n_independent: 5, brier_independent: 0.1 },
  { ebird_code: 'bad', n: 5, n_independent: 'x', brier_independent: 0.1 },
  null,
];

describe('parseTrackRecordRows', () => {
  it('keeps one row per valid species and drops malformed rows', () => {
    const rows = parseTrackRecordRows(RAW);
    expect(rows.map((r) => r.ebird_code)).toEqual(['laplon', 'parcro2', 'piewhe1']);
    const p = rows[1];
    expect(p.mean_predicted_pct).toBe(38.5);
    expect(p.brier_independent).toBe(0.2751);
    expect(p.n_independent).toBe(10);
  });

  it('returns [] for non-array data', () => {
    expect(parseTrackRecordRows(null)).toEqual([]);
    expect(parseTrackRecordRows({ ebird_code: 'x' })).toEqual([]);
  });

  it('uses the RPC small_sample flag, else falls back to n_independent < 10', () => {
    const rows = parseTrackRecordRows(RAW);
    expect(rows.find((r) => r.ebird_code === 'laplon')?.small_sample).toBe(true);
    expect(rows.find((r) => r.ebird_code === 'parcro2')?.small_sample).toBe(false);
    // piewhe1 has no flag in the fixture: 6 independent windows -> small sample.
    expect(rows.find((r) => r.ebird_code === 'piewhe1')?.small_sample).toBe(true);
    const big = parseTrackRecordRows([{ ebird_code: 'x', n: 40, n_independent: 12, brier_independent: 0.2 }]);
    expect(big[0].small_sample).toBe(false);
  });
});

describe('sortTrackRecord', () => {
  const rows = parseTrackRecordRows(RAW);
  it('independent: most independent windows first', () => {
    expect(sortTrackRecord(rows, 'independent').map((r) => r.ebird_code)).toEqual(['parcro2', 'laplon', 'piewhe1']);
  });
  it('total: most predictions first', () => {
    expect(sortTrackRecord(rows, 'total').map((r) => r.ebird_code)).toEqual(['parcro2', 'laplon', 'piewhe1']);
    const swapped = rows.map((r) => (r.ebird_code === 'piewhe1' ? { ...r, n: 200 } : r));
    expect(sortTrackRecord(swapped, 'total')[0].ebird_code).toBe('piewhe1');
  });
  it('brier: lowest (best) independent Brier first', () => {
    expect(sortTrackRecord(rows, 'brier').map((r) => r.ebird_code)).toEqual(['piewhe1', 'parcro2', 'laplon']);
  });
  it('does not mutate the input', () => {
    const before = rows.map((r) => r.ebird_code);
    sortTrackRecord(rows, 'brier');
    expect(rows.map((r) => r.ebird_code)).toEqual(before);
  });
});

describe('normalizeBuckets', () => {
  it('always returns the five 20 % slots in order, filling missing ones as empty', () => {
    const b = normalizeBuckets([bucket(20, 80, 33, 24.4, 41.3, 8, 3), bucket(0, 11, 4, 18.2, 36.4, 1, 1)]);
    expect(b.map((x) => [x.lo, x.hi])).toEqual([[0, 20], [20, 40], [40, 60], [60, 80], [80, 100]]);
    expect(b[0]).toMatchObject({ n: 11, hits: 4, mean_predicted_pct: 18.2, observed_pct: 36.4, n_independent: 1 });
    expect(b[1]).toMatchObject({ n: 80, hits: 33, n_independent: 8, hits_independent: 3 });
    expect(b[2]).toMatchObject({ n: 0, mean_predicted_pct: null, observed_pct: null });
  });
  it('drops out-of-range or off-grid buckets and nulls pct on empty buckets', () => {
    const b = normalizeBuckets([{ lo: 100, n: 3 }, { lo: 30, n: 3 }, { lo: 60, n: 0, mean_predicted_pct: 62, observed_pct: 100 }, 'x']);
    expect(b.every((x) => x.n === 0)).toBe(true);
    expect(b[3].mean_predicted_pct).toBeNull();
    expect(normalizeBuckets(null)).toHaveLength(5);
  });
});

describe('helpers', () => {
  it('earliestWindowStart formats the earliest date as dd.mm.yyyy', () => {
    expect(earliestWindowStart(parseTrackRecordRows(RAW))).toBe('05.09.2026');
    expect(earliestWindowStart([])).toBeNull();
  });
  it('isMissingRpcError recognises PostgREST function-not-found', () => {
    expect(isMissingRpcError({ code: 'PGRST202', message: 'x' })).toBe(true);
    expect(isMissingRpcError({ status: 404 })).toBe(true);
    expect(isMissingRpcError({ message: 'Could not find the function public.get_prediction_track_record' })).toBe(true);
    expect(isMissingRpcError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
  });
});
