# Decision — Haruldus (rarity) reset on species settings: surgical hydration fix

**Date:** 2026-07-23 · **Area:** frontend (React) · **File:** `src/features/settings/AvatarManager.tsx` · **Status:** approved, awaiting commit

## Bug
On the per-species "Seaded" panel (AvatarManager), changing **Haruldus** (or any field) often snapped back to the stored value before the user could save. Worst on the **USA maps**.

## Root cause
The effect that hydrates the form from stored meta depended on `cloudItems`, `scopeMetadata`, `avatarsReady` in addition to `selected`/`scope`. `downloadSpeciesMetaJson()` returns a **new object reference each call**, so any background cloud refresh (mount `refreshSpeciesMetaFromCloud`, post-save refresh, `handleSyncNow`) updated `cloudItems` → the effect re-ran → it re-hydrated every field and discarded the user's **unsaved** edit. USA scopes have no bundled `species-meta.json` (`// these maps start empty`), so they lean entirely on cloud refreshes and the reset was most visible there.

## Fix (surgical — "hydrate on select only")
Added `hydratedSelectionRef` (next to `fileRef`); the effect hydrates once per `${scope.id}::${selected}` selection key and early-returns on repeat runs; ref cleared in the empty-`selected` branch. **Dependency array and hydration body unchanged**, so freshly-loaded data is still read on the first run after a selection. Net **+5 lines** + new test `src/test/avatarManagerRarityHydration.test.tsx`. **No changes** to cloud sync, payload shape, or the `species_meta_v1.json` contract.

## Accepted tradeoff (deliberately out of scope)
`is_migrant`/`notify` come from async `cloudItems`. `cloudItems` is loaded on mount before a species is selected, so they hydrate correctly. If cloud metadata for those two ever arrives *after* selecting a never-before-loaded species, they populate on the next re-select. Dirty-tracking was the rejected alternative; not pursued.

## Verification (raw)
- `npm run test` (`vitest run`): 98 passed / 1 failed. Both new tests green (bug repro + different-species re-select sanity). Failing test is pre-existing/unrelated (see below).
- `npx tsc --noEmit -p tsconfig.app.json`: only the 4 pre-existing `@lovable.dev/mcp-js` TS2307s; **zero** errors in changed/new files.

## Pre-existing issues to track separately (NOT caused by this change; confirmed against `main`)
1. **`src/test/speciesPredictionBackendSummary.test.ts` fails** — `expected +0 to be 3` (foreign-cluster canonicalization, backend prediction finalization). Fails identically in isolation; no import overlap with the settings UI.
2. **`@lovable.dev/mcp-js@^0.20.0` in `package.json` but not installed** → 4 × TS2307 in `src/lib/mcp/*` under `tsc`. Fix: `npm install` / verify lockfile in the build/typecheck env.

## Related in-flight (separate concern)
Total-obs "Vaatlusi kokku" GBIF line on the same panel — **prompt #2 pending mockup/region sign-off.** Read-only, live GBIF, no schema change. Region mapping (verified GBIF counts for American Crow / `taxonKey=2482507`):
`usa_co → gadmGid=USA.6_1` (CO 564,716) · `usa_pa → USA.39_1` (PA 1,334,326) · `usa_i70 → country=US` (23,426,020) · `linnuliigid`/`rariliin → country=EE`. Global = 29,073,659.
