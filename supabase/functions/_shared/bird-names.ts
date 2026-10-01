// bird-names.ts -- deterministic Estonian bird-name corrector for translated
// news (P86d). Pure module: no Deno globals, no I/O, no import.meta, so it is
// shared by the news-translate-v2 Edge Function and the vitest suite under
// src/features/news/__tests__/.
//
// Pipeline per item (fixItemBirdNames):
//   1. correctAnchoredNames  body, then title -- "name (Genus species)" spans are
//      checked against Linnud.txt; a bare "Genus species" gets the dictionary
//      name inserted. Every rewrite is collected as an X->Y replacement.
//   2. propagateReplacements  the item's X->Y set is applied to the unanchored
//      mentions of both fields (titles rarely carry a Latin anchor).
//   3. dedupeLatin           a dictionary binomial is shown once per field.
//   4. fixCalques            source-language calques.
//
// sameSpecies decides "same bird, different inflection" vs "different bird":
// leading parts (hyphen/space separated) must be equal; the last part is the
// same when one is the other plus at most SUFFIX_MAX letters, or when the
// lengths differ by at most HEAD_LEN_DIFF_MAX and the shared prefix reaches
// max(4, min(len) - 2). Diacritics are never folded.

export type LatinToEt = Record<string, string>;

export interface NameReplacement {
  /** X: the span that was rewritten, as it appeared in the draft. */
  readonly from: string;
  /** Y: what it was rewritten to. */
  readonly to: string;
  /** true when only the leading words changed (the draft's inflected last word was kept). */
  readonly lastSame: boolean;
  readonly latin: string;
}

export interface CorrectedText {
  readonly text: string;
  readonly replacements: readonly NameReplacement[];
}

export interface ItemText {
  readonly title: string;
  readonly body: string;
}

const SUFFIX_MAX = 6;
const HEAD_LEN_DIFF_MAX = 4;
const MIN_SHARED_PREFIX = 4;
const MIN_LATIN_PREFIX = 4;
const MIN_STEM_LEN = 4;
const STEM_CUT = 2;

const LATIN_BINOMIAL = "[A-Z][a-z]+\\s+[a-z]+";
const ANCHORED_RE = new RegExp(
  "([\\p{L}\\-]+(?:\\s+[\\p{L}\\-]+){0,3})\\s*\\((" + LATIN_BINOMIAL + ")\\)",
  "gu",
);
const BARE_LATIN_RE = new RegExp(
  "(?<!\\()(?<!\\w)\\b(" + LATIN_BINOMIAL + ")\\b(?!\\))",
  "g",
);
const LATIN_PAREN_RE = new RegExp("\\s*\\((" + LATIN_BINOMIAL + ")\\)", "g");
const ANCHOR_LOOKAHEAD = "(?!\\s*\\(" + LATIN_BINOMIAL + "\\))";
// Start of string, end of a sentence, or a new line (optionally after a
// markdown heading/list/quote marker). A colon is deliberately NOT a boundary.
const SENTENCE_START_RE =
  /(?:^|[.!?\u2026]|\n[ \t]*(?:[#>*\-]+[ \t]*)?)["\u00AB\u201C(]?[ \t]*$/;

export function parseLinnud(tsv: string): LatinToEt {
  const map: LatinToEt = {};
  const lines = String(tsv || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(
    Boolean,
  );
  if (lines.length < 2) return map;
  const header = lines[0].split("\t").map(function (c) {
    return c.trim();
  });
  const li = header.indexOf("nimi_lk");
  const ei = header.indexOf("nimi_ek");
  if (li < 0 || ei < 0) return map;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const est = String(cells[ei] || "").replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!est) continue;
    const aliases = String(cells[li] || "").split(",");
    for (let a = 0; a < aliases.length; a++) {
      const key = aliases[a].toLowerCase().replace(/\*/g, "")
        .replace(/[()\[\]]/g, "").replace(/\s+/g, " ").trim();
      if (key && !map[key]) map[key] = est;
    }
  }
  return map;
}

export const CALQUES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bDalmaatsia\s+pelikan(i|it|ile|is|ist|iks|iga|ina)?\b/gi, "käharpelikan$1"],
  [/\bDalmaatia\s+pelikan(i|it|ile|is|ist|iks|iga|ina)?\b/gi, "käharpelikan$1"],
  [/\bSabatiigli\s+kiivitaja(t|le|s|st|ks|ga|na)?\b/gi, "stepikiivitaja$1"],
  [
    /\bkannusvästrik(u|ut|ule|us|ust|uks|uga|una|ud|ute|uid|utes|utega|uteta)?\b/gi,
    "valgekael-kiivitaja$1",
  ],
  [/\btuttvart-koiras(t|tega|le|s|st|ks|ina)?\b/gi, "tutka-isane$1"],
  [/\btuttvart-koirased(?=\b)/gi, "tutka-isased"],
  [/\bkoirased\b/gi, "isased"],
  [/\bkoirastega\b/gi, "isastega"],
  [/\bkoirast\b/gi, "isast"],
  [/\bkoiraste\b/gi, "isaste"],
  [/\btuttvartidel\b/gi, "tutkadel"],
  [/\btuttvartid\b/gi, "tutkad"],
  [/\bvappubukett(i|it|ile|is|ist|iks|iga|ina)?\b/gi, "kevadlille$1"],
  [/\bvappuõis(t|tega|le|s|st|ks|ed)?\b/gi, "kevadlille$1"],
];

