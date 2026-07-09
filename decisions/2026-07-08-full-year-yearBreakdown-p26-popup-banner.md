# Full-year breakdown P2.6 — popup banner + trend chip onto yearBreakdown

**Status:** Done · 2026-07-08 (commit `5d77553`)
**Scope:** `public/maps/linnuliigid/index.html` — `buildProbPopup`'s `_bestBanner` + `_trendChip` (the `_ci`/`_mi`/`_mProb` + mean-aggregate block). Client-only, admin-live. Completes the popup/sidebar alignment begun in [[2026-07-08-full-year-yearBreakdown-p1]] / [[2026-07-08-full-year-yearBreakdown-p2-sidebar]].

## Decision / fact
The popup `_bestBanner` (`Parim aeg oli/on/tuleb`) and `_trendChip` now source the shared **`_src = (cell.yearBreakdown && cell.yearBreakdown.length) ? cell.yearBreakdown : cell.periods`** — the same source the popup **list** already uses (P1). So banner + chip stop contradicting the list (previously the list's ⭐ was `oktoober 58%` from yearBreakdown while the banner said `Parim aeg oli 29. aprill 43%` from season, right above it).

- **Admin banner is month-labelled** (`Parim aeg tuleb · oktoober · 58%`), via `_etDateLabel(_peak.label)` where `_peak.label` is an Estonian month name (renders cleanly, no mangling).
- **`_ci`/`_mi`/`_mProb` and the mean-aggregate** (`_sumE/_meanE/_meanL/_dTrend`) all read `_src`; the trend-chip branch logic (`langeb`/`tõuseb`/`stabiilne`/`väljaspool hooaega`, see [[2026-07-08-trend-chip-mean-aggregate-metric]]) is unchanged — only its input source swapped.
- **Non-admin** (no `yearBreakdown`) → `_src` is `cell.periods` → fortnight-labelled banner, unchanged (structural fallback).
- **Untouched:** the headline `X% praegusel perioodil (…)` stays on its current-fortnight/season value; the trend-chip HTML branches; the map; the season window; the list renderer.

## Why this note exists
This completes the mismatch fix: **popup and sidebar are now both fully on `yearBreakdown` for admin** (list + banner + chip on the popup; chart + hero + honesty on the sidebar). The headline is deliberately left season-based (it answers "how likely right now in the current period", not "when is the year's best"). A future edit must keep the three popup surfaces (list, banner, chip) on the same `_src`.

## Next (home stretch, deferred)
1. Server `compute-ennustus` full-year for the non-admin/cache path.
2. Season-window Jan-1 parity — client keeps GBIF Jan-1 (inflated window). See [[2026-07-05-gbif-partial-date-coercion]].
3. Parked: merged-panel coverage bar + row swatches (Item 2).
