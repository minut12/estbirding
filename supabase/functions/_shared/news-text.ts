// Twin of src/features/news/newsText.ts -- keep the regexes byte-identical (guarded by src/features/news/__tests__/news-text.test.ts).

export const FEED_FOOTER_TEXT_RE = /\s*\(\s*[^()]{0,60}\bFetchRSS\b[^()]{0,12}\)(?:\s*<\/[a-z]+>)*\s*$/i;
export const FEED_FOOTER_EN_RE = /\s*\(\s*Feed\s+generated\s+with\s+FetchRSS\s*\)\s*/gi;
export const FETCHRSS_ANCHOR_RE = /<a\b[^>]*fetchrss\.com[^>]*>\s*FetchRSS\s*<\/a>/gi;

const DANGLING_OPEN_TAGS_RE = /(?:<(?:span|p|div)\b[^>]*>\s*)+$/i;

/* Remove the FetchRSS feed footer (English inline or any-language trailing parenthetical). */
export function stripFeedFooterText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(FEED_FOOTER_EN_RE, " ")
    .replace(FEED_FOOTER_TEXT_RE, "")
    .trim();
}

/* Remove the FetchRSS footer from HTML: unwrap the anchor, drop the trailing parenthetical and any now-empty opening tags. */
export function stripFeedFooterHtml(html: string | null | undefined): string {
  return String(html ?? "")
    .replace(FETCHRSS_ANCHOR_RE, "FetchRSS")
    .replace(FEED_FOOTER_TEXT_RE, "")
    .replace(DANGLING_OPEN_TAGS_RE, "")
    .trim();
}
