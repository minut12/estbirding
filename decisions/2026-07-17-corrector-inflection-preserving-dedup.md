# Corrector: inflection-preserving, de-duplicating (news bird-names)

**Date:** 2026-07-17

**Invariant.** The news bird-name corrector preserves Sonnet's *inflected* Estonian name
and shows each Latin binomial once. The SYSTEM-prompt (rule `1b`) anchors the Latin binomial
on **every** mention and asks for one consistent name per species; `fixBirdNames` then runs
three passes:

1. **Pattern-1** (`name (Genus species)`) — keep Sonnet's inflected name when it is the
   *same* species (`sameSpecies` leading-stem guard: **≥4 shared leading chars AND ≥50% of
   the shorter length**); substitute the dictionary **nominative** only for a *different*
   species.
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

**Known limits.** The stem heuristic can conflate two species sharing a long leading stem
(rare). Titles whose species name lost its Latin anchor are not corrected — Sonnet drops the
Latin in short headlines (e.g. "kaks halli loovikut" / "kirjukärbsenäpp" in a title while the
body is correct); a future "force the Latin in the title too" tweak. Species accuracy (right
bird, right Latin) remains **Phase B** (source glossary).

**Repo.** Live workflow `estbirding-news-ingest-translate-v13` (id `5KvMxoDgMlc2nJcL`);
committed export `n8n/estbirding-news-ingest-translate-v13.json`. Edits are applied over the
connector, never by importing the JSON.

**Related.** [[2026-07-16-latin-anchor-invariant]] — *why* the corrector needs a Latin anchor
(no anchor → silent no-op); this note is the *how* once the anchor is present.
[[2026-07-13-n8n-silently-drops-credentials-and-settings-on-import]] — why edits go over the
connector, not via JSON import.
