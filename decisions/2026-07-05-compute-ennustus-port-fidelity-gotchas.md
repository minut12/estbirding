# compute-ennustus port-fidelity gotchas

**Status:** Accepted · 2026-07-05
**Scope:** Non-obvious traps when porting `calculateProbabilities` to the `compute-ennustus` EF. Each is easy to get subtly wrong and silently produce plausible-but-off scores.

## 1. Port the INLINE scorer, not the legacy helper
`calculatePeriodProbabilities` (index.html:11907) and `assignRecordsToPeriods` (11890) are **off the live path** — the composite scorer inlines period construction at **12080–12200**. The legacy helper uses a *different* confidence formula (`/log1p(50)`, no floor) and would produce wrong scores. Port the inline path only. Confirm during build that nothing else calls the helper.

## 2. `score` vs `current_pct` diverge out of season
- `score` (= headlineProb, 12184–12187) falls back to the **max-pct period** when there is no current period.
- `current_pct` (13217) stays **null** when out of season.
So in-season: `score == current_pct`; out-of-season: `score > 0`, `current_pct = null`. The port must reproduce both, not collapse them.

## 3. `ennustus_cache` stores RAW output, not boosted
`overallScore = topCell.probability` (raw, cap 95). The +eBird/+eElu/+neighbour boosts (render 13947–13955) are applied live on read and never written. The EF writes raw. (eElu/neighbour boosts remain a render overlay → Phase-D flag: `occ7Elu`/neighbour state must survive the iframe read-only cutover or they silently zero.)

## 4. Jan-1 exclusion is path-selective
Exclude `month=1 & day=1` from the **date-binned** paths only: `calculateSeasonFromData` day-of-year set, `periodTotalCounts` (centrality), and `cellPeriodCounts` (the 0.4 blend term). Do **not** exclude from `occurrences.length`/`histPct` (spatial density) or from the confidence record count. (Ties into the gbif-partial-date-coercion resolution.)

## 5. Grid is built from SEASONAL occs; confidence + periods from ALL occs
`calculateProbabilities(gridCells, seasonal, data.occurrences, …)` — cells hold only the in-season subset, but `allOccs` (drives confidence and `periodTotalCounts`) is the full deduped set. Don't feed the same array to both.

## 6. `topCell` is the simple max-probability sort
`scored.sort((a,b)=>b.probability-a.probability)[0]` (12877) — **not** the `flagTopScoreCell` crown (12204), which is render-only. Cell center = `((latMin+latMax)/2, (lonMin+lonMax)/2)`.

## Relates
Phase C build step 2. Companion to the source-split, gbif-partial-date-coercion (+ its Resolution), and cadence/parity-contract notes.
