import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabaseEnv';

const MAX_FETCH_LOG_LINES = 10;
const fetchLogLines: string[] = [];
const fetchLogListeners = new Set<(lines: string[]) => void>();

function pushFetchLine(line: string): void {
  fetchLogLines.unshift(line);
  if (fetchLogLines.length > MAX_FETCH_LOG_LINES) {
    fetchLogLines.length = MAX_FETCH_LOG_LINES;
  }
  const snapshot = [...fetchLogLines];
  for (const listener of fetchLogListeners) {
    listener(snapshot);
  }
}

export function getSupabaseFetchLogLines(): string[] {
  return [...fetchLogLines];
}

export function subscribeSupabaseFetchLogs(listener: (lines: string[]) => void): () => void {
  fetchLogListeners.add(listener);
  listener(getSupabaseFetchLogLines());
  return () => {
    fetchLogListeners.delete(listener);
  };
}

const loggingFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = init?.method || 'GET';
  const line = `[fetch] ${method} ${url}`;
  console.log(line);
  pushFetchLine(line);

  try {
    return await fetch(input, init);
  } catch (e) {
    console.error('[fetch error]', method, url, e);
    throw e;
  }
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: loggingFetch,
  },
});
