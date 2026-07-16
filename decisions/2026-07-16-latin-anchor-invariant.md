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

**Related.** [[2026-07-13-n8n-silently-drops-credentials-and-settings-on-import]] — the
sibling gotcha in the same import-and-verify workflow.
