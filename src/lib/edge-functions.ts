import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/config/supabaseEnv';

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
      throw new Error(`Cannot reach Supabase Edge Functions. URL=${SUPABASE_URL}. Check env + network.`);
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
      throw new Error(`Edge function '${functionName}' HTTP ${status ?? 'unknown'}${text ? `: ${text}` : ''}`);
    }

    throw new Error(`Edge function '${functionName}' failed: ${message}`);
  }
}
