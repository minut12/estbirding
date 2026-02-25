export type SafeFetchJsonResult<T = unknown> = {
  ok: boolean;
  status: number;
  json: T | null;
  textSnippet: string;
  timeMs: number;
  url: string;
};

type SafeFetchJsonOptions = Omit<RequestInit, "signal"> & {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
};

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildErrorMessage(status: number, snippet: string): string {
  if (status === 401 || status === 403) {
    return `Missing/invalid API token. Set VITE_EBIRD_TOKEN (or Lovable secret). HTTP ${status}. ${snippet}`;
  }
  return `Request failed. HTTP ${status}. ${snippet}`;
}

export async function safeFetchJson<T = unknown>(
  url: string,
  options: SafeFetchJsonOptions = {},
): Promise<SafeFetchJsonResult<T>> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const retries = options.retries ?? 2;
  const retryBackoff = [1000, 3000];
  let attempt = 0;

  while (attempt <= retries) {
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      const timeMs = Math.round(performance.now() - start);

      if (res.status === 429 && attempt < retries) {
        clearTimeout(timeoutId);
        await delayMs(retryBackoff[Math.min(attempt, retryBackoff.length - 1)]);
        attempt++;
        continue;
      }

      if (!res.ok) {
        const textSnippet = (await res.text().catch(() => "")).slice(0, 200);
        const err = new Error(buildErrorMessage(res.status, textSnippet)) as Error & {
          status?: number;
          textSnippet?: string;
          timeMs?: number;
          url?: string;
        };
        err.status = res.status;
        err.textSnippet = textSnippet;
        err.timeMs = timeMs;
        err.url = url;
        throw err;
      }

      const json = (await res.json()) as T;
      clearTimeout(timeoutId);
      return { ok: true, status: res.status, json, textSnippet: "", timeMs, url };
    } catch (error) {
      clearTimeout(timeoutId);
      const timeMs = Math.round(performance.now() - start);
      const err = error as Error & { status?: number; textSnippet?: string; timeMs?: number; url?: string };

      if (controller.signal.aborted && !(options.signal && options.signal.aborted)) {
        const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`) as Error & {
          status?: number;
          textSnippet?: string;
          timeMs?: number;
          url?: string;
        };
        timeoutError.status = 0;
        timeoutError.textSnippet = "";
        timeoutError.timeMs = timeMs;
        timeoutError.url = url;
        throw timeoutError;
      }
      if ((err && err.name === "AbortError") || (options.signal && options.signal.aborted)) throw err;

      if (attempt < retries) {
        await delayMs(retryBackoff[Math.min(attempt, retryBackoff.length - 1)]);
        attempt++;
        continue;
      }

      if (!err.status) err.status = 0;
      if (!err.timeMs) err.timeMs = timeMs;
      if (!err.url) err.url = url;
      throw err;
    }
  }

  return { ok: false, status: 0, json: null, textSnippet: "", timeMs: 0, url };
}
