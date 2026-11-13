import { describe, expect, it } from 'vitest';
import {
  isSkipped,
  modelsOf,
  orderCandidates,
  parseRouteState,
  successBucket,
  type RouteCandidate,
  type RouteStateRow,
} from '../../supabase/functions/_shared/llmRoute';
import { parseLlmStatus } from '@/features/settings/llmStatus';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const LATER = NOW + 3 * 3600_000;
const PAST = NOW - 60_000;

const CLAUDE: RouteCandidate = { provider: 'anthropic', model: 'claude-sonnet-5-5' };
const G38: RouteCandidate = { provider: 'gemini', model: 'gemini-3.8-flash' };
const G35: RouteCandidate = { provider: 'gemini', model: 'gemini-3.5-flash-lite' };
const G31: RouteCandidate = { provider: 'gemini', model: 'gemini-3.1-flash-lite' };
const MIS: RouteCandidate = { provider: 'mistral', model: 'ministral-14b-2512' };
const CHAIN = [CLAUDE, G38, G35, G31, MIS];

function row(c: RouteCandidate, extra: Partial<RouteStateRow> = {}): RouteStateRow {
  return { provider: c.provider, model: c.model, skipUntil: null, skipReason: null, calls48h: 0, ok48h: 0, ...extra };
}

describe('parseRouteState', () => {
  it('parses RPC rows and drops malformed ones', () => {
    const rows = parseRouteState([
      { provider: 'gemini', model: 'm1', skip_until: '2026-11-12T15:00:00+00:00', skip_reason: 'overload', calls_48h: 21, ok_48h: '0' },
      { provider: 'gemini', model: 'm2', skip_until: null, skip_reason: null, calls_48h: 14, ok_48h: 6 },
      { provider: 'openai', model: 'x' },
      { provider: 'gemini' },
      null,
    ]);
    expect(rows).toEqual([
      { provider: 'gemini', model: 'm1', skipUntil: LATER, skipReason: 'overload', calls48h: 21, ok48h: 0 },
      { provider: 'gemini', model: 'm2', skipUntil: null, skipReason: null, calls48h: 14, ok48h: 6 },
    ]);
    expect(parseRouteState(null)).toEqual([]);
    expect(parseRouteState({})).toEqual([]);
  });
});

describe('isSkipped', () => {
  it('is true only inside the window', () => {
    expect(isSkipped(G38, [row(G38, { skipUntil: LATER, skipReason: 'overload' })], NOW)).toBe(true);
    expect(isSkipped(G38, [row(G38, { skipUntil: PAST, skipReason: 'overload' })], NOW)).toBe(false);
    expect(isSkipped(G35, [row(G38, { skipUntil: LATER, skipReason: 'overload' })], NOW)).toBe(false);
    expect(isSkipped(G38, [], NOW)).toBe(false);
  });

  it('treats a Claude credit or auth window as account-wide, a 429 as per model', () => {
    const other: RouteCandidate = { provider: 'anthropic', model: 'claude-haiku-4-5' };
    expect(isSkipped(other, [row(CLAUDE, { skipUntil: LATER, skipReason: 'credit' })], NOW)).toBe(true);
    expect(isSkipped(other, [row(CLAUDE, { skipUntil: LATER, skipReason: 'auth' })], NOW)).toBe(true);
    expect(isSkipped(other, [row(CLAUDE, { skipUntil: LATER, skipReason: 'rate_limit' })], NOW)).toBe(false);
    expect(isSkipped(G38, [row(G35, { skipUntil: LATER, skipReason: 'credit' })], NOW)).toBe(false);
  });
});

describe('successBucket', () => {
  it('counts unknown and barely used models as healthy', () => {
    expect(successBucket(G31, [])).toBe(10);
    expect(successBucket(G31, [row(G31, { calls48h: 2, ok48h: 0 })])).toBe(10);
    expect(successBucket(G31, [row(G31, { calls48h: 14, ok48h: 6 })])).toBe(4);
    expect(successBucket(G31, [row(G31, { calls48h: 20, ok48h: 20 })])).toBe(10);
  });
});

