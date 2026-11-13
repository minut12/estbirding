// P181f: browser error beacon. Sends uncaught errors, unhandled rejections and
// RootErrorBoundary catches to public.log_client_error (SECURITY DEFINER RPC).
// Throttled per page load and filtered for known noise; never throws.
import { supabase } from '@/integrations/supabase/client';

export type ClientErrorSurface = 'app' | 'linnuliigid' | 'europe' | 'rariliin';

export interface ClientErrorPayload {
  p_surface: ClientErrorSurface;
  p_message: string;
  p_stack: string | null;
  p_url: string;
  p_build: string;
  p_user_agent: string;
}

export type ClientErrorSender = (payload: ClientErrorPayload) => Promise<void> | void;

export interface ClientErrorReporter {
  report: (err: unknown) => boolean;
  sentCount: () => number;
}

export const MAX_CLIENT_ERROR_REPORTS = 5;

const IGNORED_MESSAGE_PATTERNS: readonly RegExp[] = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
];

const EXTENSION_PATTERN = /(chrome|moz|safari|safari-web)-extension:\/\//i;

export function normalizeClientError(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) {
    return { message: `${err.name}: ${err.message}`, stack: err.stack ? String(err.stack) : null };
  }
  if (typeof err === 'string') return { message: err, stack: null };
  if (err && typeof err === 'object') {
    const rec = err as { message?: unknown; stack?: unknown };
    const message = typeof rec.message === 'string' ? rec.message : safeStringify(err);
    const stack = typeof rec.stack === 'string' ? rec.stack : null;
    return { message, stack };
  }
  return { message: String(err), stack: null };
}

export function shouldIgnoreClientError(message: string, stack: string | null): boolean {
  const msg = (message || '').trim();
  if (!msg && !stack) return true;
  if (IGNORED_MESSAGE_PATTERNS.some((re) => re.test(msg))) return true;
  if (EXTENSION_PATTERN.test(msg) || (stack !== null && EXTENSION_PATTERN.test(stack))) return true;
  return false;
}

export function createClientErrorReporter(
  surface: ClientErrorSurface,
  build: string,
  send: ClientErrorSender,
  max: number = MAX_CLIENT_ERROR_REPORTS,
): ClientErrorReporter {
  let sent = 0;
  const report = (err: unknown): boolean => {
    try {
      if (sent >= max) return false;
      const { message, stack } = normalizeClientError(err);
      if (shouldIgnoreClientError(message, stack)) return false;
      sent += 1;
      const payload: ClientErrorPayload = {
        p_surface: surface,
        p_message: message.slice(0, 500),
        p_stack: stack ? stack.slice(0, 4000) : null,
        p_url: typeof location !== 'undefined' ? String(location.href).slice(0, 500) : '',
        p_build: build,
        p_user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 500) : '',
      };
      void Promise.resolve(send(payload)).catch(() => {});
      return true;
    } catch {
      return false;
    }
  };
  return { report, sentCount: () => sent };
}

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type ClientErrorRpcClient = {
  rpc: (fn: 'log_client_error', args: ClientErrorPayload) => RpcResult;
};

function rpcClient(): ClientErrorRpcClient {
  return supabase as unknown as ClientErrorRpcClient;
}

export const sendClientErrorViaRpc: ClientErrorSender = async (payload) => {
  await rpcClient().rpc('log_client_error', payload);
};

let appReporter: ClientErrorReporter | null = null;

export function installClientErrorHandlers(build: string): void {
  if (appReporter || typeof window === 'undefined') return;
  const reporter = createClientErrorReporter('app', build, sendClientErrorViaRpc);
  appReporter = reporter;
  window.addEventListener('error', (event: ErrorEvent) => {
    reporter.report(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reporter.report(event.reason);
  });
}

export function reportClientError(err: unknown): void {
  appReporter?.report(err);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
