# Full-year probability periods — execution hand-off

**Status:** approved, Phase 1 drafted (not sent) · **Date:** 2026-07-14
**Spec:** "Full-year probability periods (client + compute-ennustus)", approved 2026-07-14.
**Depends on:** `f0997b5`, `1d91c7f` (shipped).
**Driver decision:** Claude Code drafts the Phase-1 Lovable prompt; user reviews before it is sent.
Execution runs in a **fresh session** (this one hit ~$154 / large context after two prior tasks).

This doc is self-contained: a clean session should be able to read only this file + the spec and run.

---

## 1. Confirmed diagnosis (read-only, 2026-07-14)

Verified against the actual code, not the spec's claims. All line numbers are real as of this date.

### Server — `supabase/functions/compute-ennustus/index.ts`

| Spec claim | Verified | Evidence |
|---|---|---|
| Grid built from `seasonal`, not `allOccs` | yes | `L614  const gridCells = buildEstoniaGrid(seasonal, probCellSize);` |
| Period template is season-bounded | yes | `L293  var periodTemplate = getSeasonPeriods(seasonInfo && seasonInfo.start, seasonInfo && seasonInfo.end);` |
| `isJan1` NOT source-gated x3, comments say "GBIF Jan-1" | yes | see list below |
| Redeploy marker | yes | `L2  // redeploy-marker: v8 ...` -> bump to **v9** |

The three `isJan1` sites (all check only the date; comment claims GBIF):
- `L112` (`calculateSeasonFromData`, DoY set): `if (d && !isJan1(d)) doys.push(getDayOfYear(d)); // PORT CHANGE: drop GBIF Jan-1`
- `L301` (`periodTotalCounts`, centrality): `if (isJan1(_od)) continue; // PORT CHANGE: drop GBIF Jan-1 from centrality`
- `L373` (`cellPeriodCounts`, 0.4 blend): `if (isJan1(_cod)) continue; // PORT CHANGE: drop GBIF Jan-1 from the 0.4 blend term`

**Extra de-risk (not in spec, load-bearing): `allOccs` items DO carry `.source`.**
`L571-575` maps GBIF rows with `source:'gbif'`; `L539` maps elurikkus with `source:'elurikkus'`;
`L583` concats; `L246` already uses `String(o.source||'').toLowerCase()`. So the spec's gate
`o.source==='gbif' && isJan1(d)` **binds correctly** — GBIF's fake Jan-1 drops, elurikkus's real
~3,514 Jan-1 rows survive. Had `.source` been absent the gate would have matched nothing (silent).
`cell.occurrences` derives from `seasonal` -> from `allOccs`, so it carries `.source` too.

Note the binning loops compute the window boundary at bin-time via
`getDayOfYear(periodTemplate[_pi].start)` / `.end` (`L304-305`, `L376-378`). This matters for the
Dec-tail sentinel — see the Lovable prompt.

### Client — `public/maps/linnuliigid/index.html` (deletion targets located)

- `getSeasonPeriods` — `L11978`
- `assignRecordsToPeriods` — `L12011` — **pre-existing dead code (0 callers). Leave it.**
- `calculatePeriodProbabilities` — `L12028` — delete
- `_YB_MONTHS` — `L12071` — delete
- `buildYearBreakdownForCell` — `L12072` — delete
- attach loop — `L13250` (`scored[_yb].yearBreakdown = buildYearBreakdownForCell(...)`) — delete
  (spec said ~13242; anchor not address)

**Not yet verified (Phase 2 must confirm read-only before editing):** the grid-from-`seasonal`
site (~L13228), that the client's `calculateProbabilities` date-binning loops have **no** Jan-1
guard, and the `_src` anchors (12641 / 12812 / 13807 / 13877). Only the deletion targets above were
located this pass.

---

## 2. Phase-1 Lovable prompt — DRAFT, review before sending

Scope: **`compute-ennustus` edge function only. Do NOT recompute all species — recompute only `Tait`.**
After Lovable returns, `get_diff` its SHA (standing gate: Lovable auto-commits to main and sweeps the
whole tree) and run the DB gate in section 3 before trusting it.

