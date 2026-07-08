# Sidebar species panel — buildTop3PeriodsSection redesign (Item 1)

**Status:** Done · 2026-07-08 (commit `1d03a64`)
**Scope:** `buildTop3PeriodsSection(key)` in `public/maps/linnuliigid/index.html` — the per-species side-panel period section. Iframe HTML, not React; string-concat + inline styles.

## Decision / fact
Ranked `1/2/3` list removed. Function rewritten as: thin-data guard → else full-data stack.

- **Thin-data guard** (early return): fires when `periods` missing, `length <= 1`, or the sole entry has no numeric `count` (covers the cloud-restored degraded path `[{pct,isCurrent,label:'current'}]`). Renders a fallback nudge (`Arvuta tõenäosus`) wired to the existing `.top3-placeholder` delegated handler → **reuses `window.toggleProbability`** (same fn the Prob button uses); no new handler.
- **Best-upcoming hero** — `upcoming` = highest-`pct` period strictly after `curIdx` with `pct > 0`.
  - upcoming exists → `Parim aeg veel ees` (amber).
  - no upcoming, `peakIdx === curIdx` → `Parim aeg on praegu` (amber) — the peak is now.
  - no upcoming, peak already passed → `Parim aeg on möödas` (gray).
  - **Labels-only, no countdown**: the mapping at line 13086 keeps only `{label,pct,count,isCurrent}` and drops the source period `start`/`end` Dates, so there is no raw date to compute `X päeva pärast`. Never parse the label string.
- **Peak-position honesty line**: `hooaja tipp {oli|on|tuleb} {peak.label} · {peak.pct}%`, tense by `peakIdx` vs `curIdx`. Must agree with the hero (praegu↔on, möödas↔oli).
- **Monochrome probability curve**: SVG polyline, `#94a3b8`; `praegu` (amber dot) and `tipp` (neutral dot) marked. Shape carries level.
- **Observation-density heat-strip**: one segment per period, own **white→red** scale (`#F1EFE8 → #D85A30`, `vähe → palju`) encoding `count`, with a `täna` tick on `curIdx`.

## Colour contract (binding)
Colour is spent **only** on the density strip (observation count). Probability stays **monochrome in-panel** (curve); the green/amber/red probability heat lives **only on the map**, never in this panel. Density thresholds `0 / 0.33 / 0.66` are illustrative — tunable later.

## Why this note exists
The three surfaces (hero, curve, strip) are additive layers of one feature interleaved in a single function and shipped as one atomic commit. The colour contract and the labels-only/no-countdown constraint are the load-bearing invariants a future edit could silently violate.

## Relates
Reads per-square `cell.periods` shape but sources the species' single top cell (line 13054), not the clicked square. Optional follow-up: restore `X päeva pärast` by carrying `startDate` through the line-13086 mapping. Companion to the compute-ennustus / Tõenäosus notes.
