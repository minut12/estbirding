// Pure news text helpers (no React). The three regexes are mirrored
// byte-identically in supabase/functions/_shared/news-text.ts; the twin guard
// in src/features/news/__tests__/news-text.test.ts keeps them in sync.

export const FEED_FOOTER_TEXT_RE = /\s*\(\s*[^()]{0,60}\bFetchRSS\b[^()]{0,12}\)(?:\s*<\/[a-z]+>)*\s*$/i;
export const FEED_FOOTER_EN_RE = /\s*\(\s*Feed\s+generated\s+with\s+FetchRSS\s*\)\s*/gi;
export const FETCHRSS_ANCHOR_RE = /<a\b[^>]*fetchrss\.com[^>]*>\s*FetchRSS\s*<\/a>/gi;

const DANGLING_OPEN_TAGS_RE = /(?:<(?:span|p|div)\b[^>]*>\s*)+$/i;

/* Remove the FetchRSS feed footer (English inline or any-language trailing parenthetical). */
export function stripFeedFooterText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(FEED_FOOTER_EN_RE, ' ')
    .replace(FEED_FOOTER_TEXT_RE, '')
    .trim();
}

/* Remove the FetchRSS footer from HTML: unwrap the anchor, drop the trailing parenthetical and any now-empty opening tags. */
export function stripFeedFooterHtml(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(FETCHRSS_ANCHOR_RE, 'FetchRSS')
    .replace(FEED_FOOTER_TEXT_RE, '')
    .replace(DANGLING_OPEN_TAGS_RE, '')
    .trim();
}

export type SourceLike = {
  source_slug?: string | null;
  slug?: string | null;
  source_key?: string | null;
  source_name?: string | null;
  name?: string | null;
};

function nonEmpty(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

/* Stable filter key for a source or item: slug first, then source_key prefix, then name. */
export function getCanonicalSourceValue(source: SourceLike): string {
  const candidates = [
    source.source_slug,
    source.slug,
    nonEmpty(source.source_key).split(':')[0],
    source.source_name,
    source.name,
  ];
  for (const candidate of candidates) {
    const value = nonEmpty(candidate);
    if (value) return value.toLowerCase();
  }
  return '';
}

const DEFAULT_SENTENCE_MAX = 110;

/* First sentence of a plain text (punctuation kept), capped at `max` chars with an ellipsis. */
export function firstSentence(text: string | null | undefined, max = DEFAULT_SENTENCE_MAX): string {
  const collapsed = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  const match = collapsed.match(/^.*?[.!?](?=\s|$)/);
  const sentence = match ? match[0] : collapsed;
  if (sentence.length > max) return sentence.slice(0, max).trimEnd() + '\u2026';
  return sentence;
}
