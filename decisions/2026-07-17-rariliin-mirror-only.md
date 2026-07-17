# 2026-07-17 — Rariliin is a mirror-only rare-species view

Status: Accepted — shipped to `main` 2026-07-17. Live parity check pending Publish.
Commits: 2571f1e (P1) · c5ccbb6 (P2) · 4ef5917 (P3)

## Context
Rariliin (`public/maps/rariliin/index.html`) is the rarity-only map and the only map
`user_level_1` sees. It previously ran its own independent eElurikkus pipeline (per-species
HTML scrape via `refreshAllElurikkusOnce`, a manual "Refresh from Elurikkus" button, and a
30-min auto-interval) *on top of* already pulling the `linnuliigid-snapshot`. That duplicated
the automatic processes feeding Linnuliigid EE and required manual refreshes. Goal: show only
rare species (less noise), sourced from the same automatic processes as Linnuliigid, filtered
to the rare-species whitelist.

## Decision
Rariliin is a pure mirror of Linnuliigid's automatic data, filtered to the rare `SPECIES`
whitelist (166 curated species).

- **P1 (2571f1e)** — disabled the independent eElurikkus scan. `refreshAllElurikkusOnce()`
  early-returns; `_initElurikkusAuto30m()` early-returns (no 30-min interval); the manual
  button is hidden. Rariliin's eElurikkus/GBIF data now comes solely from `loadSnapshot()` →
  `linnuliigid-snapshot` EF → `_applySnapshot` → `prunePointsToWhitelist()`. Scan code kept
  as dead code (disable-in-place, not deletion).
- **P2 (c5ccbb6)** — slimmed the Rariliin-scope species settings (AvatarManager) to the two
  Rariliin-only fields: **3+3 kood** (editable) and **Teate märkus** (dropdown: Väljas /
  Kõik teated / Ainult haruldused), plus the notify checkbox. Shared editors (avatar, eBird
  speciesCode, rarity, scientific name, arrival) are dropped from this scope — they're managed
  under Linnuliigid. Scope-gated to `rariliin`; all other scopes render unchanged. 3+3/note
  persist to the Rariliin-scope cloud file `meta/species_meta_rariliin_v1.json` and render in
  the Rariliin sidebar only.
- **P3 (4ef5917)** — added a separate eBird EE marker layer (`ebirdEEPoints` / `ebirdEEMarkers`,
  additive, never merged into `points`). One direct `api.ebird.org/v2/data/obs/EE/recent` call
  (iframe CSP allows it), mapped by `RARILIIN_EBIRD_CODES` (the 104 whitelist species that have
  eBird codes — the map *is* the filter), rendered with a distinguishing "eB" badge. Auto-hydrate
  on load + 30-min refresh, mirroring Linnuliigid. Recovers eBird-sourced rares the server
  snapshot does not contain.

## Invariants (not inferable from either file alone)
1. **Mirror-only / no scan.** The independent eElurikkus scan and the `linnuliigid-snapshot`
   mirror are mutually exclusive sources for the same eElurikkus points. Do NOT re-enable the
   scan (removing the guards in `refreshAllElurikkusOnce` / `_initElurikkusAuto30m`, or un-hiding
   the button) without first removing the snapshot mirror — otherwise Rariliin double-sources the
   same observations.
2. **eBird layer stays additive.** The P3 layer writes only to `ebirdEEPoints`, never to `points`.
   Merging it into `points` would corrupt the snapshot/whitelist path and the coords-source guard.
3. **Rare set = `SPECIES` whitelist**, not `rarityLevel`. eBird coverage = the 104 whitelist
   species with codes; the other 62 (extreme vagrants) are snapshot-only.
4. **3+3 kood / Teate märkus are Rariliin-scoped.** Stored in `species_meta_rariliin_v1.json`,
   shown only in the Rariliin sidebar + settings. Never surface them in Linnuliigid.

## Consequences
- Rariliin freshness follows the `linnuliigid-snapshot` cadence + the eBird 30-min refresh; no
  manual step.
- The eBird token is duplicated across `rariliin/index.html` and `linnuliigid/index.html` —
  rotation touches both files.
- eBird is a direct browser call with no proxy; a production CORS block makes the layer silently
  render nothing (console: `[rariliin eBird EE] fetch failed` instead of `written N species`).
- A species present in both the snapshot and eBird renders two markers; the eB badge distinguishes
  them. Expected, mirrors Linnuliigid.

## Open items
- Parity: confirm Rariliin's rare set == Linnuliigid's rare markers post-Publish; any missing
  species → check `RARILIIN_EBIRD_CODES` coverage, not the layer.
- Optional: drop the eBird 30-min `setInterval` if load-only fetch is preferred.