export function fixCalques(t: string): string {
  if (!t) return t;
  let r = t;
  for (let i = 0; i < CALQUES.length; i++) {
    r = r.replace(CALQUES[i][0], CALQUES[i][1]);
  }
  return r;
}

function lowerNfc(s: string): string {
  return String(s || "").normalize("NFC").toLowerCase().trim();
}

/** NFC, lowercase, trimmed, hyphens removed. Diacritics are kept. */
export function normalizeBirdName(s: string): string {
  return lowerNfc(s).replace(/-/g, "");
}

function isSuffixForm(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return longer.startsWith(shorter) &&
    longer.length - shorter.length <= SUFFIX_MAX;
}

function sameHead(a: string, b: string): boolean {
  if (a === b) return true;
  if (isSuffixForm(a, b)) return true;
  if (Math.abs(a.length - b.length) > HEAD_LEN_DIFF_MAX) return false;
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i >= Math.max(MIN_SHARED_PREFIX, n - STEM_CUT);
}

export function sameSpecies(a: string, b: string): boolean {
  const na = normalizeBirdName(a);
  const nb = normalizeBirdName(b);
  if (!na || !nb) return false;
  if (na === nb || isSuffixForm(na, nb)) return true;
  const pa = lowerNfc(a).split(/[-\s]+/);
  const pb = lowerNfc(b).split(/[-\s]+/);
  if (pa.length !== pb.length) return false;
  for (let i = 0; i < pa.length - 1; i++) {
    if (pa[i] !== pb[i]) return false;
  }
  return sameHead(pa[pa.length - 1], pb[pb.length - 1]);
}

export function isSentenceStart(text: string, index: number): boolean {
  return SENTENCE_START_RE.test(text.slice(0, index));
}

function isCapitalised(word: string): boolean {
  const c = word.charAt(0);
  return c !== "" && c === c.toUpperCase() && c !== c.toLowerCase();
}

function capitaliseFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Hyphen is left alone: it is only special inside a character class, and
// "\-" outside one is an invalid escape under the u flag.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const headWordsCache = new WeakMap<LatinToEt, ReadonlySet<string>>();

