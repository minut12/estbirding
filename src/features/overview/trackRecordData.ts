// src/features/overview/predictionTrackRecord.ts
// P181k: data for the "Ennustuste tapsus" card (Ulevaade > Toenaosus). Source: RPC
// public.get_prediction_track_record (P181k, pending types merge). One row per species, never
// aggregated across species. A missing RPC (PGRST202 / 404) is treated as "no data yet".
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type TrackRecordBucket = {
  lo: number;
  hi: number;
  n: number;
  hits: number;
  mean_predicted_pct: number | null;
  observed_pct: number | null;
  n_independent: number;
  hits_independent: number;
};

export type TrackRecordRow = {
  ebird_code: string;
  species_et: string;
  n: number;
  hits: number;
  n_independent: number;
  hits_independent: number;
  mean_predicted_pct: number;
  observed_pct: number;
  brier: number;
  brier_independent: number;
  small_sample: boolean;
  first_window_start: string;
  last_window_end: string;
  buckets: TrackRecordBucket[];
};

export type TrackRecordSort = 'independent' | 'total' | 'brier';

export type TrackRecordState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; rows: TrackRecordRow[] };

// Owner ruling P181k: at least 5 independent (non-overlapping) windows per species.
export const TRACK_RECORD_MIN_N = 5;
// Same rule as the RPC: fewer than 10 independent windows is a small sample.
export const SMALL_SAMPLE_BELOW = 10;
export const BUCKET_COUNT = 5;
export const BUCKET_WIDTH = 20;

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;

type TrackRecordRpcClient = {
  rpc: (fn: 'get_prediction_track_record', args: { p_min_n: number }) => RpcResult;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function count(value: unknown): number {
  const n = finite(value);
  return n === null ? 0 : Math.max(0, Math.round(n));
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function emptyBucket(i: number): TrackRecordBucket {
  return {
    lo: i * BUCKET_WIDTH,
    hi: (i + 1) * BUCKET_WIDTH,
    n: 0,
    hits: 0,
    mean_predicted_pct: null,
    observed_pct: null,
    n_independent: 0,
    hits_independent: 0,
  };
}

// Maps the RPC's buckets json onto the fixed 0-20 ... 80-100 % slots, by `lo`. Unknown or
// malformed entries are dropped; missing slots come back empty (n = 0).
export function normalizeBuckets(raw: unknown): TrackRecordBucket[] {
  const out = Array.from({ length: BUCKET_COUNT }, (_, i) => emptyBucket(i));
  for (const item of Array.isArray(raw) ? raw : []) {
    const r = asRecord(item);
    const lo = r ? finite(r.lo) : null;
    if (!r || lo === null) continue;
    const i = Math.floor(lo / BUCKET_WIDTH);
    if (i < 0 || i >= BUCKET_COUNT || lo !== i * BUCKET_WIDTH) continue;
    const n = count(r.n);
    out[i] = {
      lo,
      hi: lo + BUCKET_WIDTH,
      n,
      hits: Math.min(count(r.hits), n),
      mean_predicted_pct: n > 0 ? finite(r.mean_predicted_pct) : null,
      observed_pct: n > 0 ? finite(r.observed_pct) : null,
      n_independent: count(r.n_independent),
      hits_independent: count(r.hits_independent),
    };
  }
  return out;
}

export function parseTrackRecordRows(data: unknown): TrackRecordRow[] {
  const rows: TrackRecordRow[] = [];
  for (const item of Array.isArray(data) ? data : []) {
    const r = asRecord(item);
    if (!r) continue;
    const code = str(r.ebird_code);
    const nInd = finite(r.n_independent);
    const brierInd = finite(r.brier_independent);
    if (!code || nInd === null || brierInd === null) continue;
    const n = count(r.n);
    const nIndependent = Math.max(0, Math.round(nInd));
    rows.push({
      ebird_code: code,
      species_et: str(r.species_et).normalize('NFC') || code,
      n,
      hits: count(r.hits),
      n_independent: nIndependent,
      hits_independent: count(r.hits_independent),
      mean_predicted_pct: finite(r.mean_predicted_pct) ?? 0,
      observed_pct: finite(r.observed_pct) ?? 0,
      brier: finite(r.brier) ?? brierInd,
      brier_independent: brierInd,
      small_sample: typeof r.small_sample === 'boolean' ? r.small_sample : nIndependent < SMALL_SAMPLE_BELOW,
      first_window_start: str(r.first_window_start),
      last_window_end: str(r.last_window_end),
      buckets: normalizeBuckets(r.buckets),
    });
  }
  return rows;
}

const byName = (a: TrackRecordRow, b: TrackRecordRow) => a.species_et.localeCompare(b.species_et, 'et');

export function sortTrackRecord(rows: readonly TrackRecordRow[], key: TrackRecordSort): TrackRecordRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    if (key === 'brier') return a.brier_independent - b.brier_independent || b.n_independent - a.n_independent || byName(a, b);
    if (key === 'total') return b.n - a.n || b.n_independent - a.n_independent || byName(a, b);
    return b.n_independent - a.n_independent || b.n - a.n || byName(a, b);
  });
  return out;
}

// Earliest window start across the shown species, as dd.mm.yyyy (no inflection needed).
export function earliestWindowStart(rows: readonly TrackRecordRow[]): string | null {
  let min = '';
  for (const r of rows) {
    if (/^\d{4}-\d{2}-\d{2}/.test(r.first_window_start) && (!min || r.first_window_start < min)) {
      min = r.first_window_start;
    }
  }
  if (!min) return null;
  const [y, m, d] = min.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function formatDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

// PostgREST: PGRST202 = function not found in the schema cache (RPC not applied yet).
export function isMissingRpcError(error: unknown): boolean {
  const r = asRecord(error);
  if (!r) return false;
  if (r.code === 'PGRST202' || r.status === 404) return true;
  const message = typeof r.message === 'string' ? r.message.toLowerCase() : '';
  return message.includes('could not find the function');
}

function rpcClient(): TrackRecordRpcClient {
  return supabase as unknown as TrackRecordRpcClient;
}

let cache: Promise<TrackRecordRow[]> | null = null;

export function fetchPredictionTrackRecord(): Promise<TrackRecordRow[]> {
  if (cache) return cache;
  const p = Promise.resolve(rpcClient().rpc('get_prediction_track_record', { p_min_n: TRACK_RECORD_MIN_N }))
    .then(({ data, error }) => {
      if (error) {
        if (isMissingRpcError(error)) return [];
        throw error;
      }
      return parseTrackRecordRows(data);
    });
  cache = p;
  p.catch(() => { if (cache === p) cache = null; });
  return p;
}

export function usePredictionTrackRecord(): TrackRecordState {
  const [state, setState] = useState<TrackRecordState>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    fetchPredictionTrackRecord()
      .then((rows) => { if (alive) setState({ kind: 'ready', rows }); })
      .catch(() => { if (alive) setState({ kind: 'error' }); });
    return () => { alive = false; };
  }, []);
  return state;
}
