# Decision — USA maps: filtering-info pills + combined "USA reis kokku" trip total

**Date:** 2026-07-23 · **Area:** frontend iframe HTML (vanilla JS) · **Artifact:** Claude Code prompt `usa-map-filtering-pills.md` · **Status:** 🟢 committed (this commit) — static + behavioral verified; runtime acceptance pending (paste-back); committed early by owner decision to pre-empt the Lovable working-tree sweep

## Goal
Mirror the Linnuliigid EE sidebar badges onto the 3 USA maps, plus a new cross-map total so Kristian sees his distinct USA-trip species tally.

## Files
`public/maps/usa-co/index.html` (COL), `public/maps/usa-pa/index.html` (PEN), `public/maps/usa-i70/index.html` (IS-70). POI variants and other maps untouched. Landed as 88 insertions / 1 deletion per file.

## Design (owner-approved via buttons)
- **Per-map pills = both**, mirroring EE: `7p liigid: N` (occ7>0 or obs date within 7d, on this map) and `Peidetud: N` (`visible===false` on this map).
- **Combined pill `USA reis kokku: N liiki`** = **distinct union of HIDDEN species across all 3 USA maps** (hidden = "filtered out" = seen/checked-off in Kristian's workflow). Deduped by normalized (mojibake-fixed + NFC + lowercased) name; a species hidden on two maps counts once. Identical value on every USA map.

## Key implementation facts (diagnosed against repo `main`)
- Pills live in the **sidebar header** (next to `Liigid: N`), NOT the topbar — `body.embedded #topbar{display:none}` hides the topbar when the map is embedded as an iframe in the app.
- The 3 USA maps are one europe-map-derived template; per-scope localStorage keys `bm_usa_{co,pa,i70}_points`. Same-origin ⇒ one map can read the other two stores → cross-map total needs no data-layer change.
- New JS is its own end-of-body `<script>` reading **only localStorage + DOM**; static HTML pills in the markup (no DOM injection). Re-render hook is a **MutationObserver on `#list`**, not a `window.render` patch (`render`/`updateMarker` are top-level `function` decls). Plus `storage` listener (other tab/map, incl. clear) and 30 s interval fallback.
- Only per-file difference: `USA_SELF_KEY` constant (co/pa/i70). Everything else byte-identical.

## Session reconciliation note (concurrent write)
A second, differing implementation appeared in the tree mid-session (CRLF, same `USA filtering-info pills` marker) — either a parallel session applying the prompt or the known Lovable auto-commit sweep. Resolution: kept the owner-approved artifact block, surgically removed the duplicate, re-verified independently. Final tree matches this note.

## Verification (pre-delivery + on landed code)
- `node --check` on injected IIFE + runtime oracle: OK (both passes).
- All 3 `str_replace` anchors unique (count=1) in all 3 files; `USA_SELF_KEY` correct per file; blocks md5-identical modulo the key; valid UTF-8; single `</body>`.
- Behavioral test: self-active=3 (incl. recent-`t` fallback), self-hidden=2, trip-distinct-hidden=4 with case-insensitive + mojibake cross-map dedup — all PASS.

## Estonian
`7p liigid`, `Peidetud`, `USA reis kokku`, `liiki` — spell-checked via estonian-mcp (Vabamorf). `USA` flags only as an unknown acronym; standard usage. `liiki` = partitive after a cardinal — correct.

## Commit-timing rationale
Committed **before** runtime acceptance, by owner decision: the change is display-only/reversible and code-verified; a clean `feat(usa-maps): …` commit can be amended or reverted, whereas a Lovable auto-commit sweep (see `2026-07-13-lovable-auto-commit-sweeps-working-tree.md`, and the duplicated generic messages at prior HEAD) cannot be given a meaningful message after the fact. Fix-forward if a cosmetic issue surfaces at runtime.

## Open / follow-up
- **Runtime acceptance required** (paste-back): three pills render next to `Liigid:`; toggling a species updates `Peidetud` + `USA reis kokku`; trip total identical on all 3 maps.
- Optional hardening (flagged, not built): factor `countDistinctHidden(stores)` into `src/lib/usaTripHidden.ts` + Vitest; map inlines the same fn — separate tested commit.