/** Last words of multi-word dictionary names (e.g. "pistrik" from "vahemere pistrik"). */
export function buildHeadWords(latinToEt: LatinToEt): ReadonlySet<string> {
  const cached = headWordsCache.get(latinToEt);
  if (cached) return cached;
  const heads = new Set<string>();
  const names = Object.values(latinToEt);
  for (let i = 0; i < names.length; i++) {
    const words = names[i].split(" ");
    if (words.length > 1) heads.add(normalizeBirdName(words[words.length - 1]));
  }
  headWordsCache.set(latinToEt, heads);
  return heads;
}

function isLatinPrefix(wordNorm: string, latin: string): boolean {
  if (wordNorm.length < MIN_LATIN_PREFIX) return false;
  const parts = latin.toLowerCase().split(/\s+/);
  return parts.some(function (p) {
    return p.startsWith(wordNorm);
  });
}

function wordStarts(span: string, words: string[], offset: number): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const idx = span.indexOf(words[i], cursor);
    starts.push(offset + idx);
    cursor = idx + words[i].length;
  }
  return starts;
}

interface SpanRewrite {
  readonly replacement: NameReplacement | null;
  readonly text: string;
}

// Decides how one "words (Genus species)" match is rewritten. Walks leftwards
// from the last word: dictionary words are absorbed freely; a capitalised
// foreign word is absorbed only while a dictionary prefix word is still
// missing (never at sentence start) or when it is a prefix of the Latin name
// ("Eleonora" ~ eleonorae). Place names before a complete name survive.
function rewriteSpan(
  text: string,
  span: string,
  latin: string,
  dictName: string,
  offset: number,
): SpanRewrite {
  const words = span.split(/\s+/);
  const starts = wordStarts(span, words, offset);
  const dictWords = dictName.split(" ");
  const dictLead = dictWords.slice(0, -1);
  const dictLast = dictWords[dictWords.length - 1];
  const last = words[words.length - 1];
  const lastSame = sameSpecies(last, dictLast);
  const leadNorm = dictLead.map(normalizeBirdName);
  const missing = new Set(leadNorm);
  let budget = dictLead.length;
  let take = 0;
  for (let k = words.length - 2; k >= 0; k--) {
    const wn = normalizeBirdName(words[k]);
    if (leadNorm.indexOf(wn) >= 0) {
      missing.delete(wn);
      take++;
      continue;
    }
    if (budget <= 0 || !isCapitalised(words[k])) break;
    const atStart = isSentenceStart(text, starts[k]);
    if ((missing.size > 0 && !atStart) || isLatinPrefix(wn, latin)) {
      budget--;
      take++;
      continue;
    }
    break;
  }
  const spanWords = words.slice(words.length - 1 - take);
  const keptPre = words.slice(0, words.length - 1 - take);
  const spanText = spanWords.join(" ");
  const newName = lastSame ? dictLead.concat([last]).join(" ") : dictName;
  const prefix = keptPre.length > 0 ? keptPre.join(" ") + " " : "";
  if (lowerNfc(newName) === lowerNfc(spanText)) {
    return { replacement: null, text: prefix + spanText + " (" + latin + ")" };
  }
  const atStart = isSentenceStart(text, starts[words.length - 1 - take]) &&
    isCapitalised(spanWords[0]);
  const shown = atStart ? capitaliseFirst(newName) : newName;
  return {
    replacement: { from: spanText, to: newName, lastSame, latin },
    text: prefix + shown + " (" + latin + ")",
  };
}