describe('orderCandidates', () => {
  it('keeps the configured order without state', () => {
    expect(orderCandidates(CHAIN, [], NOW)).toEqual({ primary: CHAIN, lastResort: [], allSkipped: false });
  });

  it('skips Claude and failing models, best Gemini first, Mistral after Gemini', () => {
    const state = [
      row(CLAUDE, { skipUntil: LATER, skipReason: 'credit', calls48h: 11 }),
      row(G38, { skipUntil: LATER, skipReason: 'overload', calls48h: 21 }),
      row(G35, { calls48h: 20, ok48h: 8 }),
      row(G31, { calls48h: 14, ok48h: 13 }),
    ];
    const plan = orderCandidates(CHAIN, state, NOW);
    expect(plan.primary).toEqual([G31, G35, MIS]);
    expect(plan.lastResort).toEqual([CLAUDE, G38]);
    expect(plan.allSkipped).toBe(false);
    expect(modelsOf(plan.primary, 'gemini')).toEqual([G31.model, G35.model]);
    expect(modelsOf(plan.primary, 'mistral')).toEqual([MIS.model]);
  });

  it('keeps Claude first when it is not in its window', () => {
    const state = [row(CLAUDE, { skipUntil: PAST, skipReason: 'credit' }), row(G38, { calls48h: 10, ok48h: 1 })];
    expect(orderCandidates(CHAIN, state, NOW).primary).toEqual([CLAUDE, G35, G31, G38, MIS]);
  });

  it('keeps the configured order on a tie', () => {
    const state = [row(G38, { calls48h: 50, ok48h: 39 }), row(G35, { calls48h: 50, ok48h: 40 }), row(G31, { calls48h: 5, ok48h: 4 })];
    expect(orderCandidates([G38, G35, G31], state, NOW).primary).toEqual([G38, G35, G31]);
  });

  it('keeps a caller-supplied Gemini order but still skips models in window', () => {
    const state = [
      row(G38, { calls48h: 10, ok48h: 1 }),
      row(G35, { skipUntil: LATER, skipReason: 'rate_limit', calls48h: 10 }),
      row(G31, { calls48h: 10, ok48h: 10 }),
    ];
    const plan = orderCandidates([G38, G35, G31, MIS], state, NOW, { keepGeminiOrder: true });
    expect(plan.primary).toEqual([G38, G31, MIS]);
    expect(plan.lastResort).toEqual([G35]);
  });

  it('returns the full original order when every candidate is skipped', () => {
    const state = CHAIN.map((c) => row(c, { skipUntil: LATER, skipReason: 'overload', calls48h: 9 }));
    expect(orderCandidates(CHAIN, state, NOW)).toEqual({ primary: CHAIN, lastResort: [], allSkipped: true });
  });

  it('handles an empty chain and does not mutate its input', () => {
    expect(orderCandidates([], [], NOW)).toEqual({ primary: [], lastResort: [], allSkipped: false });
    const input = [G38, G35];
    orderCandidates(input, [row(G38, { calls48h: 10, ok48h: 0 })], NOW);
    expect(input).toEqual([G38, G35]);
  });
});

describe('parseLlmStatus (P181d keys)', () => {
  it('parses sources and skipped, dropping malformed rows', () => {
    const result = parseLlmStatus({
      sources: [
        { source: 'news-translate-v2', provider: 'gemini', model: 'gemini-3.5-flash-lite', last_ok_at: '2026-11-12T10:10:49Z' },
        { source: 'x', provider: 'openai', model: 'm', last_ok_at: '2026-11-12T10:10:49Z' },
        { provider: 'gemini', model: 'm', last_ok_at: '2026-11-12T10:10:49Z' },
      ],
      skipped: [
        { provider: 'anthropic', model: 'claude-sonnet-5-5', reason: 'credit', skip_until: '2026-11-12T22:12:30Z' },
        { provider: 'gemini', model: 'm', reason: 'overload', skip_until: null },
      ],
    });
    expect(result.sources).toEqual([
      { source: 'news-translate-v2', provider: 'gemini', model: 'gemini-3.5-flash-lite', lastOkAt: '2026-11-12T10:10:49Z' },
    ]);
    expect(result.skipped).toEqual([
      { provider: 'anthropic', model: 'claude-sonnet-5-5', reason: 'credit', skipUntil: '2026-11-12T22:12:30Z' },
    ]);
  });

  it('defaults both to empty lists', () => {
    expect(parseLlmStatus({}).sources).toEqual([]);
    expect(parseLlmStatus(null).skipped).toEqual([]);
  });
});
