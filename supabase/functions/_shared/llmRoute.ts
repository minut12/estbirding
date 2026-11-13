// supabase/functions/_shared/llmRoute.ts
// P181d: pure ordering / skip logic for the LLM chain (circuit breaker).
// No Deno, URL or npm imports on purpose: llm.ts imports it in the edge runtime
// and src/test/llmRoute.test.ts imports it under vitest.
//
// State comes from public.llm_route_state() (derived from public.llm_calls):
// one row per provider/model with its skip window and 48 h success counts.

export type RouteProvider = "anthropic" | "gemini" | "mistral";

export type RouteCandidate = { provider: RouteProvider; model: string };

export type RouteStateRow = {
  provider: RouteProvider;
  model: string;
  /** Epoch ms until which the model is skipped; null = not in a skip window. */
  skipUntil: number | null;
  /** error_class that opened the window (credit, auth, rate_limit, overload, timeout). */
  skipReason: string | null;
  calls48h: number;
  ok48h: number;
};

export type RoutePlan = {
  /** Tried first, in this order. */
  primary: RouteCandidate[];
  /** In their skip window: tried only after every primary candidate failed. */
  lastResort: RouteCandidate[];
  /** True when every candidate was in its window, so primary is the full original order. */
  allSkipped: boolean;
};

export type OrderOptions = {
  /** Caller-supplied Gemini list: keep its order (still skips models in window). */
  keepGeminiOrder?: boolean;
};

// Fewer attempts than this in 48 h say nothing: the model counts as healthy.
export const ROUTE_MIN_SAMPLE = 3;

function isRouteProvider(v: unknown): v is RouteProvider {
  return v === "anthropic" || v === "gemini" || v === "mistral";
}

function count(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Rows of public.llm_route_state() -> typed state; anything malformed is dropped. */
export function parseRouteState(data: unknown): RouteStateRow[] {
  if (!Array.isArray(data)) return [];
  const out: RouteStateRow[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (!isRouteProvider(r.provider) || typeof r.model !== "string") continue;
    const t = typeof r.skip_until === "string" ? Date.parse(r.skip_until) : Number.NaN;
    out.push({
      provider: r.provider,
      model: r.model,
      skipUntil: Number.isFinite(t) ? t : null,
      skipReason: typeof r.skip_reason === "string" && r.skip_reason ? r.skip_reason : null,
      calls48h: count(r.calls_48h),
      ok48h: count(r.ok_48h),
    });
  }
  return out;
}

function active(row: RouteStateRow, now: number): boolean {
  return row.skipUntil !== null && row.skipUntil > now;
}

/**
 * In its skip window? Claude credit / auth failures are account-wide, so they
 * skip every Claude model; everything else is per model.
 */
export function isSkipped(c: RouteCandidate, state: RouteStateRow[], now: number): boolean {
  for (const row of state) {
    if (row.provider !== c.provider || !active(row, now)) continue;
    if (row.model === c.model) return true;
    if (c.provider === "anthropic" && (row.skipReason === "credit" || row.skipReason === "auth")) return true;
  }
  return false;
}

/**
 * 48 h success rate in tenths (0..10), so near-equal models keep the configured
 * order. Unknown or barely used models count as healthy (10).
 */
export function successBucket(c: RouteCandidate, state: RouteStateRow[]): number {
  const row = state.find((r) => r.provider === c.provider && r.model === c.model);
  if (!row || row.calls48h < ROUTE_MIN_SAMPLE) return 10;
  return Math.round((Math.min(row.ok48h, row.calls48h) / row.calls48h) * 10);
}

/**
 * Order the configured chain: Claude, then Gemini models by recent success rate
 * (ties keep the configured order), then Mistral. Models in their skip window
 * move to lastResort; when every candidate is in its window the full original
 * order is returned as primary, so the breaker never removes the only way out.
 */
export function orderCandidates(
  configured: RouteCandidate[],
  state: RouteStateRow[],
  now: number,
  opts: OrderOptions = {},
): RoutePlan {
  const skipped = configured.map((c) => isSkipped(c, state, now));
  if (configured.length === 0 || skipped.every(Boolean)) {
    return { primary: configured.slice(), lastResort: [], allSkipped: configured.length > 0 };
  }
  const healthy = configured.filter((_, i) => !skipped[i]);
  const gemini = healthy
    .filter((c) => c.provider === "gemini")
    .map((c, i) => ({ c, i, rate: opts.keepGeminiOrder ? 0 : successBucket(c, state) }))
    .sort((a, b) => (b.rate - a.rate) || (a.i - b.i))
    .map((x) => x.c);
  return {
    primary: [
      ...healthy.filter((c) => c.provider === "anthropic"),
      ...gemini,
      ...healthy.filter((c) => c.provider === "mistral"),
    ],
    lastResort: configured.filter((_, i) => skipped[i]),
    allSkipped: false,
  };
}

export function modelsOf(list: RouteCandidate[], provider: RouteProvider): string[] {
  return list.filter((c) => c.provider === provider).map((c) => c.model);
}
