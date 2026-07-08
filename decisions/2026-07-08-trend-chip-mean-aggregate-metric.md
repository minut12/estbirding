# Trend chip — mean-aggregate direction (Item 3)

**Status:** Done · 2026-07-08 (commit `2d722d7`)
**Scope:** the trend chip inside `buildProbPopup(cell, …)` in `public/maps/linnuliigid/index.html` — the per-square **map cell popup** header chip. Iframe HTML, not React; string-concat + inline styles.

## Decision / fact
The chip's direction is now a **future-vs-past mean aggregate**, not the old peak-relative position.

- Split this cell's own `cell.periods` at the current period: `earlier` = periods up to **and including** the current one; `later` = periods after it.
- `d = mean(later) − mean(earlier)`, computed on **`.probability` (0–100 scale)** — *not* `.pct` (that field name exists only on the serialized `_mappedPeriods` at line 13086, never on `cell.periods`).
- Deadband **ε = 3** (points on the 0–100 scale): `d < −ε` → `langeb ↘` (red) · `d > +ε` → `tõuseb ↗` (green) · `|d| ≤ ε` → `stabiilne` (neutral gray `#64748b`/`#f1f5f9`, **no arrow**).
- **No `later` periods** (current is last) → `_meanL` null → `langeb`.
- Mean uses `|| 0` for a missing/out-of-season period (a real 0% should drag the mean down) — deliberately unlike the peak max-finder's `|| 1`.

## Load-bearing invariants (binding)
- **`_mi` / `_ci` / `_mProb` index loop and `_bestBanner` (the "Parim aeg …" callout) are left byte-intact.** The callout stays **peak-relative** (`Parim aeg oli/on praegu/tuleb` by `_mi` vs `_ci`) and is independent of the chip. The new metric is computed into **new** vars (`_sumE/_cntE/_sumL/_cntL/_meanE/_meanL/_dTrend`); it must never repurpose the callout's variables.
- The chip's old `⬆ hooaja tipp` case is **removed** — "the peak is now" already lives in `_bestBanner` as `Parim aeg on praegu`. Don't reintroduce it in the chip.
- **Reads only existing fields** (`.probability` + `.isCurrent`, both already on `cell.periods`) → adds no field → **must not touch** the two-sided serializer/widen contract (`compute-ennustus/index.ts:649` ↔ `index.html:13098`). Client-only, per-square.

## Why this note exists
The `.probability`-not-`.pct` field name and the chip/callout variable-sharing are the two silent-breakage traps: an "honest" edit that reads `.pct` renders `undefined`, and one that reuses `_mi`/`_ci` for the aggregate would corrupt the still-peak-relative callout.

## Relates
Companion to [[2026-07-08-sidebar-panel-buildTop3PeriodsSection-redesign]] (Item 1) — that panel is peak-relative and monochrome; this chip is the map-popup counterpart. Verified via controlled `cell.periods` harness (Must-harksaba: earlier [54,34]→44, later [45,33,29]→35.667, d≈−8.33 → langeb).
