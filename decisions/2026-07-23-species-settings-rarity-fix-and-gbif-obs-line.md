# Decision — Species settings (AvatarManager): rarity-reset fix + GBIF "Vaatlusi kokku" line

**Date:** 2026-07-23 · **Area:** frontend (React) · **File:** `src/features/settings/AvatarManager.tsx` (+ `mapScope.ts`, `index.html`, new `gbifOccurrenceCount.ts`) · **Status:** both approved & shipped

Two related changes to the per-species "Seaded" panel, shipped as two separate commits.

---

## A. Haruldus (rarity) reset — surgical hydration fix  ✅ shipped

### Bug
Changing **Haruldus** (or any field) often snapped back to the stored value before the user could save. Worst on the **USA maps**.

### Root cause
The hydration effect depended on `cloudItems`, `scopeMetadata`, `avatarsReady` besides `selected`/`scope`. `downloadSpeciesMetaJson()` returns a **new object reference each call**, so any background cloud refresh (mount `refreshSpeciesMetaFromCloud`, post-save refresh, `handleSyncNow`) updated `cloudItems` → the effect re-ran → re-hydrated every field and discarded the user's **unsaved** edit. USA scopes have no bundled `species-meta.json`, so they lean entirely on cloud refreshes and the reset was most visible there.

### Fix ("hydrate on select only")
`hydratedSelectionRef` guards hydration to once per `${scope.id}::${selected}` selection key; early-return on repeat runs; ref cleared in the empty-`selected` branch. Dep array + hydration body unchanged. **+5 lines** + `src/test/avatarManagerRarityHydration.test.tsx`. No cloud-sync/payload/`species_meta_v1.json` change.

### Accepted tradeoff
`is_migrant`/`notify` come from async `cloudItems` (loaded on mount before selection, so they hydrate correctly). If cloud metadata for those two arrives *after* selecting a never-loaded species, they populate on next re-select. Dirty-tracking was the rejected alternative.

---

## B. "Vaatlusi kokku" — read-only GBIF total-obs line  ✅ shipped

Live GBIF occurrence count under **Teaduslik nimi (ladina)**, region-filtered per scope. **Display-only:** not persisted, not in any save patch, no schema change (enforced by an exact-patch-key test). Source is **GBIF, not eBird** — eBird is CSP-blocked from React and blocks Deno IPs; GBIF is reachable directly and keys off the scientific name already in the form.

- `index.html`: `connect-src` += `https://api.gbif.org` (one host, nothing else).
- `mapScope.ts`: optional `gbifRegion?: { country?; gadmGid? }` per scope — **region-precise (final):** `usa_co → gadmGid=USA.6_1` · `usa_pa → USA.39_1` · `usa_i70 → country=US` · `linnuliigid`/`rariliin → country=EE`. (Flatten-to-`country=US` for USA maps was offered and not taken.)
- `src/lib/gbifOccurrenceCount.ts`: strict→non-strict taxon match, taxonKey cache (`estbirding.gbifTaxonKey.v1`), region-filtered `&limit=0` count, one 429 retry (1.5s backoff), 24h count cache (`estbirding.gbifObsCount.v1`), never throws → `null`. No import from `public/maps/**`.
- `AvatarManager.tsx`: 3 display-only states, race-safe effect keyed `[scope, selected, scientificName]` (rariliin excluded), line rendered above Haruldus. Rarity guard untouched.

Verified GBIF numbers (American Crow / `taxonKey=2482507`): global 29,073,659 · US 23,426,020 · CO 564,716 · PA 1,334,326.

---

## Verification (both changes, raw)
- After A: `vitest run` 98 pass / 1 fail; tsc clean on changed files.
- After B: `vitest run` 107 pass / 1 fail; tsc clean on changed files. The 1 fail is the pre-existing item below in both runs.

## Pre-existing issues to track separately (NOT caused by either change; confirmed against `main`)
1. **`src/test/speciesPredictionBackendSummary.test.ts` fails** — `expected +0 to be 3` (foreign-cluster canonicalization, backend prediction finalization). Fails in isolation; no import overlap with the settings UI.
2. **`@lovable.dev/mcp-js@^0.20.0` in `package.json` but not installed** → 4 × TS2307 in `src/lib/mcp/*` under `tsc`. Fix: `npm install` / verify lockfile in the build/typecheck env.

## Minor follow-up (non-blocking test hygiene)
`avatarManagerRarityHydration.test.tsx` doesn't mock `gbifOccurrenceCount`, so the real lib runs there against that test's generic `fetch` mock (returns `[]` → `null` → line shows "—", zero network). Suite stays green, but the rarity spec should mock the lib to stay isolated from future lib changes.

---

*Supersedes `2026-07-23-haruldus-reset-hydrate-on-select-only.md` (change A only), removed in the same commit that ships change B. Change A landed as `ddb38bb`.*
