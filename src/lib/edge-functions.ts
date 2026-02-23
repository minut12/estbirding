import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/config/supabaseEnv';

export class EdgeInvokeError extends Error {
  status?: number;
  responseText?: string;
  functionName?: string;
  kind: 'network' | 'http' | 'unknown';
  causeName?: string;
  causeMessage?: string;

  constructor(
    message: string,
    options: {
      status?: number;
      responseText?: string;
      functionName?: string;
      kind: 'network' | 'http' | 'unknown';
      causeName?: string;
      causeMessage?: string;
    },
  ) {
    super(message);
    this.name = 'EdgeInvokeError';
    this.status = options.status;
    this.responseText = options.responseText;
    this.functionName = options.functionName;
    this.kind = options.kind;
    this.causeName = options.causeName;
    this.causeMessage = options.causeMessage;
  }
}

export async function invokeEdgeFunction<T = any>(
  supabase: SupabaseClient,
  functionName: string,
  body?: Record<string, unknown>,
): Promise<T> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, body ? { body } : undefined);
    if (error) throw error;
    return data as T;
  } catch (err: any) {
    const message = String(err?.message || err || '');
    const errName = String(err?.name || '');

    if (errName === 'FunctionsFetchError' || /failed to fetch|networkerror/i.test(message)) {
      throw new EdgeInvokeError(
        `Cannot reach Supabase Edge Functions. URL=${SUPABASE_URL}. name=${errName || 'unknown'} message=${message || 'n/a'}`,
        { functionName, kind: 'network', causeName: errName, causeMessage: message },
      );
    }

    if (errName === 'FunctionsHttpError' || err?.context) {
      const response: Response | undefined = err?.context;
      const status = response?.status;
      let text = '';
      try {
        if (response) text = await response.text();
      } catch {
        text = '';
      }
      throw new EdgeInvokeError(
        `Edge function '${functionName}' HTTP ${status ?? 'unknown'}${text ? `: ${text}` : ''}`,
        {
          functionName,
          kind: 'http',
          status,
          responseText: text || undefined,
          causeName: errName,
          causeMessage: message,
        },
      );
    }

    throw new EdgeInvokeError(`Edge function '${functionName}' failed: ${message}`, {
      functionName,
      kind: 'unknown',
      causeName: errName,
      causeMessage: message,
    });
  }
}
