// batch-driver / state.ts
// JobState + normalizeState, split out of index.ts so a test can import them
// without index.ts's top-level Deno.serve() starting a server (P3 D0).
//
// normalizeState is the ONLY thing standing between a hop and a silently
// mangled state: cron_runs.state is jsonb round-tripped on every self-chain,
// so any key not listed here is dropped between hops.

export interface JobState {
  offset: number;
  calls_total: number;
  total_species: number | null;
  last?: Record<string, unknown>;
  mode?: "refresh" | "backfill";
  year_from?: number;
}

const YEAR_FROM_MIN = 2000;

export function normalizeState(v: unknown): JobState {
  const s = v && typeof v === "object" ? v as Record<string, unknown> : {};
  const offset = Number(s.offset);
  const callsTotal = Number(s.calls_total);
  const total = Number(s.total_species);
  const out: JobState = {
    offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
    calls_total: Number.isFinite(callsTotal)
      ? Math.max(0, Math.floor(callsTotal))
      : 0,
    total_species: Number.isFinite(total) && total > 0 ? total : null,
  };

  // Preserved across hops so a backfill stays a backfill. Invalid values are
  // omitted entirely -- never set to undefined, which jsonb would not survive
  // and which the `!== undefined` body spread in index.ts checks against.
  if (s.mode === "refresh" || s.mode === "backfill") out.mode = s.mode;

  const yearFrom = s.year_from;
  if (
    Number.isInteger(yearFrom) &&
    (yearFrom as number) >= YEAR_FROM_MIN &&
    (yearFrom as number) <= new Date().getUTCFullYear()
  ) {
    out.year_from = yearFrom as number;
  }

  return out;
}
