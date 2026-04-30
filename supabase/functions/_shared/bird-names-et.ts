/**
 * Latin scientific name → Estonian common name dictionary.
 *
 * Source of truth: data/Linnud.txt (EOÜ checklist, ~11,776 species).
 * Loaded once at module init via the existing parser in bird-name-correction.ts.
 *
 * To add or correct a species name, edit data/Linnud.txt only — no code change required.
 *
 * Used as post-processing after AI translation to fix incorrect bird names.
 */

import { LOOKUPS } from "./bird-name-correction.ts";

/**
 * Lowercase Latin binomial → Estonian common name.
 * Re-exported from bird-name-correction.ts so existing call sites
 * (translateToEstonian, translateToEstonianClaude) don't need to change.
 */
export const LATIN_TO_ESTONIAN: Map<string, string> = LOOKUPS.latinToEt;

/**
 * Common calque corrections — patterns the model produces when a species
 * is missing from the dictionary or when it ignores the dictionary entry.
 * These run as a final pass to catch known wrong-name patterns.
 *
 * Add new entries when you spot a new calque in production output.
 * Use `$1` to preserve Estonian declension suffixes captured by the regex.
 */
const CALQUE_CORRECTIONS: Array<[RegExp, string]> = [
  [/\bDalmaatsia\s+pelikan(i|it|ile|is|ist|iks|iga|ina)?\b/gi, "käharpelikan$1"],
  [/\bDalmaatia\s+pelikan(i|it|ile|is|ist|iks|iga|ina)?\b/gi, "käharpelikan$1"],
  [/\bSabatiigli\s+kiivitaja(t|le|s|st|ks|ga|na)?\b/gi, "stepikiivitaja$1"],
  [/\bkannusvästrik(u|ut|ule|us|ust|uks|uga|una|ud|ute|uid|utes|utega|uteta)?\b/gi, "valgekael-kiivitaja$1"],
];

export function fixCalquesInText(text: string): string {
  if (!text) return text;
  console.log("[PHASE2-DBG-B] fixCalquesInText reached, len=", text.length, "containsCalque=", /Dalmaatsia\s+pelikan/i.test(text));
  let result = text;
  for (const [pattern, replacement] of CALQUE_CORRECTIONS) {
    result = result.replace(pattern, replacement);
  }
  console.log("[PHASE2-DBG-C] fixCalquesInText output, changed=", text !== result, "preview=", result.slice(0, 120));
  return result;
}

export function fixBirdNamesInText(text: string): string {
  if (!text) return text;
  console.log("[PHASE2-DBG-A] fixBirdNamesInText reached, len=", text.length, "preview=", text.slice(0, 120));

  // Pre-pass: strip markdown italic wrappers around Latin binomials inside parens.
  // The model sometimes adds *X y*, _X y_, or <i>X y</i> around scientific names,
  // which would otherwise prevent Pattern 1 from matching the Latin lookup.
  const normalized = text
    .replace(/\(\s*\*\s*([A-Z][a-z]+\s+[a-z]+)\s*\*\s*\)/g, "($1)")
    .replace(/\(\s*_\s*([A-Z][a-z]+\s+[a-z]+)\s*_\s*\)/g, "($1)")
    .replace(/\(\s*<i>\s*([A-Z][a-z]+\s+[a-z]+)\s*<\/i>\s*\)/gi, "($1)");

  // Pattern 1: "<estonian-or-source-name> (Genus species)" → "<correct-estonian> (Genus species)"
  let result = normalized.replace(
    /([\p{L}\-]+(?:\s+[\p{L}\-]+){0,3})\s*\(([A-Z][a-z]+\s+[a-z]+)\)/gu,
    (match, _estName, latinName) => {
      const correct = LATIN_TO_ESTONIAN.get(latinName.toLowerCase());
      if (correct) return `${correct} (${latinName})`;
      return match;
    },
  );

  // Pattern 2: standalone Latin binomial (no parens) → "<correct-estonian> (Genus species)"
  result = result.replace(
    /(?<!\()(?<!\w)\b([A-Z][a-z]+\s+[a-z]+)\b(?!\))/g,
    (match, latinName) => {
      const correct = LATIN_TO_ESTONIAN.get(latinName.toLowerCase());
      if (correct) return `${correct} (${latinName})`;
      return match;
    },
  );

  // Final pass: catch known calques that appear without an accompanying Latin name.
  result = fixCalquesInText(result);

  return result;
}
