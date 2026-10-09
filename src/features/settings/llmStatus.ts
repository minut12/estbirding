import { supabase } from '@/integrations/supabase/client';

export type LlmProviderId = 'anthropic' | 'gemini' | 'mistral';

export interface LlmProviderStatus {
  provider: LlmProviderId;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorClass: string | null;
  lastErrorStatus: number | null;
  calls24h: number;
  errors24h: number;
  tokensIn24h: number;
  tokensOut24h: number;
  calls7d: number;
  errors7d: number;
}

export interface LlmStatus {
  generatedAt: string;
  fallbacks24h: number;
  anthropicCreditOutSince: string | null;
  providers: { anthropic: LlmProviderStatus; gemini: LlmProviderStatus; mistral: LlmProviderStatus };
}

export type LlmProviderState = 'ok' | 'credit' | 'rate_limit' | 'overload' | 'auth' | 'error' | 'nodata';

export type LlmStatusResult = { kind: 'ok'; status: LlmStatus } | { kind: 'forbidden' };

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;

type LlmStatusRpcClient = {
  rpc: (fn: 'admin_llm_status') => RpcResult;
};

// Raised by public.events_admin_assert_admin(), which admin_llm_status() calls first.
const FORBIDDEN_CODE = '42501';
const FORBIDDEN_MESSAGES = ['admin role required', 'not authenticated'];
const LOAD_FAILED = 'Andmeid ei saanud laadida';

export function emptyProviderStatus(provider: LlmProviderId): LlmProviderStatus {
  return {
    provider,
    lastOkAt: null,
    lastErrorAt: null,
    lastErrorClass: null,
    lastErrorStatus: null,
    calls24h: 0,
    errors24h: 0,
    tokensIn24h: 0,
    tokensOut24h: 0,
    calls7d: 0,
    errors7d: 0,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function isProviderId(value: unknown): value is LlmProviderId {
  return value === 'anthropic' || value === 'gemini' || value === 'mistral';
}

function parseProvider(provider: LlmProviderId, r: Record<string, unknown>): LlmProviderStatus {
  return {
    provider,
    lastOkAt: str(r.last_ok_at),
    lastErrorAt: str(r.last_error_at),
    lastErrorClass: str(r.last_error_class),
    lastErrorStatus: numOrNull(r.last_error_status),
    calls24h: num(r.calls_24h),
    errors24h: num(r.errors_24h),
    tokensIn24h: num(r.tokens_in_24h),
    tokensOut24h: num(r.tokens_out_24h),
    calls7d: num(r.calls_7d),
    errors7d: num(r.errors_7d),
  };
}

export function parseLlmStatus(data: unknown): LlmStatus {
  const r = asRecord(data) ?? {};
  const rows = Array.isArray(r.providers) ? r.providers : [];
  const found: Partial<Record<LlmProviderId, LlmProviderStatus>> = {};
  for (const row of rows) {
    const rec = asRecord(row);
    if (!rec || !isProviderId(rec.provider) || found[rec.provider]) continue;
    found[rec.provider] = parseProvider(rec.provider, rec);
  }
  return {
    generatedAt: str(r.generated_at) ?? '',
    fallbacks24h: num(r.fallbacks_24h),
    anthropicCreditOutSince: str(r.anthropic_credit_out_since),
    providers: {
      anthropic: found.anthropic ?? emptyProviderStatus('anthropic'),
      gemini: found.gemini ?? emptyProviderStatus('gemini'),
      mistral: found.mistral ?? emptyProviderStatus('mistral'),
    },
  };
}

export function isForbiddenError(error: unknown): boolean {
  const r = asRecord(error);
  if (!r) return false;
  if (r.code === FORBIDDEN_CODE) return true;
  const message = typeof r.message === 'string' ? r.message.toLowerCase() : '';
  return FORBIDDEN_MESSAGES.some((m) => message.includes(m));
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  const r = asRecord(error);
  if (r && typeof r.message === 'string' && r.message) return new Error(r.message);
  return new Error(LOAD_FAILED);
}

function rpcClient(): LlmStatusRpcClient {
  return supabase as unknown as LlmStatusRpcClient;
}

export async function fetchLlmStatus(): Promise<LlmStatusResult> {
  const { data, error } = await rpcClient().rpc('admin_llm_status');
  if (error) {
    if (isForbiddenError(error)) return { kind: 'forbidden' };
    throw toError(error);
  }
  return { kind: 'ok', status: parseLlmStatus(data) };
}

export function providerState(p: LlmProviderStatus, creditOutSince: string | null): LlmProviderState {
  if (p.provider === 'anthropic' && creditOutSince) return 'credit';
  if (p.calls7d === 0) return 'nodata';
  if (p.lastErrorAt && (p.lastOkAt === null || Date.parse(p.lastErrorAt) > Date.parse(p.lastOkAt))) {
    const c = p.lastErrorClass;
    if (c === 'credit' || c === 'rate_limit' || c === 'overload' || c === 'auth') return c;
    return 'error';
  }
  return 'ok';
}
