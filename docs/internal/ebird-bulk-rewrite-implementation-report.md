# eBird bulk rewrite — implementation report

**Date:** 2026-04-17
**Follow-up to:** `ebird-refresh-architecture-report.md`

---

## 1. Pre-flight findings

All pre-flight items verified present on current `main`. Line numbers drifted slightly from the architecture report — values below are from the grep pass before any edits.

| Item | Expected | Actual line |
|---|---|---|
| `refreshEbirdEEAll` (per-species loop) | ~L10349 | L10349 |
| `fetchEbirdEEForSpecies` | ~L10246 | L10246 |
| `window.__fetchEbirdEEForSpecies` export | ~L10301 | L10301 |
| `fetchEbirdRecent` (dead bulk helper) | ~L12399 | L12399 |
| `combinedProb` | ~L12455 | L12455 |
| `window.__ennEbirdCounts` declare | ~L12397 | L12397 |
| `ebirdEEPoints`, `saveEbirdEE` | ~L10153, L10155 | L10153, L10155 |
| `ebird_recent` Edge Function | supports both modes | confirmed (`speciesCode` optional at L62–L67) |

**Skaneeri loop shape (L12858–L12900):** matches the architecture report with one notable deviation — the lat/lon/t/src overwrite is **not** guarded by a "no Elurikkus coord" check. The existing code unconditionally wrote `ep.lat`, `ep.lon`, `ep.t`, `ep.src = 'eBird'` onto `window.points[name]` whenever `ebResult` had valid coords, overriding any prior Elurikkus values. See deviation #1 below.

