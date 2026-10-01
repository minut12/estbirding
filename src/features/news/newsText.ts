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
const MIN_SENTENCE = 25;

// A sentence ends at . ! or ? followed by whitespace or end of text, but not
// after a digit, so Estonian ordinals ("28. septembril", "3.\u20134.") do not cut.
const SENTENCE_END_RE = /(?<!\d)[.!?](?=\s|$)/g;

/* Cap at `max` chars with an ellipsis, backing off to the last whitespace when a word would be cut. */
function capWithEllipsis(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cutsWord = !/\s/.test(text.charAt(max));
  const lastSpace = slice.search(/\s\S*$/);
  const head = cutsWord && lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return head.trimEnd() + '\u2026';
}

/* First sentence of a plain text (punctuation kept), extended with whole following sentences
   until at least MIN_SENTENCE chars, then capped at `max` chars with an ellipsis. */
export function firstSentence(text: string | null | undefined, max = DEFAULT_SENTENCE_MAX): string {
  const collapsed = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  let end = collapsed.length;
  for (const match of collapsed.matchAll(SENTENCE_END_RE)) {
    const candidate = (match.index ?? 0) + 1;
    if (candidate >= MIN_SENTENCE || candidate >= collapsed.length) {
      end = candidate;
      break;
    }
  }
  return capWithEllipsis(collapsed.slice(0, end), max);
}