**Recompute-only-`Tait` mechanism (confirmed 2026-07-15).** "Recompute only `Tait`" is driven by
POSTing the deployed `compute-ennustus` function with `{"offset":364,"limit":1}` — `offset 364` is
`Tait`, and only `Tait`, in the species ordering. Auth header `x-webhook-secret:
$VAATLUSTE_WEBHOOK_SECRET` (the var name, never the literal). A successful single-row run returns
`{"processed":1,"offset":364,"limit":1,"next_offset":365,"done":false,"exits":{"A":0,"B":0,"C":0,"ok":1}}`.
`done:false` is expected for a one-row slice — it only means the full pagination is not exhausted, not
that the row failed. Use this to drive the Lovable prompt's "recompute only Tait" step from a shell
without touching the Phase-3 scheduler.

> **Prompt to Lovable:**
>
> Edit only `supabase/functions/compute-ennustus/index.ts`. Do not recompute all species yet.
>
> **A. Source-gate the GBIF Jan-1 filter at all three sites.** Each currently checks only the date;
> tag it with source so it drops GBIF's synthetic Jan-1 but keeps real elurikkus Jan-1 rows. The
> occurrence objects carry `.source` (`'gbif'` / `'elurikkus'`).
> - `L112` `calculateSeasonFromData`: change `if (d && !isJan1(d))` so a Jan-1 date is excluded
>   **only** when `String(occurrences[i].source||'').toLowerCase()==='gbif'`. Real (elurikkus) Jan-1
>   dates must now be pushed into the DoY set.
> - `L301` `periodTotalCounts`: `if (isJan1(_od)) continue;` ->
>   `if (String((allOccs[_oi]||{}).source||'').toLowerCase()==='gbif' && isJan1(_od)) continue;`
> - `L373` `cellPeriodCounts`: `if (isJan1(_cod)) continue;` ->
>   `if (String((cell.occurrences[_coi]||{}).source||'').toLowerCase()==='gbif' && isJan1(_cod)) continue;`
> - Update the three comments to say the truth ("drop **GBIF** Jan-1 only; keep real elurikkus Jan-1").
>
> **B. Add `getYearPeriods()` and use it in the scorer instead of `getSeasonPeriods`.**
> 26 windows of 14 days, starting 1 Jan. Window k (k=0..25) starts at `Jan 1 + 14k` days. Attach
> explicit **`startDoy`** and **`endDoy`** to every window; the **last window's `endDoy = 999`**
> (sentinel) so 17-31 Dec and the leap day are absorbed instead of dropped (26x14=364 leaves a tail).
> Labels keep the existing server dialect (`"01 Jan-15 Jan"`, English 3-letter, en-dash). Set
> `isCurrent:true` on the window containing today. Keep `getSeasonPeriods` in the file; `seasonInfo`
> still drives the display-only `Hooaeg:` line — do not remove it.
> - `L293`: `getSeasonPeriods(...)` -> `getYearPeriods()`.
> - **Change the three binning comparisons to use `period.startDoy` / `period.endDoy`** instead of
>   recomputing `getDayOfYear(period.start/end)` at `L304-305` and `L376-378` — otherwise the 999
>   sentinel never takes effect and the Dec tail is still dropped.
> - **Both boundary representations must coexist and are not interchangeable.** Each window carries its
>   boundary twice: as a `Date` (`start`/`end`, used only to render the human label) **and** as a
>   day-of-year integer (`startDoy`/`endDoy`, used only for binning). They deliberately diverge at the
>   Dec tail — the last window's label still reads a real date range, but its `endDoy` is the `999`
>   sentinel, which has no real-date equivalent. So every consumer must choose by purpose: labels from
>   the `Date` pair, binning from the `Doy` pair. Recomputing `getDayOfYear(period.end)` silently
>   re-derives the `Date` boundary (capped at 365/366) and discards the 999 — which is exactly the
>   Dec-tail drop. This is why B keeps both and never lets one stand in for the other.
>
> **C. Build the grid from `allOccs`, not `seasonal`.**
> `L614`: `buildEstoniaGrid(seasonal, probCellSize)` -> `buildEstoniaGrid(allOccs, probCellSize)`.
> Winter-only cells must now enter the grid. (`cell.gbifCount`/`eluCount` become all-year counts as a
> result — that is intended; the popup "... hooajal" copy is wrong afterward but that is Phase 4, not
> this change.)
>
> **D. Assert the no-drop invariant** inside the period-binning, dev-log only (no throw in prod path):
> `sum(periodCounts) === (# occurrences with a parseable date) - (# GBIF Jan-1 dropped)`. If it fails,
> `console.warn` the two sides. This catches a period whose window a record fell through.
>
> **E. Bump the redeploy marker** to `v9` with a one-line description (full-year 26-period template;
> source-gated Jan-1; grid from allOccs).
>
> Then recompute **only `Tait`** and stop. Report the SHA.

