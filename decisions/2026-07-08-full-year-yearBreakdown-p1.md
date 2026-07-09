# Full-year breakdown P1 — yearBreakdown (popup, admin-live)

**Status:** Done · 2026-07-08 (commit `3f3c56c`)
**Scope:** `public/maps/linnuliigid/index.html` — the popup period-list only (`buildTemporalBreakdown`). Client-only, admin-live path. No server, no `compute-ennustus`, no cache.

## Decision / fact
`buildYearBreakdownForCell` scores **12 monthly all-occurrence buckets** for the clicked cell — un-gated by the season window — and `buildTemporalBreakdown` prefers `cell.yearBreakdown` over the season-bounded `cell.periods` when present. So a year-round species (Hiireviu) shows real Jun–Dec values instead of season-padded zeros.

- **Un-gated input:** buckets ALL `data.occurrences` filtered to the cell's bounds (`latMin/latMax/lonMin/lonMax`), by `date.getMonth()` — NOT the `seasonal` subset that feeds the grid/map. This is the whole point: the season filter (`buildEstoniaGrid(seasonal,…)`) drops out-of-season obs before they can be counted; the breakdown re-reads the full set.
- **Jan-1 drop:** GBIF coerces partial dates to Jan-1 placeholders; `isJan1` (ported from `compute-ennustus:50`) drops **GBIF** Jan-1 records only, so January isn't inflated. Real (non-GBIF) Jan-1 records are kept. See [[2026-07-05-gbif-partial-date-coercion]].
- **Scoring:** reuses `calculatePeriodProbabilities` on a temp cell `{periods, scoreRecency, markerInCell}` for parity with the season list (within-cell log-normalized; current-period freshness via the parent cell's scoreRecency/markerInCell). `eluPoint`/`cellSize` are unused by the scorer today.
- **`count === 0 → probability = 0`** in the breakdown (overriding the scorer's `Math.max(1,…)` floor) so zero-obs months reuse the shrunk-empty row style AND match the non-admin cache path. The override lives ONLY in `buildYearBreakdownForCell`, so the season/map floor in `calculatePeriodProbabilities` is untouched.
- **Structural gate:** `yearBreakdown` is attached to `scored` cells only inside `computeProbForSpecies` (admin-live, `window.__bmAdmin.isOn()` at ~13251). Non-admin/cache cells (`_probRenderFromCache`) never get it → `buildTemporalBreakdown` falls back to `cell.periods`. No explicit admin check in the render — the gate is that the field only exists on the live path.

**Untouched (additive):** season window (`calculateSeasonFromData`), map cells, headline % (`X% sel hooajal`), hero, trend chip, sidebar combo chart (`__probDataBySpecies` still reads `topCell.periods`), and the server.

## Why this note exists
The season filter is a *double* gate (grid input + period range) — widening periods alone wouldn't surface out-of-season obs; the breakdown must re-read `data.occurrences`. The `count===0→0` override is deliberate and localized (breakdown only, not the scorer) precisely so admin and non-admin render identically for the same bird.

## Evidence / follow-on
Panel A proved **150 of Hiireviu's 158 January records are Jan-1 placeholders**: the breakdown drops them (Jan = 8 real → 48%), but the **season window still keeps them** (the client-side Jan-1 clamp, untouched). So the breakdown is already the *more accurate* view — which is why the deferred **season-window Jan-1 parity fix** is substantive, not cosmetic.

## Next (home stretch, all deferred)
1. Sidebar combo chart onto `yearBreakdown` (admin-live, same gate) so both admin surfaces agree — mirrors this onto [[2026-07-08-sidebar-chart-v2-combo]].
2. Server (`compute-ennustus`) full-year for the non-admin/cache path.
3. Season-window Jan-1 parity (client keeps Jan-1, server drops them → windows diverge).
4. Parked: merged-panel coverage bar + row swatches (Item 2).
