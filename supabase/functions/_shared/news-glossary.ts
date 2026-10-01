// news-glossary.ts -- P86e glossary/consistency pass helpers for
// news-translate-v2. Pure module: no Deno globals, no I/O, so it is shared by
// the Edge Function and the vitest suite under src/features/news/__tests__/.
//
// The glossary pass sends the corrected translation back to Sonnet together
// with the source text and an EOU glossary (Latin binomial = Estonian name).
// acceptGlossaryOutput is the deterministic gate on what comes back: a rewrite
// that changes the length too much or drops a glossary binomial is rejected
// and the corrected first-pass translation is kept instead.

import type { GlossaryEntry, ItemText } from "./bird-names.ts";

export const GLOSSARY_MIN_RATIO = 0.7;
export const GLOSSARY_MAX_RATIO = 1.5;

export type GlossaryVerdict =
  | { readonly ok: true; readonly item: ItemText }
  | { readonly ok: false; readonly reason: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive; any run of whitespace between the parts matches.
function latinPattern(latin: string): RegExp {
  const parts = latin.trim().split(/\s+/).map(escapeRegExp);
  return new RegExp(parts.join("\\s+"), "i");
}

function joined(item: ItemText): string {
  return String(item.title || "") + "\n" + String(item.body || "");
}

export function acceptGlossaryOutput(
  before: ItemText,
  after: ItemText,
  glossary: readonly GlossaryEntry[],
): GlossaryVerdict {
  const afterTitle = String(after.title || "").trim();
  const afterBody = String(after.body || "").trim();
  if (!afterTitle) return { ok: false, reason: "empty_title" };

  const beforeBodyLen = String(before.body || "").trim().length;
  if (beforeBodyLen > 0) {
    const ratio = afterBody.length / beforeBodyLen;
    if (ratio < GLOSSARY_MIN_RATIO) return { ok: false, reason: "body_too_short" };
    if (ratio > GLOSSARY_MAX_RATIO) return { ok: false, reason: "body_too_long" };
  }

  const beforeText = joined(before);
  const afterText = joined(after);
  for (let i = 0; i < glossary.length; i++) {
    const re = latinPattern(glossary[i].latin);
    if (re.test(beforeText) && !re.test(afterText)) {
      return { ok: false, reason: "latin_missing:" + glossary[i].latin };
    }
  }
  return { ok: true, item: { title: afterTitle, body: afterBody } };
}

export function buildGlossaryUserMsg(
  source: ItemText,
  corrected: ItemText,
  glossary: readonly GlossaryEntry[],
): string {
  const lines = glossary.map(function (g) {
    return "- " + g.latin + " = " + g.et;
  }).join("\n");
  return "Toimeta jargnev tolge. Vasta TAPSELT vormis ###TITLE### ja ###BODY###, ilma muu tekstita.\n\nLIIGISONASTIK:\n" +
    lines +
    "\n\nALGNE PEALKIRI:\n" + String(source.title || "") +
    "\n\nALGNE SISU:\n" + String(source.body || "") +
    "\n\nTOLKE PEALKIRI:\n" + String(corrected.title || "") +
    "\n\nTOLKE SISU:\n" + String(corrected.body || "");
}
