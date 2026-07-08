# Sidebar curve + density polish (Item 1)

**Status:** Done · 2026-07-08 (commit `e653837`)
**Scope:** the P2 curve block and P3 density block inside `buildTop3PeriodsSection(key)` in `public/maps/linnuliigid/index.html`. Iframe HTML; string-concat + inline styles. Companion to [[2026-07-08-sidebar-panel-buildTop3PeriodsSection-redesign]].

## Decision / fact
Three legibility changes to the two lower layers of the sidebar species panel; guard, hero, and honesty line untouched; `periods`/`curIdx`/`peak`/`peakIdx` reused, not recomputed.

- **Range-filled curve (decision B).** viewBox `0 0 300 120`; `y = 108 − ((pct − _minPct) / (peak.pct − _minPct)) · 96`, where `_minPct` = min pct across periods and `_maxPct = peak.pct`. The band spans **min→max**, so shape is maximally legible. **Accepted tradeoff:** this by-design **amplifies genuinely flat seasons** (a 29–32 spread swings the whole band). **No floor** was added — that amplification is the accepted cost of B, not a bug. Guards: `_maxPct <= 0` omits the curve; `_maxPct === _minPct` (all equal) draws a flat line at `y = 60` to avoid ÷0.
- **Merged `praegu · tipp` marker.** When `curIdx === peakIdx`, render a **single** amber dot + one merged `praegu · tipp` label placed **below** the dot (peak sits at band top y=12, so a label above would clip). Otherwise the two separate markers (neutral `tipp` above, amber `praegu` below) as before. This fixes the dot/label collision when the peak is the current period.
- **Density month ticks.** A flex row under the strip (one `flex:1` cell per period, same `gap` → aligned to segments). Each cell shows the month **only when it differs from the previous period's**, parsed from the label's **first letter-run** (`/[A-Za-zÀ-ſ]+/`). Language-agnostic: matches English `Jul` and Estonian `juuli` alike, so the ticks **follow the label language automatically** (now Estonian after [[2026-07-08-date-labels-estonianised-at-source]]). Unparseable label → empty cell, never throws.

## Why this note exists
The range-fill amplification is a deliberate design choice that looks like a bug on flat seasons — a future edit might "fix" it by adding a floor and quietly break decision B. The merged-marker branch and the first-letter-run tick parser are the two non-obvious mechanics.

## Relates
Curve/density read the sidebar `periods` (the 13103 `{label,pct,count,isCurrent}` mapping), sourced from the species' single top cell, not the clicked square. The month-tick parser is what makes the [[2026-07-08-date-labels-estonianised-at-source]] fix show through in the sidebar for free.
