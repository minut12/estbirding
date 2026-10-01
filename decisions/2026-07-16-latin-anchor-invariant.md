# Latin-anchor invariant (news bird-name corrector)

**Date:** 2026-07-16

**Invariant.** The news bird-name corrector is **Latin-keyed**: it only rewrites an
Estonian species name when a `(Genus species)` binomial sits directly beside it. A
species mention with no Latin anchor **silently no-ops** — no error, no correction, the
mis-named or source-language name just passes through.

**Root cause (evidence).** The dictionary is healthy, so the misses are not a coverage
gap. `Linnud.txt` parses to **15,289** Latin→Estonian entries; the Storage copy the n8n
corrector loads is structurally byte-equal to the repo copy (same header
`…nimi_lk⇥nimi_ek⇥nimi_ik`, same 11,777 lines); and known keys resolve
(`apus apus → piiritaja`, `elanus caeruleus → hõbehaugas`). Therefore the observed
failures — `pigirästa` left uncorrected, bare `kattohaikara` — are **anchor loss**, not
dictionary misses, and they concentrate in **Finnish-only sources that carry no Latin
binomial** for the corrector to bind to.

**Mitigation.** v10 SYSTEM-prompt rule `1b` forces Sonnet to emit `(Genus species)` on
every species mention, giving the corrector a key to bind on. *Verification pending* (the
swift + Finnish-stork rows re-enter the pending queue each run).

**Follow-up.** Phase-B FI source-map handles the residue where Sonnet mis-IDs a Finnish
common name and attaches a *wrong* Latin — a distinct failure mode from anchor loss (the
anchor is present but points at the wrong species).

**Update (2026-10-01, P86d) — in-item propagation.** The invariant is relaxed *within one
news item*: the X→Y rewrites made on anchored mentions (body first, then title, one shared
set per item) are also applied to the item's unanchored mentions in title and body, matched
by stem. Why: titles rarely carry Latin, so the title kept "Rifftiiru" while the corrected
body said "tutt-tiir". Guards keep it conservative — a token followed by its own
`(Latin)` is never rewritten; a group is skipped when a correctly-anchored same-stem mention
survives, when one X maps to two different Y, when X is a shared head word of multi-word
dict names (`pistrik`, `tiir`, `part`, `kotkas`…), when X is shorter than 4 letters, or
when Y already starts with X's stem.
**Still a no-op:** an item with no Latin anchor anywhere produces no X→Y set, so nothing is
corrected. Code: `supabase/functions/_shared/bird-names.ts` (`propagateReplacements`).

**Related.** [[2026-07-13-n8n-silently-drops-credentials-and-settings-on-import]] — the
sibling gotcha in the same import-and-verify workflow.
