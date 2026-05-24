# Fix: Probability Grid — Two Bugs

## File to edit
`public/maps/linnuliigid/index.html`

## Step 1 — Diagnose: read the code first

Search the file for ALL of these keywords and read the surrounding 30 lines for each:

- `freshness`
- `history` (near `score` or `prob`)
- `nearbyElurikkus` or `elurikkus.*near` or `near.*elurikkus`
- `cellProb` or `computeProb` or `buildProb` or `seasonProb`
- `CELL_SIZE` or `cellSize` or `gridSize`
- `gbifCount` or `gbif.*season` or `inSeason`
- the function that calls `.addTo(map)` or `L.rectangle` for the grid cells
- the condition that decides whether to RENDER a cell (skip/continue logic)

Read and understand the full probability pipeline before making any changes.

---

## Bug 1 — eElurikkus "nearby" marker boosting cells that have GBIF 0 in season

### Symptoms (from screenshots)
- A cell with **GBIF 0 in season** shows **23% probability** purely from
  "eElurikkus: marker ~16 km away · 05.04.2026 · 15 obs (7d)"
- Score breakdown: "23% freshness" — history component = 0
- A cell ~16 km from the nearest eElurikkus marker should NOT get a freshness
  boost. Only cells where the eElurikkus marker is **inside the cell** (or at
  most touching the cell boundary) should receive any freshness contribution.

### Fix rules
1. **Freshness boost must only apply when the eElurikkus marker falls INSIDE
   the cell's bounding box** (lat/lon within the cell's south/north/west/east).
   A "nearby" radius match is wrong here — remove or tighten any radius-based
   proximity check that crosses cell boundaries.
2. If a cell has **gbifSeasonCount === 0 AND no eElurikkus marker inside it**,
   the cell should have 0% probability and should NOT be rendered at all.
3. If a cell has **gbifSeasonCount === 0 BUT an eElurikkus marker IS inside it**,
   it MAY be rendered using only the freshness score — that is correct behaviour.
   The popup should say "GBIF 0 in season" and show the freshness-only score.

### Implementation
- Find the `nearbyElurikkus` (or equivalent) lookup. Change the match condition
  from a radius/distance check to a strict **point-in-cell** check:
```js
  // WRONG — radius-based, bleeds into adjacent cells:
  const dist = haversine(markerLat, markerLon, cellCenterLat, cellCenterLon);
  if (dist < SOME_RADIUS_KM) { /* boost */ }

  // CORRECT — point-in-cell:
  const markerInCell = (
    markerLat >= cellSouth && markerLat < cellNorth &&
    markerLon >= cellWest  && markerLon < cellEast
  );
  if (markerInCell) { /* boost */ }
```
- Make this change wherever the eElurikkus marker position is matched to a grid
  cell for the purposes of computing or displaying the freshness score.

---

## Bug 2 — Far fewer grid squares visible than before

### Symptoms
- Previously the probability layer painted squares across the whole Estonia map
  for any cell with historical GBIF data.
- Now only a handful of squares appear.

### Fix rules
- Find the loop or filter that decides which cells get a rendered rectangle.
- The render condition should be:
```js
  // Render a cell if it has ANY historical GBIF observations in season
  // OR if an eElurikkus marker is inside it (even if GBIF = 0)
  const shouldRender = (gbifSeasonCount > 0) || markerInCell;
```
- Do NOT gate rendering on `probability > someThreshold` unless the threshold
  is very low (< 1%). A 1% cell with historical data is still useful to show.
- Do NOT skip cells just because the current-period bin count is 0 —
  the season total (all periods) is what determines whether to render.
- Check: was a `> 0` filter recently changed to `>= someMinimum` or was a new
  minimum-cell-count guard added? Revert or relax it.
- Check: is the set of GBIF cells being iterated still the FULL dataset, or was
  a recent change accidentally filtering it down before the render loop?
  Log `console.log('total cells to render:', cells.length)` and verify it is
  in the thousands (matching the "3709 in season · 1554 cells" shown in the
  species info panel).

---

## Step 2 — Apply the fixes

After reading and understanding the code, apply the minimum necessary changes:
1. Replace proximity/radius eElurikkus matching with strict point-in-cell.
2. Restore the render condition so all cells with gbifSeasonCount > 0 are drawn.
3. Do NOT change the probability formula itself, the color thresholds, the popup
   HTML structure, or any unrelated logic.

---

## Step 3 — Verify

After the fix, confirm by reading back the changed sections:
- The cell render loop should iterate all cells with season data.
- The freshness lookup should use `markerInCell` not a distance radius.
- The popup for a cell with GBIF 0 + nearby (but outside) eElurikkus marker
  should show 0% (or not render at all), NOT 23%.
- The popup for a cell with GBIF 0 + eElurikkus marker INSIDE the cell may
  still show a freshness-only score — that is correct.
