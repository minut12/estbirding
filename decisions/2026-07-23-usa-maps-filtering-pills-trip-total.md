# Decision — USA maps: filtering-info pills + combined "USA reis kokku" trip total

**Date:** 2026-07-23 · **Area:** frontend iframe HTML (vanilla JS) · **Artifact:** Claude Code prompt `usa-map-filtering-pills.md` · **Status:** ✅ committed (`18e4ec4`, author "Kristian") + runtime-verified (Phase 3 PASS ×3) · merge onto origin/main verified clean · **pending: owner pull --rebase + push**

## Goal
Mirror the Linnuliigid EE sidebar badges onto the 3 USA maps, plus a new cross-map total so Kristian sees his distinct USA-trip species tally.

## Files
`public/maps/usa-co/index.html` (COL), `public/maps/usa-pa/index.html` (PEN), `public/maps/usa-i70/index.html` (IS-70). POI variants and other maps untouched. 3 hunks/file (CSS ~L116, sidebar span ~L356, end-of-body script ~L3862).

## Design (owner-approved via buttons)
- **Per-map pills = both**, mirroring EE: `7p liigid: N` (occ7>0 or obs date within 7d, this map) and `Peidetud: N` (`visible===false`, this map).
- **Combined pill `USA reis kokku: N liiki`** = **distinct union of HIDDEN species across all 3 USA maps** (hidden = "filtered out" = seen/checked-off). Deduped by normalized (mojibake-fix + NFC + lowercase) name; a species hidden on two maps counts once. Identical on every USA map.

## Implementation (diagnosed against repo)
- Pills in the **sidebar header** (next to `Liigid: N`), NOT the topbar (`body.embedded #topbar{display:none}`). Static HTML pills; end-of-body `<script>` reads **only localStorage + DOM**. Re-render hook = **MutationObserver on `#list`** (not a `window.render` patch — `render`/`updateMarker` are top-level fn decls). Plus `storage` listener (incl. clear) + 30 s interval. Same-origin `bm_usa_{co,pa,i70}_points` ⇒ cross-map total needs no data-layer change. Only per-file diff: `USA_SELF_KEY`.

## Verification
- Pre-delivery: `node --check` (IIFE + oracle) OK; anchors unique ×3; behavioral test self-active=3 / self-hidden=2 / trip-distinct=4 with case+mojibake cross-map dedup — PASS.
- **Runtime (Claude Code, Playwright, seeded localStorage, `embedded` class): PASS on all 3 maps.** Oracle: per-map hidden {2,2,2} → sum 6 → distinct 4; pill=4 on every map; 7p liigid = 2/1/0; dedup proven twice (case+whitespace `"  PUNAKARDINAL "`↔`"Punakardinal"`, cross-map `"Ameerika ronk"`); observer path (hide→3/5, revert→2/4); 0 console errors; topbar-hidden path exercised; screenshots captured (not in repo tree).
- Caveat: synthetic data on directly-served iframes. In-app check on real localStorage/login is Kristian's to run (oracle snippet works as-is in DevTools).

## Merge-safety (verified read-only)
Clean rebase **proven**, not inferred: `git merge-tree --write-tree --merge-base=92af0b7 origin/main 18e4ec4` → clean tree, exit 0 (no conflicts). `usa-co`/`usa-pa` unchanged on origin/main vs base; `usa-i70` only remote change = 1 hunk `@@ -1746,2 +1746,44` (I-70 route overlay, net +42) in the map-controls region. Our hunks at L116/356/3862 — disjoint. `speciesCount` anchor survives verbatim+unique on origin/main; pills not yet upstream. `git pull --rebase origin main` then push → no conflicts.

## Process incidents (for the record)
1. **Two concurrent Claude Code sessions** on the same tree caused a mid-session DOM-injection duplicate (surfaced + resolved: kept spec block, dropped foreign) and then an external commit `18e4ec4` authored "Kristian" that pre-empted the "wait for go" gate. Committed content = exactly the verified hunks (foreign block absent, byte-verified) ⇒ nothing to revert. **Lesson: one Claude Code driver per repo at a time.**
2. Branch divergence (local 1 ahead / 4 behind) — resolved by the clean-rebase verdict above.

## Estonian
`7p liigid`, `Peidetud`, `USA reis kokku`, `liiki` — spell-checked (Vabamorf). `liiki` = partitive after a cardinal. Correct.

## Open / follow-up
- Owner: `git pull --rebase origin main` → push. After pull, one in-app oracle run on `usa-i70` to confirm the overlay didn't perturb behavior (different region — expected clean).
- Optional hardening (flagged, not built): factor `countDistinctHidden(stores)` → `src/lib/usaTripHidden.ts` + Vitest; map inlines the same fn — separate tested commit. Ship on "go".
