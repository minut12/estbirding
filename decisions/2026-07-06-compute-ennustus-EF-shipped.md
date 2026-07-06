# 2026-07-06 · compute-ennustus Edge Function shipped (Phase C step 2)

**Status:** deployed as v2 · smoke **CONFIRMED green** · client-parity **PENDING** (Jõgi-ritsiklind scan not yet run).

## What shipped
`supabase/functions/compute-ennustus/index.ts` — server-side port of the live Tõenäosus
composite scorer (`calculateProbabilities` + head of `computeProbForSpecies`, index.html
11702–12928). Writes **raw** scores to `ennustus_cache`; iframe becomes read-only in Phase D.

Contract:
- `POST`, `verify_jwt=false`, auth `x-webhook-secret == VAATLUSTE_WEBHOOK_SECRET`
  (project-wide secret, shared with `insert-toenaosus-raport` / `get-news-untranslated-v2`).
- Input `{offset, limit}` (default 0/25). Species processed sequentially; one upsert per chunk.
- Output `{processed, offset, limit, next_offset, done, exits:{A,B,C,ok}}`.
- Universe: `gbif_taxon_keys` ordered by `species_name`, sliced by offset/limit.
- Upsert on `species_name` (unique idx `ennustus_cache_species_uniq`; table PK is `id`); `updated_at` set explicitly (no DB trigger).

## Data sources
- HISTORY = `gbif_occurrences` filtered by **`species_name`** (paged 1000/req). *Not* `gbif_key`.
- FRESHNESS = `elurikkus_observations`, rolling 7d, noon-anchored `ageDays`, all coord'd cells.

## Defect fixed during bring-up (v1→v2)
Original architect spec keyed HISTORY on `gbif_key = taxon_key`. **`gbif_occurrences.gbif_key`
is the per-occurrence GBIF key — `UNIQUE`, 556,775 distinct = total rows — not the taxon key.**
That predicate matched 0 rows → every species Exit A. Root cause: architect error (assumed
`gbif_key == taxon_key` for diacritic-proofing). Fix: filter by `species_name`, verified
byte-for-byte identical across both tables (0 encoding drift → safe here). Marker bumped to v2.

## Divergence axes vs a live client scan (SIX — the contract listed three)
1. **All-cell freshness** — server credits every elurikkus obs' cell; client ≈ single marker cell. Server freshness ≥ client. (improvement)
2. **SEASON drops GBIF Jan-1** — `month=1 & day=1` excluded from the three date-binned paths only (`calculateSeasonFromData` doys, `periodTotalCounts`, `cellPeriodCounts`); *not* from `histPct`/`confidence` (gotcha #4).
3. **Five feeder-absent species** (Aed-lepalind, Jäälind, Koduvarblane, Taiga-rabahani, Turteltuvi) → 0 freshness rows → FRESHNESS 0.
4. **No eBird freshness** — Phase B reverted; client's `getEbirdCellStats` contribution absent server-side (moot when client eBird cache empty).
5. **GBIF-only HISTORY** — client folds elurikkus JSON + HTML-scraped history into `allOccs`; server has only durable `gbif_occurrences`. Lowers server `totalRecords`→`confidence`→score for elurikkus-history-heavy species. Remedy if unacceptable: durably ingest elurikkus history (future phase).
6. **`page_cap:3000` ingest truncation** *(new — found during bring-up)* — Phase A stored ≤3000 GBIF rows/species. Species with true counts >3000 (e.g. Aed-põõsalind, Aed-roolind, both exactly 3000) have truncated server HISTORY vs the client's live GBIF fetch. **Parity checks must use uncapped (<3000) species.** Remedy if needed: raise ingest `page_cap` + re-backfill.

## Corrected stale invariant
PostgREST row cap is **1000** (`authenticator.pgrst.db_max_rows=1000`), not 25. The "25-row cap"
note is stale. `get_all_avatars()`'s row-bypass rationale is obsolete; its scope-prefix filtering
rationale still stands.

## Verification
- **Smoke `{offset:0,limit:5}` — CONFIRMED (2026-07-06 ~09:50Z).** Returned `{processed:5, next_offset:5, done:false, exits:{A:2, B:0, C:0, ok:3}}` — exactly the predicted `{A:2, ok:3}`, so the runtime is v2 (all-A would have meant v1). Written rows validated: Aafrika harksaba + Aedporr → Exit A (0 GBIF); Aed-põõsalind score 82 (@0.1°), Aed-roolind 61 (@0.1°), Alk 29 (@0.15°). Grid sizes track GBIF volume; Alk demonstrates the headline-vs-best split (`score=current_pct=29` current period, `best_period_pct=47` Oct–Nov peak); seasons not January-anchored (Jan-1 exclusion working).
- **Full backfill — CONFIRMED (2026-07-06 ~10:47Z).** 18 chunks at `limit=25` via the resumable loop; no chunk errored. Connector verification: `ennustus_cache` = **449 rows = full `gbif_taxon_keys` universe**, 0 missing, 0 stale, 0 orphans. Breakdown `ok=334 · A=87 · B=0 · C=28` (exact match to the loop's summed exits). **0 species at the 95 cap** → healthy score spread (the composite-rebuild goal). All rows computed 10:45–10:47Z.
- **Client-parity — PENDING.** Target **Jõgi-ritsiklind** (offset 59; 2033 GBIF uncapped, 40 fresh elu; in-season). Server value: score 76, current_pct 76, best period "25 Jun–09 Jul", season "May 14–Jul 13", top cell (58.35, 26.85) @0.1°. Awaiting client `[PROB-SCORE]`; residual gap must be explained only by axes #1 + #5 (with minor #2). Anything else moving = port defect.

## Deferred / follow-ups
- **Scheduler (Phase C step 3):** 2×/day ~07:00 + ~19:00, ~55 min after the elurikkus refresh. Mechanism undecided — n8n Schedule→`splitInBatches`→HTTP vs Supabase pg_cron. Needs mechanism + build-version decision before build.
- **Phase D:** iframe read-only cutover (consumes `ennustus_cache`; render boosts `occ7Elu`/neighbour stay client-side).
- **Cosmetic debt:** two stale comments in `index.ts` still say "taxon key."
- **Secret:** `VAATLUSTE_WEBHOOK_SECRET` surfaced in a working session — rotate + update the n8n Header Auth credential (`J36l6pyvltfpqlJC`). *(Rotation deferred by owner.)*

## Relates
Phase C step 2 of "Tõenäosus compute → server-side" (A–D). Companion to the source-split,
gbif-partial-date-coercion (+ Resolution), cadence/parity-contract, port-fidelity-gotchas, and
species-prediction-vs-compute-ennustus notes.
