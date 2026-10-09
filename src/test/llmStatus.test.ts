import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() } },
}));

import { supabase } from '@/integrations/supabase/client';
import {
  emptyProviderStatus,
  fetchLlmStatus,
  isForbiddenError,
  parseLlmStatus,
  providerState,
  type LlmProviderStatus,
} from '@/features/settings/llmStatus';

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const T1 = '2026-10-08T10:00:00Z';
const T2 = '2026-10-08T11:00:00Z';

function row(provider: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider,
    last_ok_at: T1,
    last_error_at: null,
    last_error_class: null,
    last_error_status: null,
    calls_24h: 3,
    errors_24h: 0,
    tokens_in_24h: 100,
    tokens_out_24h: 50,
    calls_7d: 10,
    errors_7d: 1,
    ...extra,
  };
}

function status(extra: Partial<LlmProviderStatus> = {}): LlmProviderStatus {
  return { ...emptyProviderStatus('gemini'), calls7d: 5, lastOkAt: T1, ...extra };
}

describe('parseLlmStatus', () => {
  it('parses a full payload with numbers and numeric strings', () => {
    const result = parseLlmStatus({
      generated_at: T2,
      providers: [
        row('anthropic', { last_error_at: T2, last_error_class: 'credit', last_error_status: 400 }),
        row('gemini', { calls_24h: '7', tokens_in_24h: '1200', last_error_status: '429' }),
      ],
      fallbacks_24h: '2',
      anthropic_credit_out_since: T2,
    });
    expect(result.generatedAt).toBe(T2);
    expect(result.fallbacks24h).toBe(2);
    expect(result.anthropicCreditOutSince).toBe(T2);
    expect(result.providers.anthropic).toEqual({
      provider: 'anthropic',
      lastOkAt: T1,
      lastErrorAt: T2,
      lastErrorClass: 'credit',
      lastErrorStatus: 400,
      calls24h: 3,
      errors24h: 0,
      tokensIn24h: 100,
      tokensOut24h: 50,
      calls7d: 10,
      errors7d: 1,
    });
    expect(result.providers.gemini.calls24h).toBe(7);
    expect(result.providers.gemini.tokensIn24h).toBe(1200);
    expect(result.providers.gemini.lastErrorStatus).toBe(429);
    expect(result.providers.gemini.lastErrorAt).toBeNull();
    expect(result.providers.mistral).toEqual(emptyProviderStatus('mistral'));
  });

  it('parses the mistral row (P108)', () => {
    const result = parseLlmStatus({ providers: [row('mistral', { calls_24h: 4, last_error_class: 'rate_limit' })] });
    expect(result.providers.mistral.provider).toBe('mistral');
    expect(result.providers.mistral.calls24h).toBe(4);
    expect(result.providers.mistral.lastErrorClass).toBe('rate_limit');
    expect(result.providers.anthropic).toEqual(emptyProviderStatus('anthropic'));
  });

  it('fills a missing provider and missing fallbacks with empty values', () => {
    const result = parseLlmStatus({ generated_at: T2, providers: [row('gemini')] });
    expect(result.providers.anthropic).toEqual(emptyProviderStatus('anthropic'));
    expect(result.providers.gemini.calls7d).toBe(10);
    expect(result.fallbacks24h).toBe(0);
    expect(result.anthropicCreditOutSince).toBeNull();
  });

  it('returns an empty status for non-object input', () => {
    for (const input of [null, 'x', 42, undefined, []]) {
      const result = parseLlmStatus(input);
      expect(result.generatedAt).toBe('');
      expect(result.fallbacks24h).toBe(0);
      expect(result.anthropicCreditOutSince).toBeNull();
      expect(result.providers.anthropic).toEqual(emptyProviderStatus('anthropic'));
      expect(result.providers.gemini).toEqual(emptyProviderStatus('gemini'));
      expect(result.providers.mistral).toEqual(emptyProviderStatus('mistral'));
    }
  });

  it('treats non-array providers as empty', () => {
    const result = parseLlmStatus({ providers: 'nope' });
    expect(result.providers.anthropic).toEqual(emptyProviderStatus('anthropic'));
    expect(result.providers.gemini).toEqual(emptyProviderStatus('gemini'));
  });

  it('drops unknown providers, keeps the first row per provider, coerces bad numbers', () => {
    const result = parseLlmStatus({
      providers: [
        row('openai', { calls_7d: 99 }),
        null,
        'row',
        row('gemini', { calls_7d: 'abc', errors_7d: Number.NaN, last_error_status: 'x', last_ok_at: '' }),
        row('gemini', { calls_7d: 50 }),
      ],
      fallbacks_24h: Number.POSITIVE_INFINITY,
      anthropic_credit_out_since: 5,
    });
    expect(result.providers.anthropic).toEqual(emptyProviderStatus('anthropic'));
    expect(result.providers.gemini.calls7d).toBe(0);
    expect(result.providers.gemini.errors7d).toBe(0);
    expect(result.providers.gemini.lastErrorStatus).toBeNull();
    expect(result.providers.gemini.lastOkAt).toBeNull();
    expect(result.fallbacks24h).toBe(0);
    expect(result.anthropicCreditOutSince).toBeNull();
  });
});

