# Sidebar chart — taller frame + angled −40° month axis

**Status:** Done · 2026-07-08 (commit `3cbbd1d`)
**Scope:** `public/maps/linnuliigid/index.html` — the combo chart block + `_ax` axis builder in `buildTop3PeriodsSection`. Presentation only. Supersedes the frame geometry + axis description in [[2026-07-08-sidebar-chart-v2-combo]].

## Decision / fact
The combo chart frame grew **+25%**: `viewBox 128→160` (band `100→130`, baseline `120→150`). Month-axis labels are **angled −40°** in a 32px band (`_ax` container `height 12→32`, `font-size 8→9`; each span `white-space:nowrap` + `transform:translateX(-50%) rotate(-40deg);transform-origin:center;`). All 12 labels stay readable down to **~240px width**, the width where the horizontal single-row layout mashed in the field.

- **Why it renders taller:** the SVG has `width:100%;height:auto` and no fixed `height` attr / `max-height` / wrapper cap, so growing the viewBox aspect (300×160 vs 300×128) grows the rendered height 1.25×. The earlier "make it taller" attempt didn't land because the viewBox/baseline edits were never in this working copy (verified read-only before fixing).
- **Markers untouched:** bars/line rescaled to baseline 150 / band 130; markers read the already-scaled `_lys` and the band top stays at y=20, so nothing clips at top; the 10px below baseline (150→160) + the 32px angled band clear the bottom.
- **Axis history:** this **supersedes both** the staggered two-row axis (presentation fix) and the single-row 8px axis (revert `64bfd8d`) — the angle is the accepted solution for fitting 12 labels in the narrow panel.

## Open / why this note exists
`viewBox` is **held at 160** pending a live look; bump to **190** (same math: band 100→160, baseline →180) if it still reads small once seen live with the angle. The geometry constants (viewBox/baseline/band) and the axis must stay in sync — the axis `_lx = (12 + m*_slot + _slot/2)/3` percent is independent of the vertical scaling, so only the bar/line `*130` and `150-` need to move together if the height changes again.

## Relates
Companion to [[2026-07-08-full-year-yearBreakdown-p2-sidebar]] (what the chart plots). The retired month-tick row described in [[2026-07-08-sidebar-chart-v2-combo]] no longer exists — the axis is now the angled `_AB` label row.
