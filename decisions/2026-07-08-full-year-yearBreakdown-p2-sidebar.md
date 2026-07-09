# Full-year breakdown P2 — yearBreakdown drives the sidebar (chart + hero + honesty)

**Status:** Done · 2026-07-08 (commit `390065b`) · combines P2 (chart) + P2.5 (hero/honesty)
**Scope:** `public/maps/linnuliigid/index.html` — `buildTop3PeriodsSection` + the `__probDataBySpecies` write in `computeProbForSpecies`. Client-only, admin-live. Builds on [[2026-07-08-full-year-yearBreakdown-p1]] (popup).

## Decision / fact
`topCell.yearBreakdown` is carried into `__probDataBySpecies` (the ~13221 write, mapped to `{label, pct, count, isCurrent}` with `pct = probability||0`). A shared **`_src = (probData.yearBreakdown && probData.yearBreakdown.length) ? probData.yearBreakdown : periods`** drives the **combo chart, the hero, and the honesty line** — so all three agree month-for-month with the popup for an admin-live species.

- **Zero-obs months → line at baseline:** the sidebar map uses `pct: p.probability || 0` (NOT the season list's `||1` floor), so empty months sit at 0 on the chart and route to `möödas`/`oli` in the hero, matching the popup's shrunk-empty rows.
- **curIdx never −1 in admin:** `yearBreakdown` always contains all 12 months incl. the current one (`isCurrent` set by `calculatePeriodProbabilities`), so `curIdx` resolves to the current month. Out-of-season species (current month scores 0) route cleanly through the `möödas` branch; the honesty tense (`oli`/`on`/`tuleb`) reads off the full-year peak.
- **Admin hero/honesty are month-labelled** (`juuli`), matching the monthly chart. **Non-admin falls back to season `periods`** → fortnight windows, unchanged (the cache path rebuilds `probData` from typed columns with no `yearBreakdown`, so `_src` is structurally `periods`).
- **Chart markers independent:** `_peakM`/`_nowM` are computed from `_buck`/calendar, not from `curIdx`/`peakIdx`, so the P2.5 hero-source swap could not disturb the chart.

**Untouched:** season window (`calculateSeasonFromData`), `buildEstoniaGrid(seasonal,…)`, map cells, headline %, thin-data guard, `calculatePeriodProbabilities` floor, popup, server.

## Why this note exists
Three surfaces (chart, hero, honesty) now read ONE `_src`; a future edit must keep them on the same source or they'll disagree again. The `||0` vs the season list's `||1` is deliberate (baseline vs floor). The non-admin fallback is structural (absence of `yearBreakdown`), not an explicit admin gate — do not "add" a gate.

## Next (home stretch, deferred)
1. Server `compute-ennustus` full-year for the non-admin/cache path (so non-admin also gets year-round, not the degraded single-period).
2. Season-window Jan-1 parity — client keeps GBIF Jan-1 (inflating the window); once fixed, the season surfaces that still read `periods` realign. See [[2026-07-05-gbif-partial-date-coercion]].
3. Parked: merged-panel coverage bar + row swatches (Item 2).
