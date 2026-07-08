# Sidebar chart v2 — combo count-bars + probability line (Item 1)

**Status:** Done · 2026-07-08 (commit `fdfe16f`)
**Supersedes:** [[2026-07-08-curve-density-polish]] (the monochrome range-fill curve + white→red density strip).
**Scope:** the chart region of `buildTop3PeriodsSection(key)` in `public/maps/linnuliigid/index.html` — replaces **both** the P2 curve block and the P3 density-strip block with one combined chart. Iframe HTML; inline-style string-concat SVG.

## Decision / fact
One combo chart carries both signals; guard, hero, and honesty line untouched; `periods`/`curIdx`/`peak`/`peakIdx` reused from Step B, not recomputed. **The sidebar reads `.count` and `.pct` — NOT `.probability` (that is the popup / `cell.periods`).**

- **Geometry:** `viewBox "0 0 300 128"`, baseline y=120, band top y=20 (height 100). Slots `_slot = 276 / _n`, plotted x∈[12, 288] (4% inset each side of the 300 box). Slot centre `_cx = 12 + i·_slot + _slot/2` is both the bar centre and the line point.
- **Count bars (`Vaatlused`):** fill `#85B7EB`, width `0.72·_slot`, height `(count/_maxCount)·100` from the baseline, `rx=1.5`. A bar is **skipped** when its height ≤ 0.
- **Probability line (`Tõenäosus`):** one `#D85A30` polyline (`stroke-width 2.5`, round joins/caps) over the slot-centre points, scaled `0 → _maxPct` where `_maxPct = peak.pct`. This is a **0-anchored** scale (a genuine zero sits on the baseline) — deliberately unlike the retired curve's min→max range-fill, so bar and line share one honest vertical axis.
- **Markers on the line:** `peakIdx` = filled `#D85A30` dot + `tipp` above (`#993C1D`); `curIdx` = **hollow** dot (white fill, `#D85A30` stroke) + `praegu` above (`#854F0B`). When `curIdx === peakIdx`: a single hollow dot + one merged `praegu · tipp` label.
- **Legend row** above the SVG: `Vaatlused` (blue square) · `Tõenäosus` (orange line swatch).
- **Month-tick row** below the SVG: **kept verbatim** from the retired density block — first letter-run of each label (`/[A-Za-zÀ-ſ]+/`), shown only when it changes; a flex row of N cells inset `padding:0 4%` to align to the slots. Follows the label language automatically (Estonian `juuni`/`juuli` after [[2026-07-08-date-labels-estonianised-at-source]]).

## Guards
`_maxCount ≤ 0` → no bars (line only); `_maxPct ≤ 0` → no line/markers (bars only); both ≤ 0 → the SVG is omitted entirely. The thin-data early-return upstream still fires first for degraded/never-computed data.

## Why this note exists
This intentionally **drops** the range-fill amplification (decision B) and the standalone density heat-strip that the superseded note records — the combo chart's shared 0-anchored axis makes both obsolete. A future edit should not "restore" range-fill or the strip; the two signals now live on one axis by design.

## Relates
Companion to [[2026-07-08-trend-chip-mean-aggregate-metric]] (popup) — same `.pct`-vs-`.probability` scope split (sidebar `.pct` ↔ popup `.probability`). Month ticks are the seam through which [[2026-07-08-date-labels-estonianised-at-source]] shows in the sidebar for free.