/** Passes 1 + 2: anchored spans checked against the dictionary, bare binomials named. */
export function correctAnchoredNames(
  text: string,
  latinToEt: LatinToEt,
): CorrectedText {
  if (!text) return { text, replacements: [] };
  const normalized = String(text)
    .replace(/\(\s*\*\s*([A-Z][a-z]+\s+[a-z]+)\s*\*\s*\)/g, "($1)")
    .replace(/\(\s*_\s*([A-Z][a-z]+\s+[a-z]+)\s*_\s*\)/g, "($1)")
    .replace(/\(\s*<i>\s*([A-Z][a-z]+\s+[a-z]+)\s*<\/i>\s*\)/gi, "($1)");
  const replacements: NameReplacement[] = [];
  const pass1 = normalized.replace(
    ANCHORED_RE,
    function (m: string, span: string, latin: string, offset: number) {
      const dictName = latinToEt[latin.toLowerCase()];
      if (!dictName) return m;
      const r = rewriteSpan(normalized, span, latin, dictName, offset);
      if (r.replacement) replacements.push(r.replacement);
      return r.text;
    },
  );
  const pass2 = pass1.replace(
    BARE_LATIN_RE,
    function (m: string, latin: string, offset: number) {
      const c = latinToEt[latin.toLowerCase()];
      if (!c) return m;
      const shown = isSentenceStart(pass1, offset) ? capitaliseFirst(c) : c;
      return shown + " (" + latin + ")";
    },
  );
  return { text: pass2, replacements };
}

interface PropagationGroup {
  readonly lead: readonly string[];
  readonly base: string;
  readonly stem: string;
  readonly to: string;
  readonly lastSame: boolean;
}

function stemOf(base: string): string {
  return base.slice(0, Math.max(MIN_STEM_LEN, base.length - STEM_CUT));
}

function groupReplacements(
  replacements: readonly NameReplacement[],
): PropagationGroup[] {
  const targets = new Map<string, Set<string>>();
  const groups = new Map<string, PropagationGroup>();
  for (let i = 0; i < replacements.length; i++) {
    const r = replacements[i];
    const fromKey = lowerNfc(r.from);
    const seen = targets.get(fromKey) ?? new Set<string>();
    seen.add(lowerNfc(r.to));
    targets.set(fromKey, seen);
    const words = lowerNfc(r.from).split(/\s+/);
    const lead = words.slice(0, -1);
    const base = words[words.length - 1];
    const key = lead.join(" ") + "|" + lowerNfc(r.to);
    const existing = groups.get(key);
    if (!existing || base.length < existing.base.length) {
      groups.set(key, {
        lead,
        base,
        stem: stemOf(base),
        to: r.to,
        lastSame: r.lastSame,
      });
    }
  }
  const ambiguous = new Set<string>();
  targets.forEach(function (tos, from) {
    if (tos.size > 1) ambiguous.add(from);
  });
  const out: PropagationGroup[] = [];
  groups.forEach(function (g) {
    const fromKey = g.lead.concat([g.base]).join(" ");
    if (!ambiguous.has(fromKey)) out.push(g);
  });
  return out;
}

function groupPattern(g: PropagationGroup, anchoredOnly: boolean): RegExp {
  const lead = g.lead.map(escapeRegExp).join("\\s+");
  const leadPat = lead ? lead + "\\s+" : "";
  const token = "(" + escapeRegExp(g.stem) + "[\\p{L}\\-]*)";
  const tail = anchoredOnly
    ? "\\s*\\(" + LATIN_BINOMIAL + "\\)"
    : ANCHOR_LOOKAHEAD;
  return new RegExp("(?<![\\p{L}\\-])" + leadPat + token + tail, "giu");
}

function shouldSkipGroup(
  g: PropagationGroup,
  text: string,
  heads: ReadonlySet<string>,
): boolean {
  const baseNorm = normalizeBirdName(g.base);
  if (baseNorm.length < MIN_STEM_LEN) return true;
  if (g.lead.length === 0 && heads.has(baseNorm)) return true;
  if (lowerNfc(g.to).startsWith(g.stem)) return true;
  // A same-stem mention that kept its own (Latin) survived pass 1 as a
  // correct name, so the bare mentions are ambiguous.
  return groupPattern(g, true).test(text);
}

