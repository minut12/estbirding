# GBIF partial-date coercion in `gbif-bulk-refresh`

**Status:** Accepted · 2026-07-05 · commit `e86ced9`
**Scope:** GBIF HISTORY ingest (Phase A) → `gbif_occurrences.observed_at`.

## Context
GBIF's `eventDate` is not always a full date — it can be year-only (`"2016"`) or year-month (`"2016-05"`). The original ingest did `String(o.eventDate).slice(0,10)`, which passes those fragments straight to Postgres. Because each species is written as a single batch `upsert`, one malformed date row throws and **fails the entire species** — observed live as `Alk` landing 0 rows with `invalid input syntax for type date: "2016"`.

## Decision
`gbif-bulk-refresh` builds `observed_at` from GBIF's **structured integer fields** (`o.year` / `o.month` / `o.day`), coercing partial dates to the first of the known period (year-only → `YYYY-01-01`, year-month → `YYYY-MM-01`), with a strict `^\d{4}-\d{2}-\d{2}$` `eventDate` fallback. The result is **always a valid `YYYY-MM-DD` or `null`** — the date-type crash class is eliminated, so no single malformed row can ever drop a whole species again.

## Rationale
- Preserves the **year**, which is the key the 10-year HISTORY window filters on — the record stays in HISTORY rather than being lost.
- Verified: after the fix, `Alk` went 0 → 168 rows (`min 2016-01-01`, the coerced year-only record), `error_count` → 0.

## Trade-off — load-bearing for Phase C
Year-only records receive a **synthetic Jan-1 month**. GBIF populates real month/day for the large majority of observation records, so this affects only a sparse tail — but it means **Phase-C SEASON scoring must treat coerced dates as month-unknown**, not trust the synthetic month, or migration-timing signal will be biased toward January for that tail. (The `page_cap:3000` temporal-truncation for very common species is a separate, already-logged Phase-C watch-item.)

## Resolution (Phase C · 2026-07-05)

**The gap.** `gbif_occurrences` stores no precision flag (`species_name, species_lat, gbif_key, observed_at, lat, lon`). A stored `2016-01-01` from a year-only coercion is byte-identical to a genuine 1-January observation, so "treat coerced dates as month-unknown" is uncomputable per-record.

**Decision.** SEASON handles this **wholesale**: every record with `month = 1 AND day = 1` is **excluded from SEASON month-centrality**, and **retained in HISTORY** (year + coordinates are all HISTORY needs). No precision flag, no Phase-A change, no 556k-row backfill.

**Why it's acceptable.** Genuine 1-Jan observations are ~0.3% of dated records in a low-activity Estonian midwinter, and SEASON carries only 5% of the composite weight — so the real signal discarded is negligible, while the entire coerced tail is correctly neutralized.

**Consequence — a deliberate server/client divergence.** The live client reads GBIF directly (real partial dates); the server reads the coerced table and drops Jan-1 from SEASON. Phase-C parity-checking **must expect** this divergence on winter species — it is correct behaviour, not a compute bug. (See the compute-ennustus cadence + parity-contract note.)

## Relates
Part of Phase A (GBIF HISTORY ingest); see `2026-07-05-toenaosus-history-source-gbif-not-elurikkus.md` for why HISTORY sources from GBIF. The compute EF in Phase C reads `observed_at`; anything that derives month/season from it must apply the month-unknown rule above.
