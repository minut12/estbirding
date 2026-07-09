# Hiireviu coverage — eElurikkus historical backfill (A) + co-history fold-in (B)

The v7 lag-tail fold-in ([[2026-07-09-compute-ennustus-v7-history-folds-elu-lag-tail]]) fixes species where GBIF *trails* eElurikkus in time, but not resident/abundant species whose eElurikkus history **overlaps** GBIF's date range yet is far denser. Hiireviu (*Buteo buteo*) exposed it: our DB held 963 obs (all 2026, May–Jul, zero Aug–Dec) while elurikkus.ee has **~47,000 records**, every month populated (Aug–Dec = 3,470 in 2024–25). The map was under-fed, not reflecting sparse reality.

**Three compounding causes:**
1. `elurikkus-bulk-refresh` is **page-1 / forward-only** — per-species `search?text=<name>` with no offset paging; it accrues newest obs going forward and never backfills history, so abundant species hold only current-year data.
2. The v7 lag-tail folds only elu `> gbifMax`, so eElurikkus data overlapping GBIF's date range (the dense breeding-season signal) is excluded by construction.
3. The season window is derived from the (spring-biased) GBIF distribution → too narrow, so summer/autumn read 0% even where data exists.

**Fix path, gated A → B:**
- **A — historical backfill of `elurikkus-bulk-refresh`.** Constraint: elurikkus's offset API caps at **~10,000** (HTTP 500 beyond), so a 47k-record species can't be reached by naive offset paging — use **date-window slicing** (or another cursor). Open decisions: backfill depth (all-time vs last N years), rate-limiting vs elurikkus.ee, one-time job vs a refresh mode, storage impact.
- **B — co-history fold-in + season (`compute-ennustus`).** Fold **all** coord-bearing elu (deduped vs GBIF) as a co-equal history source, not just the lag-tail; this also broadens `calculateSeasonFromData` so the season reflects the true active period. Design: cross-source dedup (elu/GBIF overlap — the lag-tail avoided this by construction) via date + rounded coords; weights and scoring formula unchanged. **B depends on A** (needs historical elu in the table); B's code may ship inert before A backfills.

**Verify (when built):** after A, `elurikkus_observations` for Hiireviu gains 2024/2025 + Aug–Dec rows; after B, Hiireviu's cached map reads year-round instead of 0% for half the year.

Links: [[2026-07-09-compute-ennustus-v7-history-folds-elu-lag-tail]].
