# Corrector: inflection-preserving, de-duplicating (news bird-names)

**Date:** 2026-07-17

**Invariant.** The news bird-name corrector preserves Sonnet's *inflected* Estonian name
and shows each Latin binomial once. The SYSTEM-prompt (rule `1b`) anchors the Latin binomial
on **every** mention and asks for one consistent name per species; `fixBirdNames` then runs
three passes:

1. **Pattern-1** (`name (Genus species)`) — keep Sonnet's inflected name when it is the
   *same* species (`sameSpecies` guard — part-wise since P86d, see Update below; the original
   ≥4-shared-chars / ≥50% rule is retired); substitute the dictionary **nominative** only for
   a *different* species.
2. **Pattern-2** (bare `Genus species`) — insert the dictionary name + `(Latin)`.
3. **Dict-gated de-dupe** — strip a repeat `(Latin)` only when the binomial is in
   `Linnud.txt` (`latinToEt`), so Latin appears **once** and place-name parentheticals
   (e.g. `(Mazovia vojevoodkond)`) survive.

The Latin binomial stays nominative and is the anchor throughout.

**Verified (v13, live).** Five Poland hõbehaugas pieces: `has_harkpistrik=false` everywhere;
body reads `hõbehaugas (Elanus caeruleus)` once, then "selle liigi" / "seda röövlindu" for
repeats; place parentheticals kept; inflection holds; **0 corrector errors**. v13 supersedes
the v12 "first-mention-only" detour — it returns to every-mention anchoring and lets the
corrector de-dupe.

**Update (2026-10-01, P86d).** The corrector now lives in the pure module
`supabase/functions/_shared/bird-names.ts` (used by `news-translate-v2`, vitest-tested in
`src/features/news/__tests__/bird-names.test.ts`).

- **`sameSpecies` is part-wise.** Names are normalised (NFC, lowercase, hyphens stripped,
  diacritics kept). Same iff equal, or one is the other + ≤6 letters (inflection suffix), or
  — split on hyphen/space — same part count, all leading parts equal, and the last parts are
  suffix-forms (≤6) or differ in length by ≤4 with a common prefix ≥ max(4, min(len)−2).
  Why: the old "≥4 shared chars and ≥50%" rule merged different species (`stepiviu` kept
  instead of `stepi-loorkull` / `stepipistrik`); conflating dict pairs fell from 46,485 to 135.
- **Multi-word dict names** (e.g. `vahemere pistrik`): if the draft's last word is
  `sameSpecies` with the dict's last word, keep the draft's inflected last word and replace
  only the leading words ("Eleonora pistrikuga (Falco eleonorae)" → "vahemere pistrikuga
  (…)"); otherwise replace the whole span with the dict nominative. Leftward absorption takes
  dict words freely, but a capitalised foreign word only while a dict lead word is still
  missing (not at sentence start) or when it is a ≥4-letter prefix of the Latin genus/epithet
  (Eleonora ~ eleonorae, also at sentence start). Place names before a complete name survive
  ("Poola vahemere pistrik" unchanged). A colon is not a sentence boundary.
- **Order per item:** correct body → correct title → propagate the shared X→Y set into both
  (see [[2026-07-16-latin-anchor-invariant]]) → de-dupe Latin per field → `fixCalques`.

**Known limits.** The two earlier limits (long-stem conflation; titles without Latin) are
addressed by the part-wise rule and in-item propagation. Remaining, accepted: 135 residual
conflating dict pairs; a different-species replacement inserts the base form, losing
inflection; the anchored pass does not re-capitalise at sentence start (P86e Sonnet glossary
pass fixes grammar/case). Not fixed: body correct but title wrong with no X→Y to propagate;
items with no Latin anchor anywhere. Species accuracy (right bird, right Latin) remains
**Phase B** (source glossary).

**Repo.** Live workflow `estbirding-news-ingest-translate-v13` (id `5KvMxoDgMlc2nJcL`);
committed export `n8n/estbirding-news-ingest-translate-v13.json`. Edits are applied over the
connector, never by importing the JSON.

Note (M7.7, 2026-09-03): the n8n export was removed from the repo; see git history before c843a37 or estbirding-memory/notes/m7-6-n8n-nodes.

**Related.** [[2026-07-16-latin-anchor-invariant]] — *why* the corrector needs a Latin anchor
(no anchor → silent no-op); this note is the *how* once the anchor is present.
[[2026-07-13-n8n-silently-drops-credentials-and-settings-on-import]] — why edits go over the
connector, not via JSON import.