**Edge Function secret name:** `Deno.env.get("EBIRD_API_TOKEN2")` at [supabase/functions/ebird_recent/index.ts:49](supabase/functions/ebird_recent/index.ts#L49). User must verify the secret is set under the exact name `EBIRD_API_TOKEN2` in the Supabase dashboard before testing. The architecture report flagged this mismatch and it stands as-is — not renamed per the out-of-scope constraint.

**Call sites of `refreshEbirdEEAll`:** three, as expected — L10206 (button toggle), L10533 (30-min setInterval), L10539 (cold-start setTimeout).

---

## 2. Files changed

### `supabase/functions/ebird_recent/index.ts`
- **L61:** `intInRange(…, 1000, 1, 1000)` → `intInRange(…, 1000, 1, 10000)`. Upper bound only; default stays at 1000.

### `public/maps/linnuliigid/index.html`

Line numbers below reflect **post-edit** positions.

- **L10303–L10308:** New `window.__getEbirdEEPoint(name)` accessor inside the eBird EE IIFE.
- **L10310–L10442:** New `async function refreshEbirdEEBulk()` inside the eBird EE IIFE (after `fetchEbirdEEForSpecies`/exports, before `_updateEbirdEEProgress`).
- **L10444:** `window.__refreshEbirdEEBulk = refreshEbirdEEBulk;` export.
- **L10206:** Button-toggle call site: `refreshEbirdEEAll()` → `refreshEbirdEEBulk()`.
- **L10492–L10495:** Three-line deprecation comment added above the `refreshEbirdEEAll` definition. Function body untouched.
- **L10679:** 30-min setInterval: `refreshEbirdEEAll()` → `refreshEbirdEEBulk()`.
- **L10685:** Cold-start setTimeout: `refreshEbirdEEAll` → `refreshEbirdEEBulk`.
- **L12538–L12543:** Removed `EBIRD_TOKEN`, `ebirdRecentCache`, `fetchEbirdRecent` (39 lines deleted). Left a one-line breadcrumb comment. Kept `EBIRD_CODES_FALLBACK` (still consumed by `getEbirdCode`). `window.__ennEbirdCounts = window.__ennEbirdCounts || {}` preserves the defensive init.
- **L12966–L13022:** Skaneeri "Phase 3" rewrite:
  - Single `await window.__refreshEbirdEEBulk()` with try/catch before the loop.
  - Per-species body reads counts from `window.__ennEbirdCounts` (populated by the bulk) via `getEbirdCode(name)`, and pulls lat/lon/t/src from `window.__getEbirdEEPoint(name)`.
  - `ep.occ7Ebird` / `ep.occ7EbirdUpdated` still written for every species (now from the bulk lookup, not a per-species fetch).
  - Prob-cache skip logic moved below the eBird-apply block so `occ7Ebird` is refreshed even for species whose prob computation is cached.
  - `await new Promise(setTimeout 150)` removed.
  - `window.__schedulePersistBadgeCache()` still fires per iteration.

---

## 3. Deviations from the prompt

### Deviation 1 — Kept unconditional lat/lon/t/src overwrite

The prompt's Part D described the old behavior as "wrote `ep.lat, ep.lon, ep.t, ep.src='eBird'` **only when the species had no Elurikkus coord**." Reading the actual pre-edit code at L12882–L12892, there is no such guard — the override fires whenever `ebResult` has finite coords, regardless of any prior Elurikkus value. I preserved **existing behavior** (unconditional overwrite when eBird has coords), rather than introducing a guard the prompt implied. Adding a `noEluCoord` check would silently change semantics the app has been running with, and the prompt's primary mandate ("do not redebate decisions") does not cover behavior changes that weren't on the decision list.

If the unconditional overwrite is itself a bug that should be fixed, flag it — it's a one-line change to add the guard.

### Deviation 2 — Apply eBird result even on prob-cache hit

The old loop `continue`'d past the eBird write when the prob-cache hit. That meant species with fresh cached prob data never had their `occ7Ebird` refreshed by Skaneeri. In the new loop, the eBird apply runs **before** the prob-cache-skip check, so every iteration updates `occ7Ebird` from the bulk data. This is a behavior improvement enabled by the bulk rewrite (no per-species HTTP cost to worry about), and it matches the spirit of the prompt ("occ7Ebird badges light up" in the behavioral trace). Flagging explicitly because it is a semantic change, not a pure mechanical port.

### Deviation 3 — Proxy-first ordering (per prompt)

Noted for completeness: `refreshEbirdEEBulk` calls the Supabase proxy first and falls back to direct `api.ebird.org`. This is inverse of `fetchEbirdEEForSpecies` (direct-first, proxy-fallback). The prompt explicitly requested this inversion for the bulk path. No substitution — following the prompt.

### Deviation 4 — `window.__refreshEbirdEEBulk` grep count

The prompt's final checklist said "grep `refreshEbirdEEBulk` — four matches expected … actually 5+ matches". Actual grep returns **9 hits** (definition, window export, three entry-point calls, Skaneeri block comment + if-typeof + await call, and one line in the `refreshEbirdEEAll` deprecation comment that names it as the replacement). All hits accounted for; nothing unexpected.

### Deviation 5 — No `ebird_recent` call for the direct fallback in bulk

The Edge-Function proxy does not clamp above 10000 (raised in Part A). However if the Supabase project hasn't been redeployed yet, the ceiling is still 1000 server-side and the bulk call will silently truncate. The direct fallback (`api.ebird.org`) asks for 10000 directly. This is the documented intended behavior — just flagging that until the Edge Function is redeployed, bulk refresh *via the proxy path* is capped at 1000 rows.

---

## 4. Edge Function deploy note

**⚠️ Part A requires a Supabase Edge Function redeploy.**

Until the user redeploys `supabase/functions/ebird_recent/index.ts` via Lovable AI:
- The proxy path will clamp `maxResults` to 1000 server-side.
- `refreshEbirdEEBulk` requests `maxResults=10000` — the proxy will silently truncate the response to 1000 rows.
- With 1000 rows, roughly the last ~2–3 days of Estonian observations will be covered. Rare species seen earlier in the 30-day window will be missing.
- The automatic fallback to `api.ebird.org` direct only fires on proxy *error*, not on truncated success — so a redeployed Edge Function is required to get the full 30-day payload via the proxy path.

**Verify before testing:** Supabase dashboard → Edge Functions → `ebird_recent` → Secrets → confirm `EBIRD_API_TOKEN2` exists (not `EBIRD_API_TOKEN`). The source file's `Deno.env.get("EBIRD_API_TOKEN2")` call was not changed — if the actual secret is named `EBIRD_API_TOKEN`, the proxy returns 500 and the direct fallback takes over (still works, just no proxy). This was already flagged in the architecture report and is out of scope for this PR.

---

## 5. Final verification checklist

### Static grep

| Check | Expected | Actual |
|---|---|---|
| `refreshEbirdEEAll` | 1 match (definition; no call sites) | 1 match (L10495) ✔ |
| `refreshEbirdEEBulk` | 5+ matches | 9 matches (def, export, 3 call sites, skaneeri use + comments, deprecation comment reference) ✔ |
| `fetchEbirdRecent` | 0 matches | 0 matches ✔ |
| `api.ebird.org` | 2 matches | 2 (L10253 per-species direct, L10322 bulk direct) ✔ |
| `ebird_recent` (proxy URL) | 2 matches | 2 (L10254 per-species proxy, L10321 bulk proxy) ✔ |
| `__fetchEbirdEEForSpecies` | 1 match (window export only) | 1 (L10301) ✔ |
| `ebirdRecentCache` | 0 | 0 ✔ |
| standalone `EBIRD_TOKEN` var | 0 | 0 ✔ |
| `window.points\s*=\s*\{\s*\}` (pre-init footgun) | 0 | 0 ✔ |

### Structural

- All new code is inside the correct IIFE — bulk function + accessor are in the eBird EE IIFE (L10148–L10700-ish); Skaneeri changes are in the Ennustus IIFE.
- No new `<script>` blocks introduced.
- `SPECIES_EBIRD_CODES` read as a direct var reference, not `window.SPECIES_EBIRD_CODES`.
- `loadSpeciesMeta` not touched.
- `_PRESERVE` list and `save()` field list not touched (per out-of-scope).

---

## 6. Anything unexpected

- None blocking. The code matched the architecture report closely enough that no scoping workarounds were required.
- Minor semantic deviation (#1 above) uncovered during the Skaneeri rewrite — old code was less careful about preserving Elurikkus coords than the architecture report suggested. Preserved existing behavior; flagged for the user's awareness.
- The `EBIRD_CODES_FALLBACK` `var` in the Ennustus IIFE stays — it's read by `getEbirdCode` as a secondary lookup path. Not eBird-fetch-related.

---

## 7. Rollback (unchanged from prompt)

1. **Fast:** revert the three call sites (L10206, L10679, L10685) back to `refreshEbirdEEAll`. The deprecated function body is still present at L10495.
2. **Skaneeri:** revert L12966–L13022 to the pre-edit per-species-loop form. `__fetchEbirdEEForSpecies` was untouched.
3. **Edge Function:** revert `maxResults` clamp at [supabase/functions/ebird_recent/index.ts:61](supabase/functions/ebird_recent/index.ts#L61) from 10000 back to 1000, redeploy.
4. **Full:** `git revert` the commit. Deprecated stub is safe to revive.