function propagateGroup(text: string, g: PropagationGroup): string {
  const toLead = g.to.split(" ").slice(0, -1);
  return text.replace(
    groupPattern(g, false),
    function (m: string, token: string, offset: number) {
      if (lowerNfc(m) === lowerNfc(g.to)) return m;
      let out: string;
      if (g.lastSame) {
        out = toLead.concat([token]).join(" ");
      } else {
        const tokenLow = lowerNfc(token);
        const suffix = tokenLow.length > g.base.length &&
            tokenLow.startsWith(g.base)
          ? token.slice(g.base.length)
          : "";
        out = g.to + suffix;
      }
      const keepCase = isCapitalised(m) && isSentenceStart(text, offset);
      return keepCase ? capitaliseFirst(out) : out;
    },
  );
}

/** Rule 3: apply the item's X->Y set to unanchored mentions (stem match on the last word). */
export function propagateReplacements(
  text: string,
  replacements: readonly NameReplacement[],
  heads: ReadonlySet<string>,
): string {
  if (!text || replacements.length === 0) return text;
  const groups = groupReplacements(replacements);
  let result = text;
  for (let i = 0; i < groups.length; i++) {
    if (shouldSkipGroup(groups[i], result, heads)) continue;
    result = propagateGroup(result, groups[i]);
  }
  return result;
}

/** Pass 3: a dictionary binomial is shown once; unknown parentheticals (place names) survive. */
export function dedupeLatin(text: string, latinToEt: LatinToEt): string {
  if (!text) return text;
  const seen: Record<string, boolean> = {};
  return text.replace(
    LATIN_PAREN_RE,
    function (m: string, latin: string) {
      const key = latin.toLowerCase();
      if (!latinToEt[key]) return m;
      if (seen[key]) return "";
      seen[key] = true;
      return m;
    },
  );
}

/** Single-field corrector (propagation uses only the field's own replacements). */
export function fixBirdNames(text: string, latinToEt: LatinToEt): string {
  if (!text) return text;
  const corrected = correctAnchoredNames(text, latinToEt);
  const propagated = propagateReplacements(
    corrected.text,
    corrected.replacements,
    buildHeadWords(latinToEt),
  );
  return fixCalques(dedupeLatin(propagated, latinToEt));
}

/** Item corrector: body first, title second, one shared X->Y set, separate de-dupe per field. */
export function fixItemBirdNames(
  item: ItemText,
  latinToEt: LatinToEt,
): ItemText {
  const body = correctAnchoredNames(item.body, latinToEt);
  const title = correctAnchoredNames(item.title, latinToEt);
  const replacements = body.replacements.concat(title.replacements);
  const heads = buildHeadWords(latinToEt);
  const finish = function (text: string): string {
    const propagated = propagateReplacements(text, replacements, heads);
    return fixCalques(dedupeLatin(propagated, latinToEt));
  };
  return { title: finish(title.text), body: finish(body.text) };
}

export const CYR: Readonly<Record<string, string>> = {
  "а": "a",
  "б": "b",
  "в": "v",
  "г": "g",
  "д": "d",
  "е": "e",
  "ё": "jo",
  "ж": "zh",
  "з": "z",
  "и": "i",
  "й": "j",
  "к": "k",
  "л": "l",
  "м": "m",
  "н": "n",
  "о": "o",
  "п": "p",
  "р": "r",
  "с": "s",
  "т": "t",
  "у": "u",
  "ф": "f",
  "х": "h",
  "ц": "ts",
  "ч": "ch",
  "ш": "sh",
  "щ": "sch",
  "ъ": "",
  "ы": "y",
  "ь": "",
  "э": "e",
  "ю": "ju",
  "я": "ja",
};

export function deCyrillic(s: string): string {
  if (!s) return s;
  return String(s).replace(/[\u0400-\u04FF]/g, function (ch: string) {
    const low = ch.toLowerCase();
    const r = CYR[low];
    if (r === undefined) return "";
    if (ch !== low && r) return r.charAt(0).toUpperCase() + r.slice(1);
    return r;
  });
}