---

## 3. Gates (run in the fresh session, in order)

- **Phase 1 gate (after Lovable, Tait only):** `get_diff` the SHA first. Then `query_database`:
  - `jsonb_array_length(cells->0->'periods') = 26`
  - a `01 Jan-15 Jan` period exists on some cell with `obsCount > 0` (proves real Jan data survives).
  - **Measure cache-size delta** on this one row and extrapolate x334 before Phase 3.
- **Phase 2 (client, Claude Code):** mirror A/B/C, delete the second scorer
  (`buildYearBreakdownForCell`, `calculatePeriodProbabilities`, `_YB_MONTHS`, attach at 13250), keep
  `isJan1` (now needed in `calculateProbabilities`), make `buildTemporalBreakdown` let `isCurrent`
  **override** its month bucket (not `Math.max`), point `_src` at `cell.periods` (12641/12812) and
  `periods` (13807/13877). **Gate: admin == non-admin, same species+cell, month-for-month identical.**
  Drive it exactly like `1d91c7f`'s Phase 3 (static server on `public/`, inject `SUPABASE_CONFIG`
  postMessage with the anon key from `src/config/supabaseConfig.ts`, non-admin has no `?admin=1`).
- **Phase 3 (recompute all):** fire scheduler `wLXwtbbiABJ7jyGl` across offsets.
  Gate: `SELECT count(*) FROM ennustus_cells_cache WHERE jsonb_array_length(cells->0->'periods') <> 26;` -> **0**.
- **Phase 4 (copy):** fix the `... hooajal` string + anything the season->all-year shift falsified.
  Run `estonian-mcp:spell_check` on the replacement **before** it enters code or a prompt.

---

## 4. Risks (from spec, plus what this pass found)

- **`ennustus_cells_cache` roughly doubles** (13->26 periods + more surviving cells). ~54 MB / 334 rows
  today. Measure on the single-Tait row in the Phase-1 gate; extrapolate before Phase 3.
- **`.source` presence is now confirmed** — the source-gate is safe to write as specced.
- **Pure summer migrants** (e.g. `Suitsupääsuke`) now carry 26 periods, winter rows at the
  `Math.max(1,...)` floor. Spot-check one reads low, not as noise.
- **Two label dialects persist** (Estonian client / English server). `1d91c7f` made both bucketers
  tolerant. Do NOT unify here — it would force a second full recompute for cosmetics.
- **`assignRecordsToPeriods` (client 12011)** is pre-existing dead code. Not ours. Leave it.
- **Dec-tail sentinel** is the single most likely place for a silent bug: if the binning loops keep
  computing `getDayOfYear(period.end)` instead of reading `period.endDoy`, the 999 never applies and
  17-31 Dec vanish. The section 2-B step is explicit about this.
- **Dedup ties inherit GBIF source, so the new gate still drops some real Jan-1 (unquantified, not
  fixed here).** `allOccs = gbifRows.concat(eluHistory)` then `deduplicateOccurrences` keeps the first
  record per `date | lat×200 | lon×200` bucket, so GBIF wins every tie. A GBIF Jan-1 placeholder
  colliding with a real elurikkus Jan-1 record in the same bucket inherits `source:'gbif'` and is then
  dropped by the new gate. Unquantified — the join times out. The source-gate is still a strict
  improvement (it stops the wholesale deletion), so ship it as drafted; this residue is not a Phase-1
  fix. The real discriminator is time-of-day, which `elurikkus_observations.observed_at` discards at
  ingest (column is `date`, not `timestamptz`) even though eElurikkus supplies it — see section 5.

---

## 5. Open item — the actual fix (separate effort, NOT part of this spec)

**Preserve time-of-day in `elurikkus_observations`.** The Jan-1 problem is only *guessable* by source
because the timestamp was thrown away at ingest: `observed_at` is `date`, not `timestamptz`, so a real
elurikkus Jan-1 observation and a GBIF Jan-1 placeholder look identical once bucketed. eElurikkus does
supply the time-of-day. Change the column to `timestamptz` (or add a timestamp column), backfill /
re-ingest from eElurikkus, and the discriminator becomes real (placeholder = bare date/midnight; real
= a genuine time) instead of a source flag that dedup can flip. Schema change + backfill re-run. Its
own effort; do not fold it into the full-year-periods spec.