describe('providerState', () => {
  it('is ok when the last call succeeded', () => {
    expect(providerState(status(), null)).toBe('ok');
  });

  it('is nodata when there were no calls in 7 days', () => {
    expect(providerState(status({ calls7d: 0 }), null)).toBe('nodata');
  });

  it('is credit for anthropic when credit is out', () => {
    const p = { ...status(), provider: 'anthropic' as const };
    expect(providerState(p, T2)).toBe('credit');
    expect(providerState({ ...p, calls7d: 0 }, T2)).toBe('credit');
  });

  it('does not mark gemini as credit from anthropic credit-out', () => {
    expect(providerState(status(), T2)).toBe('ok');
  });

  it('maps the latest error class', () => {
    const failing = (cls: string | null): LlmProviderStatus => status({ lastErrorAt: T2, lastErrorClass: cls });
    expect(providerState(failing('rate_limit'), null)).toBe('rate_limit');
    expect(providerState(failing('overload'), null)).toBe('overload');
    expect(providerState(failing('auth'), null)).toBe('auth');
    expect(providerState(failing('credit'), null)).toBe('credit');
    expect(providerState(failing('timeout'), null)).toBe('error');
    expect(providerState(failing('other'), null)).toBe('error');
    expect(providerState(failing(null), null)).toBe('error');
  });

  it('is ok when the error is older than the last success', () => {
    expect(providerState(status({ lastOkAt: T2, lastErrorAt: T1, lastErrorClass: 'auth' }), null)).toBe('ok');
  });

  it('uses the error class when there was never a success', () => {
    expect(providerState(status({ lastOkAt: null, lastErrorAt: T1, lastErrorClass: 'overload' }), null)).toBe(
      'overload',
    );
  });
});

describe('isForbiddenError', () => {
  it('matches the admin guard errors', () => {
    expect(isForbiddenError({ code: '42501', message: 'admin role required' })).toBe(true);
    expect(isForbiddenError({ code: '42501', message: 'not authenticated' })).toBe(true);
    expect(isForbiddenError({ message: 'admin role required' })).toBe(true);
  });

  it('does not match generic errors', () => {
    expect(isForbiddenError({ code: '500', message: 'boom' })).toBe(false);
    expect(isForbiddenError(new Error('network down'))).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
    expect(isForbiddenError('admin role required')).toBe(false);
  });
});

describe('fetchLlmStatus', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('returns ok with the parsed status', async () => {
    rpcMock.mockResolvedValue({ data: { generated_at: T2, providers: [row('anthropic')] }, error: null });
    const result = await fetchLlmStatus();
    expect(rpcMock).toHaveBeenCalledWith('admin_llm_status');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.status.generatedAt).toBe(T2);
      expect(result.status.providers.anthropic.calls7d).toBe(10);
    }
  });

  it('returns forbidden for the non-admin error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'admin role required' } });
    await expect(fetchLlmStatus()).resolves.toEqual({ kind: 'forbidden' });
  });

  it('rejects on other errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom' } });
    await expect(fetchLlmStatus()).rejects.toThrow('boom');
  });

  it('rejects with the fallback message when the error has none', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'XX000' } });
    await expect(fetchLlmStatus()).rejects.toThrow('Andmeid ei saanud laadida');
  });
});
