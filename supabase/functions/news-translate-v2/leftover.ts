// news-translate-v2 / leftover.ts -- P180 leftover-language guard.
// A translation that copies whole source sentences (a Flash-Lite fallback left
// the second half of a Finnish post untranslated on 2026-11-07) must not be
// marked done. Pure, no Deno: imported by index.ts and leftover.test.ts.
//
// Rule (checked on 140 done items, only the bad one flagged): split the
// Estonian body into sentences; a sentence is "leftover" when it has >= 4
// lowercase words of >= 4 letters and >= 60% of them occur in the source body.
// Capitalised words (names, places) and URLs are ignored on both sides;
// parenthesised text is dropped from the Estonian side (bird names in brackets).

export const LEFTOVER_MIN_WORDS = 4;
export const LEFTOVER_MIN_SHARE = 0.6;

const URL_RE = /https?:\/\/\S+/g;
const WORD_RE = /\p{L}{4,}/gu;

function words(text: string): string[] {
  return text.replace(URL_RE, " ").match(WORD_RE) ?? [];
}

/** Sentences of etBody that are mostly copied source-language text. */
export function leftoverSentences(
  sourceBody: string | null | undefined,
  etBody: string | null | undefined,
): string[] {
  const src = String(sourceBody ?? "");
  const et = String(etBody ?? "");
  if (!src.trim() || !et.trim()) return [];
  const srcWords = new Set(words(src).map((w) => w.toLowerCase()));
  const cleaned = et.replace(URL_RE, " ").replace(/\([^)]*\)/g, " ");
  const out: string[] = [];
  for (const raw of cleaned.split(/(?<=[.!?])\s+/)) {
    const sentence = raw.trim();
    const lower = words(sentence).filter((w) => w === w.toLowerCase());
    if (lower.length < LEFTOVER_MIN_WORDS) continue;
    const hits = lower.filter((w) => srcWords.has(w)).length;
    if (hits / lower.length >= LEFTOVER_MIN_SHARE) out.push(sentence);
  }
  return out;
}

/** Error text for translation_v2_error (without the [retry N] prefix). */
export function leftoverError(sentences: readonly string[]): string {
  const first = (sentences[0] ?? "").slice(0, 160);
  return "leftover source text: " + sentences.length +
    " sentence(s) not translated, e.g. \"" + first + "\"";
}
