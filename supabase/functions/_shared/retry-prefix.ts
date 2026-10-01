// retry-prefix.ts -- "[retry N] " marker on news_items.translation_v2_error.
// news-translate-v2 writes it on every error patch; get-news-untranslated-v2
// re-queues error rows until the marker reaches RETRY_MAX. Pure, no Deno.

export const RETRY_MAX = 3;
export const ERROR_MAX_LEN = 800;
const RETRY_PREFIX_RE = /^\[retry (\d+)\] /;

/** Previous attempt count encoded in translation_v2_error (0 when absent). */
export function retryCount(prevError: string | null | undefined): number {
  const m = RETRY_PREFIX_RE.exec(prevError ?? "");
  return m ? Number(m[1]) : 0;
}

/** "[retry N+1] " + message, cut so the whole string stays within ERROR_MAX_LEN. */
export function withRetryPrefix(
  prevError: string | null | undefined,
  message: string,
): string {
  const prefix = "[retry " + (retryCount(prevError) + 1) + "] ";
  return prefix + String(message).slice(0, ERROR_MAX_LEN - prefix.length);
}
